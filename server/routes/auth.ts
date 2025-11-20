import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../kindeAuth";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { apiLimiter } from "../middleware/rateLimiter";

const router = Router();

router.get('/user', apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
  const userId = req.userId;

  if (!userId) {
    throw new AppError(401, "Unauthorized");
  }

  // Get user from database (already synced by isAuthenticated middleware)
  const user = await storage.getUser(userId);

  if (!user) {
    throw new AppError(404, "User not found");
  }

  res.json(user);
}));

export default router;
