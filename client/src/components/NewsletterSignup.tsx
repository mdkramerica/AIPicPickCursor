import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useConvertKit } from "@/hooks/useConvertKit";
import { useKindeAuth } from "@kinde-oss/kinde-auth-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Loader2, Sparkles } from "lucide-react";

interface NewsletterSignupProps {
  title?: string;
  description?: string;
  compact?: boolean;
  onSuccess?: () => void;
}

export function NewsletterSignup({ 
  title = "Stay Updated 📧",
  description = "Get photo tips and analysis updates delivered to your inbox",
  compact = false,
  onSuccess,
}: NewsletterSignupProps) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { login } = useKindeAuth();
  const { subscribe, isSubscribing, isSubscribed, isAutoSubscribed } = useConvertKit();
  
  const [email, setEmail] = useState(user?.email || "");
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [emailConsent, setEmailConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show login prompt if not authenticated
  if (!isAuthenticated) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-4">
            <Mail className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-600 mb-2">
              Please sign in to subscribe to email updates
            </p>
            <Button 
              onClick={() => login()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Sign In
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('📧 Newsletter signup: Submitting form');
    console.log('📧 User authenticated:', isAuthenticated);
    console.log('📧 User email:', email);
    console.log('📧 Email consent:', emailConsent);
    
    subscribe(
      {
        email,
        firstName,
        consent: {
          email: emailConsent,
          marketing: marketingConsent,
        },
      },
      {
        onSuccess: () => {
          console.log('📧 Newsletter signup: Success callback');
          onSuccess?.();
        },
      }
    );
  };

  if (isSubscribed) {
    return (
      <Card className={compact ? "border-green-200 bg-green-50" : ""}>
        <CardContent className={compact ? "pt-6" : "pt-6"}>
          <div className="flex items-center gap-3 text-green-700">
            {isAutoSubscribed ? (
              <Sparkles className="h-5 w-5" />
            ) : (
              <Mail className="h-5 w-5" />
            )}
            <p className="font-medium">
              {isAutoSubscribed 
                ? "You're automatically subscribed! 🎉 You'll receive photo tips and updates."
                : "You're subscribed! Check your inbox for updates."
              }
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <div className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isSubscribing}
            />
            <Button type="submit" disabled={isSubscribing || !emailConsent}>
              {isSubscribing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Subscribing...
                </>
              ) : (
                "Subscribe"
              )}
            </Button>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="email-consent-compact"
              checked={emailConsent}
              onCheckedChange={(checked) => setEmailConsent(checked as boolean)}
            />
            <label
              htmlFor="email-consent-compact"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              I agree to receive photo analysis updates via email
            </label>
          </div>
        </form>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isSubscribing}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="firstName">First Name (Optional)</Label>
            <Input
              id="firstName"
              type="text"
              placeholder="John"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={isSubscribing}
            />
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-start space-x-2">
              <Checkbox
                id="email-consent"
                checked={emailConsent}
                onCheckedChange={(checked) => setEmailConsent(checked as boolean)}
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="email-consent"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Photo analysis updates
                </label>
                <p className="text-sm text-muted-foreground">
                  Receive emails when your photo analysis is complete
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="marketing-consent"
                checked={marketingConsent}
                onCheckedChange={(checked) => setMarketingConsent(checked as boolean)}
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="marketing-consent"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Tips and updates (Optional)
                </label>
                <p className="text-sm text-muted-foreground">
                  Get photo tips, new features, and product updates
                </p>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isSubscribing || !emailConsent}
          >
            {isSubscribing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Subscribing...
              </>
            ) : (
              "Subscribe to Updates"
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            We respect your privacy. Unsubscribe anytime from your settings.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
