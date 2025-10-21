import { useAuth } from "@/hooks/useAuth";
import { useConvertKit } from "@/hooks/useConvertKit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { Mail, Bell, Info, Loader2 } from "lucide-react";

export default function EmailPreferences() {
  const { user } = useAuth();
  const { settings, isLoading, updateSettings, isUpdating, isSubscribed } = useConvertKit();

  if (isLoading) {
    return (
      <div className="container max-w-2xl mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // If not subscribed, show signup form
  if (!isSubscribed || !settings) {
    return (
      <div className="container max-w-2xl mx-auto py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Preferences</h1>
          <p className="text-muted-foreground mt-2">
            Subscribe to receive photo analysis updates and tips
          </p>
        </div>

        <NewsletterSignup />
      </div>
    );
  }

  // If subscribed, show preferences
  return (
    <div className="container max-w-2xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Email Preferences</h1>
        <p className="text-muted-foreground mt-2">
          Manage how and when we send you emails
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          You're subscribed as <strong>{user?.email}</strong>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Preferences
          </CardTitle>
          <CardDescription>
            Choose what emails you want to receive
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 flex-1">
              <Label htmlFor="email-consent" className="text-base">
                Photo Analysis Updates
              </Label>
              <p className="text-sm text-muted-foreground">
                Receive notifications when your photo analysis is complete
              </p>
            </div>
            <Switch
              id="email-consent"
              checked={settings.emailConsent}
              onCheckedChange={(checked) =>
                updateSettings({ emailConsent: checked })
              }
              disabled={isUpdating}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5 flex-1">
              <Label htmlFor="marketing-consent" className="text-base">
                Tips & Updates
              </Label>
              <p className="text-sm text-muted-foreground">
                Get photo tips, new features, and product updates
              </p>
            </div>
            <Switch
              id="marketing-consent"
              checked={settings.marketingConsent}
              onCheckedChange={(checked) =>
                updateSettings({ marketingConsent: checked })
              }
              disabled={isUpdating}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Mail className="h-5 w-5" />
            Unsubscribe
          </CardTitle>
          <CardDescription>
            Stop receiving all emails from AIPicPick
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            If you unsubscribe, you won't receive any emails including photo analysis
            completion notifications. You can re-subscribe anytime.
          </p>
          <Button
            variant="destructive"
            onClick={() =>
              updateSettings({ emailConsent: false, marketingConsent: false })
            }
            disabled={isUpdating}
          >
            {isUpdating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              "Unsubscribe from All Emails"
            )}
          </Button>
        </CardContent>
      </Card>

      <div className="text-center pt-4">
        <p className="text-sm text-muted-foreground">
          Subscribed on {new Date(settings.createdAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
