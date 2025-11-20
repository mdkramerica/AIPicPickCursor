// Reference: blueprint:javascript_object_storage
import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "./db";
import { setupAuth } from "./kindeAuth";
import { asyncHandler } from "./middleware/errorHandler";
import { logger } from "./middleware/logger";
import { sql } from "drizzle-orm";
import authRouter from "./routes/auth";
import convertKitRouter from "./routes/convertkit";
import filesRouter from "./routes/files";
import sessionRouter from "./routes/sessions";
import photoRouter from "./routes/photos";
import groupRouter from "./routes/groups";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Kinde authentication middleware
  setupAuth(app);

  // Health check endpoint (no auth required, for monitoring)
  app.get("/health", asyncHandler(async (req, res) => {
    const checks: Record<string, any> = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
    };

    // Check database connectivity with detailed error info
    try {
      const result = await db.execute(sql`SELECT 1`);
      checks.database = "ok";
      checks.databaseDetails = {
        connected: true,
        queryTime: Date.now()
      };
    } catch (error) {
      checks.database = "error";
      checks.databaseError = error instanceof Error ? error.message : "Unknown error";
      checks.databaseDetails = {
        connected: false,
        url: process.env.DATABASE_URL ? "configured" : "missing",
        errorType: error instanceof Error ? error.constructor.name : 'Unknown'
      };
      
      logger.error('Database health check failed', {
        error: checks.databaseError,
        hasDatabaseUrl: !!process.env.DATABASE_URL
      });
    }

    // Check authentication configuration
    try {
      if (process.env.KINDE_DOMAIN) {
        checks.auth = "ok";
        checks.authDetails = {
          kindeDomain: process.env.KINDE_DOMAIN,
          configured: true
        };
      } else {
        checks.auth = "error";
        checks.authError = "KINDE_DOMAIN not configured";
        checks.authDetails = {
          configured: false
        };
      }
    } catch (error) {
      checks.auth = "error";
      checks.authError = error instanceof Error ? error.message : "Unknown error";
    }

    // Check R2 storage connectivity (just verify config exists)
    try {
      if (process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_BUCKET_NAME) {
        checks.storage = "ok";
        checks.storageDetails = {
          endpoint: process.env.R2_ENDPOINT,
          bucket: process.env.R2_BUCKET_NAME,
          configured: true
        };
      } else {
        checks.storage = "warning";
        checks.storageError = "R2 configuration missing";
        checks.storageDetails = {
          configured: false,
          missingVars: [
            !process.env.R2_ENDPOINT ? "R2_ENDPOINT" : null,
            !process.env.R2_ACCESS_KEY_ID ? "R2_ACCESS_KEY_ID" : null,
            !process.env.R2_BUCKET_NAME ? "R2_BUCKET_NAME" : null
          ].filter(Boolean)
        };
      }
    } catch (error) {
      checks.storage = "error";
      checks.storageError = error instanceof Error ? error.message : "Unknown error";
    }

    // Overall health status
    const criticalServices = [checks.database, checks.auth];
    const healthy = criticalServices.every(check => check === "ok");
    
    const statusCode = healthy ? 200 : 503;
    checks.overall = healthy ? "healthy" : "unhealthy";

    res.status(statusCode).json(checks);
  }));

  // Mount routers
  app.use("/api/auth", authRouter);
  app.use("/api", convertKitRouter);
  app.use("/", filesRouter);
  app.use("/api/sessions", sessionRouter);
  app.use("/api", photoRouter);
  app.use("/api", groupRouter);

  const httpServer = createServer(app);

  return httpServer;
}
