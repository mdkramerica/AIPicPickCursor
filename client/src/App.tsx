import { Switch, Route } from "wouter";
import { queryClient, setTokenGetter } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { KindeProvider } from "@kinde-oss/kinde-auth-react";
import { useKindeAuth } from "@kinde-oss/kinde-auth-react";
import { useEffect } from "react";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Comparison from "@/pages/comparison";
import Album from "@/pages/album";
import BulkUpload from "@/pages/bulk-upload";
import EmailPreferences from "@/pages/email-preferences";

// Get Kinde configuration from environment
const KINDE_DOMAIN = import.meta.env.VITE_KINDE_DOMAIN;
const KINDE_CLIENT_ID = import.meta.env.VITE_KINDE_CLIENT_ID;
const KINDE_REDIRECT_URL = import.meta.env.VITE_KINDE_REDIRECT_URL;
const KINDE_LOGOUT_REDIRECT_URL = import.meta.env.VITE_KINDE_LOGOUT_REDIRECT_URL;

if (!KINDE_DOMAIN || !KINDE_CLIENT_ID) {
  console.error("Missing Kinde environment variables");
  throw new Error("Missing Kinde configuration. Please set VITE_KINDE_DOMAIN and VITE_KINDE_CLIENT_ID in your environment.");
}

// Component to set up token getter for API requests
function TokenSetup() {
  const { getToken, isAuthenticated } = useKindeAuth();

  useEffect(() => {
    // Set the token getter function for all API requests
    setTokenGetter(async () => {
      try {
        console.log("🔑 TokenSetup: Getting token, isAuthenticated:", isAuthenticated);
        const token = await getToken();
        console.log("🔑 TokenSetup: Got token:", token ? `${token.substring(0, 20)}...` : "null");
        return token || null;
      } catch (error) {
        console.error("❌ Error getting Kinde token:", error);
        return null;
      }
    });
  }, [getToken, isAuthenticated]);

  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useKindeAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Landing />;
  }

  return <>{children}</>;
}

function Router() {
  const { isAuthenticated } = useKindeAuth();

  return (
    <>
      <TokenSetup />
      <Switch>
        <Route path="/">
          {isAuthenticated ? <Dashboard /> : <Landing />}
        </Route>
        <Route path="/album">
          <ProtectedRoute>
            <Album />
          </ProtectedRoute>
        </Route>
        <Route path="/session/:sessionId/compare">
          <ProtectedRoute>
            <Comparison />
          </ProtectedRoute>
        </Route>
        <Route path="/bulk-upload">
          <ProtectedRoute>
            <BulkUpload />
          </ProtectedRoute>
        </Route>
        <Route path="/email-preferences">
          <ProtectedRoute>
            <EmailPreferences />
          </ProtectedRoute>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <KindeProvider
      clientId={KINDE_CLIENT_ID}
      domain={KINDE_DOMAIN}
      redirectUri={KINDE_REDIRECT_URL}
      logoutUri={KINDE_LOGOUT_REDIRECT_URL}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </KindeProvider>
  );
}

export default App;
