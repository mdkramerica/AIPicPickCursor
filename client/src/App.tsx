import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkProvider, SignedIn, SignedOut, ClerkLoading, ClerkLoaded } from "@clerk/clerk-react";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Comparison from "@/pages/comparison";
import Album from "@/pages/album";
import { Loader2 } from "lucide-react";

// Get Clerk publishable key from environment
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY) {
  console.error("Missing VITE_CLERK_PUBLISHABLE_KEY environment variable");
  throw new Error("Missing Clerk Publishable Key. Please set VITE_CLERK_PUBLISHABLE_KEY in your environment.");
}

function Router() {
  console.log("Router rendering");

  return (
    <Switch>
      <Route path="/">
        <SignedOut>
          <Landing />
        </SignedOut>
        <SignedIn>
          <Dashboard />
        </SignedIn>
      </Route>
      <Route path="/album">
        <SignedIn>
          <Album />
        </SignedIn>
      </Route>
      <Route path="/session/:sessionId/compare">
        <SignedIn>
          <Comparison />
        </SignedIn>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  console.log("App rendering, Clerk key:", CLERK_PUBLISHABLE_KEY ? "present" : "missing");

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/"
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
