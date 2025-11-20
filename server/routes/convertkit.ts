import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../kindeAuth";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { apiLimiter } from "../middleware/rateLimiter";
import { logger } from "../middleware/logger";
import { convertKitService } from "../services/convertKitService";
import { convertKitWebhookHandler, parseWebhookBody, isValidWebhookEvent } from "../services/convertKitWebhooks";

const router = Router();

// ConvertKit webhook endpoint
router.post('/webhooks/convertkit', asyncHandler(async (req, res) => {
  try {
    const signature = req.headers['x-convertkit-signature'] as string;
    const body = req.body;

    // Verify webhook signature
    if (!convertKitWebhookHandler.verifySignature(JSON.stringify(body), signature)) {
      throw new AppError(401, "Invalid webhook signature");
    }

    // Parse and validate webhook event
    const event = parseWebhookBody(JSON.stringify(body));
    if (!event || !isValidWebhookEvent(event)) {
      throw new AppError(400, "Invalid webhook event");
    }

    // Handle the webhook event
    await convertKitWebhookHandler.handleWebhook(event);

    res.json({ success: true });
  } catch (error) {
    logger.error('ConvertKit webhook error', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      body: req.body,
    });
    throw error;
  }
}));

// ConvertKit API routes
router.post('/convertkit/subscribe', apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
  const userId = req.userId;
  const { email, firstName, consent } = req.body;

  if (!email) {
    throw new AppError(400, "Email is required");
  }

  if (!consent) {
    throw new AppError(400, "Email consent is required");
  }

  try {
    // Log the subscription attempt with sanitized data
    logger.info('ConvertKit subscription attempt', { 
      userId,
      email,
      firstName,
      hasConsent: !!consent,
      hasMarketingConsent: consent.marketing || false,
      tagIds: [
        parseInt(process.env.CONVERTKIT_TAG_ID_PHOTO_ANALYSIS || '0'),
        parseInt(process.env.CONVERTKIT_TAG_ID_NEWSLETTER || '0'),
      ].filter(id => id > 0),
    });

    // Subscribe to ConvertKit
    const response = await convertKitService.subscribeUser({
      email,
      first_name: firstName,
      tags: [
        parseInt(process.env.CONVERTKIT_TAG_ID_PHOTO_ANALYSIS || '0'),
        parseInt(process.env.CONVERTKIT_TAG_ID_NEWSLETTER || '0'),
      ].filter(id => id > 0),
    });

    logger.info('ConvertKit subscription response', {
      userId,
      email,
      success: response.success,
      subscriberId: response.data?.id,
    });

    if (response.success) {
      // Store user's ConvertKit settings
      await storage.createConvertKitSettings({
        userId,
        subscriberId: response.data?.id.toString() || '',
        emailConsent: true,
        marketingConsent: consent.marketing || false,
        autoSubscribed: false, // Manual subscription, not auto-subscribed
        tags: [
          process.env.CONVERTKIT_TAG_ID_PHOTO_ANALYSIS,
          process.env.CONVERTKIT_TAG_ID_NEWSLETTER,
        ].filter((tag): tag is string => Boolean(tag)),
      });

      logger.info('ConvertKit settings saved to database', { userId });

      // Send welcome email
      try {
        await convertKitService.sendPhotoAnalysisEmail({
          sessionId: 'welcome',
          campaignType: 'welcome',
          userEmail: email,
          userName: firstName,
        });
        logger.info('Welcome email sent', { userId, email });
      } catch (emailError) {
        // Don't fail the subscription if the welcome email fails
        logger.error('Failed to send welcome email (non-fatal)', {
          userId,
          email,
          error: emailError instanceof Error ? emailError.message : 'Unknown error',
          stack: emailError instanceof Error ? emailError.stack : undefined,
        });
      }
    }

    res.json(response);
  } catch (error) {
    logger.error('ConvertKit subscription failed', { 
      userId,
      email,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      errorDetails: error && typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error),
    });
    
    // Provide more specific error message to the client
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new AppError(500, `Failed to subscribe to email list: ${errorMessage}`);
  }
}));

router.get('/convertkit/settings', apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
  const userId = req.userId;
  const settings = await storage.getConvertKitSettings(userId);
  res.json(settings || null);
}));

router.patch('/convertkit/settings', apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
  const userId = req.userId;
  const { emailConsent, marketingConsent } = req.body;

  const settings = await storage.updateConvertKitSettings(userId, {
    emailConsent,
    marketingConsent,
  });

  // If user unsubscribes, update ConvertKit
  if (!emailConsent && settings?.subscriberId) {
    try {
      await convertKitService.unsubscribeSubscriber(settings.subscriberId);
    } catch (error) {
      logger.error('Failed to unsubscribe from ConvertKit', { 
        userId,
        subscriberId: settings.subscriberId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  res.json(settings);
}));

router.post('/convertkit/send-analysis-email', apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
  const userId = req.userId;
  const { sessionId, campaignType } = req.body;

  if (!sessionId) {
    throw new AppError(400, "Session ID is required");
  }

  // Get session and user info
  const session = await storage.getSession(sessionId);
  if (!session || session.userId !== userId) {
    throw new AppError(404, "Session not found");
  }

  const user = await storage.getUser(userId);
  const settings = await storage.getConvertKitSettings(userId);

  if (!settings?.emailConsent) {
    throw new AppError(400, "User has not consented to emails");
  }

  try {
    // Get analysis results
    const photos = await storage.getPhotosBySession(sessionId);
    const bestPhoto = photos.find(p => p.isSelectedBest);

    const response = await convertKitService.sendPhotoAnalysisEmail({
      sessionId,
      campaignType: campaignType || 'analysis_complete',
      userEmail: user?.email || '',
      userName: user?.firstName || '',
      analysisResults: {
        photoCount: photos.length,
        bestPhotoUrl: bestPhoto?.fileUrl,
        qualityScore: bestPhoto?.qualityScore ? parseFloat(bestPhoto.qualityScore) : undefined,
        facesDetected: photos.reduce((total, photo) => {
          const analysis = photo.analysisData as any;
          return total + (analysis?.faces?.length || 0);
        }, 0),
      },
    });

    res.json(response);
  } catch (error) {
    logger.error('Failed to send analysis email', { 
      sessionId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new AppError(500, "Failed to send analysis email");
  }
}));

export default router;

