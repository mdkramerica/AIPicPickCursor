import { Router } from "express";
import { setupAuth } from "../kindeAuth";

// We will import and mount sub-routers here
// import authRoutes from "./auth";
// import sessionRoutes from "./sessions";
// import photoRoutes from "./photos";
// import groupRoutes from "./groups";
// import convertKitRoutes from "./convertkit";

export async function registerRoutes(app: any) {
  // Setup Kinde authentication middleware
  setupAuth(app);

  // API Router
  const apiRouter = Router();

  // Mount sub-routers (to be implemented)
  // apiRouter.use("/auth", authRoutes);
  // apiRouter.use("/sessions", sessionRoutes);
  // ...

  // For now, we will incrementally move routes here.
  // The main app will still use the old registerRoutes until we are done.
  
  return apiRouter;
}

