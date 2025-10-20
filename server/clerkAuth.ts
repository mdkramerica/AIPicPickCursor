import { clerkMiddleware, requireAuth, getAuth } from "@clerk/express";
import type { Express, RequestHandler } from "express";
import { storage } from "./storage";

/**
 * Setup Clerk authentication middleware
 */
export function setupAuth(app: Express) {
  // Apply Clerk middleware to all routes
  // This makes auth information available on req.auth
  app.use(clerkMiddleware());
}

/**
 * Middleware to require authentication
 * Returns 401 if user is not authenticated
 */
export const isAuthenticated: RequestHandler = (req, res, next) => {
  const auth = getAuth(req);
  
  if (!auth || !auth.userId) {
    return res.status(401).json({ message: "Unauthorized - Authentication required" });
  }
  
  // Attach userId to request for easy access in routes
  (req as any).userId = auth.userId;
  next();
};

/**
 * Sync Clerk user to our database
 * Call this after user signs up or when needed
 */
export async function syncUserToDatabase(userId: string, userData: {
  email?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
}) {
  await storage.upsertUser({
    id: userId,
    email: userData.email || null,
    firstName: userData.firstName || null,
    lastName: userData.lastName || null,
    profileImageUrl: userData.profileImageUrl || null,
  });
}

/**
 * Webhook handler for Clerk events
 * Use this to keep user data in sync
 */
export const handleClerkWebhook: RequestHandler = async (req, res) => {
  try {
    const event = req.body;
    
    // Handle different Clerk events
    switch (event.type) {
      case "user.created":
      case "user.updated": {
        const user = event.data;
        await syncUserToDatabase(user.id, {
          email: user.email_addresses?.[0]?.email_address,
          firstName: user.first_name,
          lastName: user.last_name,
          profileImageUrl: user.profile_image_url,
        });
        break;
      }
      
      case "user.deleted": {
        // User deleted - you might want to handle this
        // For now, we'll keep the data but you could delete it
        console.log(`User deleted: ${event.data.id}`);
        break;
      }
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Clerk webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
};
