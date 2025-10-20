import type { Request, Response, NextFunction } from "express";

/**
 * Simple in-memory rate limiter
 * For production, consider using Redis-based rate limiting
 */

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  message?: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();

  constructor() {
    // Clean up old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    }
  }

  private getKey(req: Request, identifier?: string): string {
    if (identifier) {
      return identifier;
    }
    // Use user ID if authenticated, otherwise use IP
    const userId = (req.user as any)?.claims?.sub;
    return userId || req.ip || "unknown";
  }

  limit(config: RateLimitConfig, identifier?: (req: Request) => string) {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = this.getKey(req, identifier?.(req));
      const now = Date.now();
      const entry = this.store.get(key);

      if (!entry || entry.resetTime < now) {
        // Create new entry
        this.store.set(key, {
          count: 1,
          resetTime: now + config.windowMs,
        });
        return next();
      }

      // Check if limit exceeded
      if (entry.count >= config.maxRequests) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
        res.setHeader("Retry-After", retryAfter);
        res.setHeader("X-RateLimit-Limit", config.maxRequests);
        res.setHeader("X-RateLimit-Remaining", 0);
        res.setHeader("X-RateLimit-Reset", entry.resetTime);

        return res.status(429).json({
          message: config.message || "Too many requests, please try again later",
          retryAfter,
        });
      }

      // Increment count
      entry.count++;
      this.store.set(key, entry);

      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", config.maxRequests);
      res.setHeader("X-RateLimit-Remaining", config.maxRequests - entry.count);
      res.setHeader("X-RateLimit-Reset", entry.resetTime);

      next();
    };
  }
}

export const rateLimiter = new RateLimiter();

// Predefined rate limiters for common use cases
export const authLimiter = rateLimiter.limit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  message: "Too many authentication attempts, please try again later",
});

export const analysisLimiter = rateLimiter.limit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 2,
  message: "Analysis requests are rate limited. Please wait before analyzing another session",
});

export const uploadLimiter = rateLimiter.limit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 50,
  message: "Upload rate limit exceeded",
});

export const apiLimiter = rateLimiter.limit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  message: "API rate limit exceeded",
});
