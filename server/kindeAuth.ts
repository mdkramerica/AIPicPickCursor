import type { Request, Response, NextFunction, Express } from "express";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { storage } from "./storage";
import { AppError } from "./middleware/errorHandler";

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
const KINDE_AUDIENCE = process.env.KINDE_REDIRECT_URL; // Usually same as redirect URL

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

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError(401, "No authorization token provided");
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify JWT token with Kinde's public keys
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: KINDE_DOMAIN,
      audience: KINDE_AUDIENCE,
    });

    // Extract user information from token
    const userId = payload.sub;

    if (!userId) {
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

    // Ensure user exists in database
    let user = await storage.getUser(userId);

    if (!user) {
      // Create user in database if they don't exist
      await syncUserToDatabase(userId, {
        email: req.kindeUser.email,
        firstName: req.kindeUser.given_name,
        lastName: req.kindeUser.family_name,
        profileImageUrl: req.kindeUser.picture,
      });
    }

    next();
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error("Authentication error:", error);
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
