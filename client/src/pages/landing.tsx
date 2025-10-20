import { Sparkles, Eye, Smile, Zap, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SignInButton } from "@clerk/clerk-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Mobile-Optimized Header */}
      <header className="border-b sticky top-0 bg-background z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <span className="text-base sm:text-xl font-semibold">AI Photo Selector</span>
          </div>
          <SignInButton mode="modal">
            <Button data-testid="button-login" className="min-h-[44px]">
              Sign In
            </Button>
          </SignInButton>
        </div>
      </header>

      {/* Mobile-Optimized Hero Section */}
      <section className="relative overflow-hidden py-12 sm:py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-6xl font-bold tracking-tight mb-4 sm:mb-6">
              Find Your Perfect
              <span className="block text-primary mt-2">Group Photo with AI</span>
            </h1>
            <p className="text-base sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-8 sm:mb-10 px-2">
              No more scrolling through dozens of shots. Our AI analyzes faces, detects open eyes and smiles, 
              then recommends the best photo from your group shots—instantly.
            </p>
            <SignInButton mode="modal">
              <Button size="lg" className="text-base sm:text-lg px-6 sm:px-8 py-5 sm:py-6 min-h-[52px]" data-testid="button-get-started">
                <Sparkles className="mr-2 h-5 w-5" />
                Get Started Free
              </Button>
            </SignInButton>
          </div>
        </div>
      </section>

      {/* Mobile-Optimized Features Section */}
      <section className="py-12 sm:py-20 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8 sm:mb-12">How It Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-8">
            <Card className="p-6">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Eye className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Eye Detection</h3>
              <p className="text-muted-foreground">
                Advanced AI detects if everyone's eyes are open in each photo, ensuring no one is caught mid-blink.
              </p>
            </Card>

            <Card className="p-6">
              <div className="h-12 w-12 rounded-xl bg-chart-2/10 flex items-center justify-center mb-4">
                <Smile className="h-6 w-6 text-chart-2" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Smile Analysis</h3>
              <p className="text-muted-foreground">
                Our technology identifies genuine smiles and expressions, finding photos where everyone looks their best.
              </p>
            </Card>

            <Card className="p-6">
              <div className="h-12 w-12 rounded-xl bg-chart-3/10 flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-chart-3" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Instant Results</h3>
              <p className="text-muted-foreground">
                Get quality scores and recommendations in seconds. Download or share your best photo right away.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Mobile-Optimized Benefits Section */}
      <section className="py-12 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">Why Choose AI Photo Selector?</h2>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-chart-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-1">Save Time</h4>
                    <p className="text-muted-foreground">No more manual comparison. AI analyzes all photos in seconds.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-chart-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-1">Never Miss Perfect Moments</h4>
                    <p className="text-muted-foreground">Catch details the human eye might miss—like subtle expressions or perfect timing.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-chart-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-1">Smart & Secure</h4>
                    <p className="text-muted-foreground">Your photos are processed securely and privately. We respect your privacy.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-chart-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-1">Session-Based</h4>
                    <p className="text-muted-foreground">Upload, analyze, and download. No permanent storage unless you want it.</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="relative">
              <div className="aspect-square rounded-2xl bg-gradient-to-br from-primary/20 via-chart-2/20 to-chart-3/20 p-8 flex items-center justify-center">
                <div className="text-center">
                  <Sparkles className="h-20 w-20 text-primary mx-auto mb-4" />
                  <p className="text-2xl font-semibold">Intelligent Analysis</p>
                  <p className="text-muted-foreground mt-2">Powered by advanced AI</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile-Optimized CTA Section */}
      <section className="py-12 sm:py-20 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4">
            Ready to Find Your Best Photo?
          </h2>
          <p className="text-base sm:text-lg mb-6 sm:mb-8 opacity-90">
            Join thousands who've discovered the perfect group photo using AI
          </p>
          <Button 
            size="lg" 
            variant="secondary" 
            asChild 
            className="text-base sm:text-lg px-6 sm:px-8 py-5 sm:py-6 min-h-[52px]"
            data-testid="button-cta-login"
          >
            <a href="/api/login">
              Start Analyzing Photos
            </a>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm sm:text-base text-muted-foreground">
          <p>&copy; 2024 AI Photo Selector. Find your perfect group photo.</p>
        </div>
      </footer>
    </div>
  );
}
