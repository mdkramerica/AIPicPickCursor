import type { Request, Response, NextFunction, ErrorRequestHandler } from "express";

/**
 * Custom error class for application-specific errors
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Global error handling middleware
 * Sanitizes errors in production and provides detailed errors in development
 */
export const errorHandler: ErrorRequestHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Default to 500 server error
  let statusCode = 500;
  let message = "Internal Server Error";
  let details: any = undefined;

  // Handle known AppError instances
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // Log error details server-side (always log full error)
  console.error("[Error Handler]", {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    statusCode,
    message: err.message,
    stack: err.stack,
    userId: (req.user as any)?.claims?.sub,
  });

  // In development, provide detailed error information
  if (process.env.NODE_ENV === "development") {
    details = {
      message: err.message,
      stack: err.stack,
      ...(err instanceof AppError ? { isOperational: err.isOperational } : {}),
    };
  }

  // Send response
  res.status(statusCode).json({
    message,
    ...(details ? { details } : {}),
  });
};

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    message: "Resource not found",
  });
};
