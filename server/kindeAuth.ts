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

    console.log("🔐 Auth check - Header present:", !!authHeader);

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ Auth failed: No authorization token");
      throw new AppError(401, "No authorization token provided");
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    console.log("🔐 Auth check - Token received:", token.substring(0, 20) + "...");

    // Verify JWT token with Kinde's public keys
    // Note: Kinde tokens for PKCE flow don't have an audience claim, so we only verify issuer
    console.log("🔐 Verifying JWT with issuer:", KINDE_DOMAIN);
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: KINDE_DOMAIN,
    });
    console.log("✅ JWT verified successfully, user:", payload.sub);

    // Extract user information from token
    const userId = payload.sub;
    console.log("🔐 Extracted userId:", userId);

    if (!userId) {
      console.log("❌ No userId in token");
      throw new AppError(401, "Invalid token: missing user ID");
    }

    // Attach user information to request
    req.userId = userId;
    req.kindeUser = {
      id: userId,
      email: payload.email as string | undefined,
      given_name: payload.given_name as string | undefined,
      family_name: payload.family_name as string | undefined,
      picture: payload.picture as string | undefined,
    };
    console.log("🔐 Kinde user data:", req.kindeUser);

    // Ensure user exists in database
    console.log("🔐 Checking if user exists in database...");
    let user = await storage.getUser(userId);
    console.log("🔐 User from database:", user ? "found" : "not found");

    const isFirstLogin = !user;

    if (!user) {
      // Create user in database if they don't exist
      console.log("🔐 Syncing user to database...");
      await syncUserToDatabase(userId, {
        email: req.kindeUser.email,
        firstName: req.kindeUser.given_name,
        lastName: req.kindeUser.family_name,
        profileImageUrl: req.kindeUser.picture,
      });
      console.log("🔐 User synced successfully");
    }

    // Check if user has ConvertKit settings to determine if they need auto-subscription
    const convertKitSettings = await storage.getConvertKitSettings(userId);
    
    // Auto-subscribe on first login if user has email and no ConvertKit settings
    if (isFirstLogin && req.kindeUser.email && !convertKitSettings && process.env.CONVERTKIT_AUTO_SUBSCRIBE === 'true') {
      try {
        logger.info('🚀 Auto-subscribing new user to ConvertKit', { 
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
          logger.info('✅ Successfully auto-subscribed user to ConvertKit', { 
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
        logger.error('❌ Failed to auto-subscribe user to ConvertKit', { 
          userId, 
          email: req.kindeUser.email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Don't block login if ConvertKit fails, just log the error
      }
    }

    console.log("✅ Authentication successful, calling next()");
    next();
  } catch (error) {
    if (error instanceof AppError) {
      console.log("❌ AppError caught:", error.message);
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error("❌ Authentication error:", error);
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
