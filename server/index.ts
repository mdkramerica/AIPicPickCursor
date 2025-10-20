// Load environment variables from .env file
import "dotenv/config";

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { securityHeaders, validateRequest } from "./middleware/security";
import { logger } from "./middleware/logger";

const app = express();

// Security middleware
app.use(securityHeaders);
app.use(validateRequest);

// Body parsing with size limits
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Error handling middleware (must be after routes AND static files)
  app.use(notFoundHandler);
  app.use(errorHandler);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const listenOptions: any = {
    port,
    host: "0.0.0.0",
  };
  
  // Only use reusePort on Linux (not supported on macOS)
  if (process.platform === 'linux') {
    listenOptions.reusePort = true;
  }
  
  server.listen(listenOptions, () => {
    logger.info(`Server started on port ${port}`, { 
      environment: process.env.NODE_ENV,
      port 
    });
    log(`serving on port ${port}`);
  });
})().catch((err) => {
  console.error("======================");
  console.error("FATAL: Failed to start server");
  console.error("======================");
  console.error("Error:", err);
  console.error("Message:", err.message);
  console.error("Stack:", err.stack);
  console.error("======================");
  logger.error("Failed to start server", { error: err.message, stack: err.stack });
  process.exit(1);
});
