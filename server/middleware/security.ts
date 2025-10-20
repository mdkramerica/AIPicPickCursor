import type { Request, Response, NextFunction } from "express";

/**
 * Security headers middleware
 * Implements various security best practices
 */

export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Enable XSS protection
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  // Content Security Policy (adjust based on your needs)
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "img-src 'self' data: https: blob:",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "connect-src 'self' https://*.clerk.accounts.dev https://api.clerk.com",
        "frame-src https://*.clerk.accounts.dev",
        "worker-src 'self' blob:",
        "child-src 'self' blob:",
        "frame-ancestors 'none'",
      ].join("; ")
    );

    // HSTS - enforce HTTPS (only in production)
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  next();
};

/**
 * Request validation middleware
 * Validates common security concerns
 */
export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  // Check request size (already handled by express.json limit, but good to track)
  const contentLength = parseInt(req.headers["content-length"] || "0");
  if (contentLength > 10 * 1024 * 1024) { // 10MB
    return res.status(413).json({ message: "Request entity too large" });
  }

  next();
};

/**
 * UUID parameter validator
 */
export const validateUUID = (paramName: string) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  return (req: Request, res: Response, next: NextFunction) => {
    const value = req.params[paramName];
    if (!value || !uuidRegex.test(value)) {
      return res.status(400).json({ 
        message: `Invalid ${paramName} format` 
      });
    }
    next();
  };
};

/**
 * SSRF protection for image URLs
 * Prevents accessing internal/private network resources
 */
export const validateImageUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost and loopback
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    ) {
      return false;
    }

    // Block private IP ranges
    if (
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.16.") ||
      hostname.startsWith("172.17.") ||
      hostname.startsWith("172.18.") ||
      hostname.startsWith("172.19.") ||
      hostname.startsWith("172.20.") ||
      hostname.startsWith("172.21.") ||
      hostname.startsWith("172.22.") ||
      hostname.startsWith("172.23.") ||
      hostname.startsWith("172.24.") ||
      hostname.startsWith("172.25.") ||
      hostname.startsWith("172.26.") ||
      hostname.startsWith("172.27.") ||
      hostname.startsWith("172.28.") ||
      hostname.startsWith("172.29.") ||
      hostname.startsWith("172.30.") ||
      hostname.startsWith("172.31.")
    ) {
      return false;
    }

    // Block link-local addresses
    if (hostname.startsWith("169.254.")) {
      return false;
    }

    // Block cloud metadata endpoints
    if (hostname === "169.254.169.254") {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};
