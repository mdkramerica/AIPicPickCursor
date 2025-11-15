import type { Request, Response, NextFunction, Express } from "express";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { storage } from "./storage";
import { convertKitService } from "./convertKitService";
import { AppError } from "./middleware/errorHandler";
import { logger } from "./middleware/logger";

// Extend Express Request type to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      kindeUser?: {
        id: string;
        email?: string;
        given_name?: string;
        family_name?: string;
        picture?: string;
      };
    }
  }
}

const KINDE_DOMAIN = process.env.KINDE_DOMAIN;

if (!KINDE_DOMAIN) {
  throw new Error("KINDE_DOMAIN environment variable is required");
}

// Create JWKS endpoint for token verification
const JWKS = createRemoteJWKSet(new URL(`${KINDE_DOMAIN}/.well-known/jwks.json`));

/**
 * Middleware to verify Kinde JWT tokens
 * Extracts token from Authorization header and validates it
 */
export const isAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    logger.info('Authentication check', {
      path: req.path,
      method: req.method,
      hasAuthHeader: !!authHeader,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    });

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn('Authentication failed: No valid authorization header', {
        path: req.path,
        method: req.method,
        hasAuthHeader: !!authHeader,
        headerStartsWith: authHeader?.substring(0, 20) || 'none'
      });
      throw new AppError(401, "No authorization token provided");
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    
    logger.info('JWT verification attempt', {
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 20) + "...",
      issuer: KINDE_DOMAIN
    });

    // Verify JWT token with Kinde's public keys
    // Note: Kinde tokens for PKCE flow don't have an audience claim, so we only verify issuer
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: KINDE_DOMAIN,
    });

    // Extract user information from token
    const userId = payload.sub;

    if (!userId) {
      logger.error('JWT verification failed: Missing user ID', {
        payloadKeys: Object.keys(payload),
        hasSub: !!payload.sub,
        hasEmail: !!payload.email
      });
      throw new AppError(401, "Invalid token: missing user ID");
    }

    logger.info('JWT verified successfully', {
      userId,
      hasEmail: !!payload.email,
      hasName: !!(payload.given_name || payload.family_name)
    });

    // Attach user information to request
    req.userId = userId;
    req.kindeUser = {
      id: userId,
      email: payload.email as string | undefined,
      given_name: payload.given_name as string | undefined,
      family_name: payload.family_name as string | undefined,
      picture: payload.picture as string | undefined,
    };

    // Ensure user exists in database
    let user = await storage.getUser(userId);
    const isFirstLogin = !user;

    if (!user) {
      logger.info('First-time user login, syncing to database', {
        userId,
        email: req.kindeUser.email,
        firstName: req.kindeUser.given_name,
        lastName: req.kindeUser.family_name
      });

      try {
        await syncUserToDatabase(userId, {
          email: req.kindeUser.email,
          firstName: req.kindeUser.given_name,
          lastName: req.kindeUser.family_name,
          profileImageUrl: req.kindeUser.picture,
        });
        logger.info('User synced to database successfully', { userId });
      } catch (syncError) {
        logger.error('Failed to sync user to database', {
          userId,
          error: syncError instanceof Error ? syncError.message : 'Unknown error',
          stack: syncError instanceof Error ? syncError.stack : undefined
        });
        throw new AppError(500, "Failed to create user account. Please try again.");
      }
    }

    // Check if user has ConvertKit settings to determine if they need auto-subscription
    const convertKitSettings = await storage.getConvertKitSettings(userId);
    
    // Auto-subscribe on first login if user has email and no ConvertKit settings
    if (isFirstLogin && req.kindeUser.email && !convertKitSettings && process.env.CONVERTKIT_AUTO_SUBSCRIBE === 'true') {
      try {
        logger.info('Auto-subscribing new user to ConvertKit', { 
          userId, 
          email: req.kindeUser.email 
        });

        // Subscribe user to ConvertKit with welcome email and newsletter tag
        const response = await convertKitService.subscribeUser({
          email: req.kindeUser.email,
          first_name: req.kindeUser.given_name,
          tags: [
            parseInt(process.env.CONVERTKIT_TAG_ID_PHOTO_ANALYSIS || '11856346'),
            parseInt(process.env.CONVERTKIT_TAG_ID_NEWSLETTER || '11856347')
          ]
        });

        if (response.success && response.data) {
          logger.info('Successfully auto-subscribed user to ConvertKit', { 
            userId, 
            subscriberId: response.data.id,
            email: req.kindeUser.email 
          });

          // Create ConvertKit settings record
          await storage.createConvertKitSettings({
            userId,
            subscriberId: response.data.id.toString(),
            emailConsent: true, // Auto-subscribed users get email consent
            marketingConsent: true, // Auto-subscribed users get marketing consent
            autoSubscribed: true, // Mark as auto-subscribed
            tags: [
              process.env.CONVERTKIT_TAG_ID_PHOTO_ANALYSIS || '11856346',
              process.env.CONVERTKIT_TAG_ID_NEWSLETTER || '11856347'
            ]
          });
        }
      } catch (error) {
        logger.error('Failed to auto-subscribe user to ConvertKit', { 
          userId, 
          email: req.kindeUser.email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Don't block login if ConvertKit fails, just log the error
      }
    }

    logger.info('Authentication successful', {
      userId,
      path: req.path,
      method: req.method
    });

    next();
  } catch (error) {
    if (error instanceof AppError) {
      logger.warn('AppError in authentication', {
        statusCode: error.statusCode,
        message: error.message,
        path: req.path,
        method: req.method
      });
      return res.status(error.statusCode).json({ message: error.message });
    }

    logger.error('Unexpected authentication error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      path: req.path,
      method: req.method
    });
    
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

/**
 * Sync user data from Kinde to our database
 */
export async function syncUserToDatabase(
  userId: string,
  userData: {
    email?: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
  }
) {
  try {
    // Use upsertUser to create or update the user
    await storage.upsertUser({
      id: userId,
      email: userData.email || "",
      firstName: userData.firstName || "",
      lastName: userData.lastName || "",
      profileImageUrl: userData.profileImageUrl || "",
    });
  } catch (error) {
    console.error("Error syncing user to database:", error);
    throw error;
  }
}

/**
 * Setup function for compatibility (Clerk had this)
 * Kinde doesn't need Express-level setup, but we keep this for API consistency
 */
export function setupAuth(app: Express) {
  // Kinde authentication is handled via JWT tokens in the Authorization header
  // No Express-level middleware needed like Clerk's setupAuth
  console.log("Kinde authentication configured");
}
