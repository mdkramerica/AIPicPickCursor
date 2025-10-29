import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Upload, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import BulkUploadComponent from "@/components/BulkUploadComponent";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
// import { useBulkSession } from "@/hooks/useBulkSession"; // Not used in this component

export default function BulkUploadPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Create session mutation for bulk upload
  const createSessionMutation = useMutation({
    mutationFn: async (data: { name: string; bulkMode: boolean }) => {
      const response = await apiRequest("POST", "/api/sessions", data);
      return response.json();
    },
    onSuccess: (data) => {
      setSessionId(data.id);
      toast({
        title: "Bulk session created",
        description: "You can now upload your photos",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to create session",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  /**
   * Validate AI dependencies before starting grouping
   */
  const validateAIDependencies = async (): Promise<{ available: boolean; errors: string[] }> => {
    const errors: string[] = [];
    
    // Check if Canvas API is available (for image loading)
    if (!document.createElement('canvas').getContext) {
      errors.push("Canvas API not available");
    }
    
    // Check if fetch API is available (for network requests)
    if (typeof fetch === 'undefined') {
      errors.push("Fetch API not available");
    }
    
    // Check if Image constructor is available (for image loading)
    if (typeof Image === 'undefined') {
      errors.push("Image API not available");
    }
    
    // Test basic image loading capability
    try {
      const testImage = new Image();
      testImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      await new Promise((resolve, reject) => {
        testImage.onload = resolve;
        testImage.onerror = reject;
        setTimeout(() => reject(new Error('Image load timeout')), 5000);
      });
    } catch (error) {
      errors.push("Image loading capability check failed");
    }
    
    return {
      available: errors.length === 0,
      errors,
    };
  };

  const handleUploadComplete = async (results: any[]) => {
    console.log("🚀 Bulk upload completed", { sessionId, resultCount: results.length });
    
    if (!sessionId) {
      toast({
        title: "No session available",
        description: "Please refresh and try again",
        variant: "destructive",
      });
      return;
    }
    
    const successCount = results.filter(r => r.success).length;
    
    toast({
      title: "Upload complete",
      description: `Successfully uploaded ${successCount} of ${results.length} photos`,
    });
    
    // Only start grouping if we have successful uploads
    if (successCount === 0) {
      toast({
        title: "No successful uploads",
        description: "Please check your files and try again",
        variant: "destructive",
      });
      return;
    }
    
    console.log("🔍 Starting grouping analysis", { sessionId, photoCount: successCount });

    // 0. VERIFY PHOTOS ARE SAVED - Add a small delay and verify photo count
    console.log("⏳ Waiting for photos to be fully saved...");
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second for DB commits

    // Verify photos are in the database before starting grouping
    let actualPhotoCount = 0;
    try {
      const verifyResponse = await apiRequest("GET", `/api/sessions/${sessionId}/photos?limit=1000`);
      if (verifyResponse.ok) {
        const responseData = await verifyResponse.json();
        // Handle paginated response format
        const photos = responseData.data || responseData; // Support both paginated and non-paginated responses
        actualPhotoCount = Array.isArray(photos) ? photos.length : 0;
        console.log("📊 Photo verification", {
          sessionId,
          actualPhotoCount,
          expectedCount: successCount,
          responseFormat: responseData.data ? 'paginated' : 'array'
        });

        if (actualPhotoCount < 2) {
          console.warn("⚠️ Not enough photos saved yet, waiting longer...");
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait another 2 seconds

          // Verify again after waiting
          const retryResponse = await apiRequest("GET", `/api/sessions/${sessionId}/photos?limit=1000`);
          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            const retryPhotos = retryData.data || retryData;
            actualPhotoCount = Array.isArray(retryPhotos) ? retryPhotos.length : 0;
            console.log("📊 Photo verification (retry)", {
              sessionId,
              actualPhotoCount,
              expectedCount: successCount
            });
          }
        }

        // If still not enough photos, show error and don't proceed
        if (actualPhotoCount < 2) {
          toast({
            title: "Not enough photos",
            description: `Only ${actualPhotoCount} photo(s) were saved. Need at least 2 photos for grouping. Please try uploading again.`,
            variant: "destructive",
          });
          return;
        }
      }
    } catch (verifyError) {
      console.warn("⚠️ Could not verify photo count, proceeding anyway", { verifyError });
    }

    // 1. DEPENDENCY VALIDATION - Validate AI dependencies before starting
    console.log("🔧 Validating AI dependencies...");
    const dependencyCheck = await validateAIDependencies();

    if (!dependencyCheck.available) {
      console.error("❌ AI dependencies not available", { errors: dependencyCheck.errors });
      toast({
        title: "AI service check failed",
        description: "Some browser features required for AI grouping are unavailable. Attempting to proceed anyway...",
        variant: "default",
      });
      // Don't block - let the server handle fallbacks
    } else {
      console.log("✅ AI dependencies validated successfully");
    }

    // 2. ENHANCED ERROR HANDLING - Start grouping with detailed error tracking
    try {
      const response = await apiRequest("POST", `/api/sessions/${sessionId}/group-analyze`, {
        similarityThreshold: 0.7,
        targetGroupSize: 5,
        minGroupSize: 2,
        maxGroupSize: 10,
      });
      
      if (!response.ok) {
        // Parse error response for specific AI-related errors
        let errorMessage = "Failed to start grouping";
        let errorDetails = "";
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
          errorDetails = errorData.details || "";
          
          // Check for specific AI service errors
          if (errorMessage.includes("dependencies") || errorMessage.includes("TensorFlow") || errorMessage.includes("Canvas")) {
            console.error("❌ AI service unavailable", { errorMessage, errorDetails });
            throw new Error("AI_SERVICE_UNAVAILABLE: " + errorMessage);
          } else if (errorMessage.includes("insufficient photos")) {
            throw new Error("INSUFFICIENT_PHOTOS: " + errorMessage);
          } else {
            throw new Error("GROUPING_ERROR: " + errorMessage);
          }
        } catch (parseError) {
          // If JSON parsing fails, throw generic error
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      }
      
      const result = await response.json();
      console.log("✅ Grouping analysis started successfully", { result });
      
      toast({
        title: "AI grouping started",
        description: `Analyzing ${successCount} photos to find similar groups...`,
      });
      
      // Navigate to results after a short delay
      setTimeout(() => {
        navigate(`/sessions/${sessionId}/groups`);
      }, 2000);
      
    } catch (error) {
      console.error("❌ Failed to start grouping", { error });
      
      // 3. GRACEFUL DEGRADATION - Provide fallback options when AI fails
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      if (errorMessage.includes("AI_SERVICE_UNAVAILABLE")) {
        toast({
          title: "AI grouping unavailable",
          description: "AI services are temporarily unavailable. Your photos are uploaded - you can view them individually.",
          variant: "destructive",
        });
        
        // Still navigate to session view where users can manually organize
        setTimeout(() => {
          navigate(`/sessions/${sessionId}`);
        }, 2000);
        
      } else if (errorMessage.includes("INSUFFICIENT_PHOTOS")) {
        toast({
          title: "Not enough photos",
          description: "You need at least 2 photos for AI grouping. Upload more photos to enable grouping.",
          variant: "default",
        });
        
      } else if (errorMessage.includes("GROUPING_ERROR")) {
        toast({
          title: "Grouping failed",
          description: "AI grouping encountered an error. Your photos are safe - try refreshing and analyzing again.",
          variant: "destructive",
        });
        
        // Navigate to session view for manual options
        setTimeout(() => {
          navigate(`/sessions/${sessionId}`);
        }, 2000);
        
      } else {
        // Generic error fallback
        toast({
          title: "Failed to start grouping",
          description: errorMessage.replace(/^[A-Z_]+:\s*/, '') || "Please try again or contact support",
          variant: "destructive",
        });
      }
    }
  };

  const handleUploadProgress = (progress: any) => {
    console.log("📊 Upload progress:", { progress, sessionId });
  };

  const handleError = (error: string) => {
    toast({
      title: "Upload error",
      description: error,
      variant: "destructive",
    });
  };

  const initializeSession = async () => {
    try {
      const response = await apiRequest("POST", "/api/sessions", {
        name: `Bulk Upload ${new Date().toLocaleDateString()}`,
        bulkMode: true,
      });
      const session = await response.json();
      setSessionId(session.id);
    } catch (error) {
      toast({
        title: "Failed to create session",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Bulk Photo Upload</h1>
            <p className="text-muted-foreground">
              Upload 50-200 photos and let AI group them automatically
            </p>
          </div>
        </div>
      </div>

      {!sessionId ? (
        /* Initial session creation screen */
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Start Bulk Upload</h2>
                <p className="text-sm text-muted-foreground">
                  Create a session to upload and group multiple photos
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div className="mb-6">
                <Upload className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Ready to organize your photos?</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Upload 50-200 photos and our AI will automatically group similar shots,
                  then help you find the best photo from each group.
                </p>
              </div>
              <Button
                onClick={() => createSessionMutation.mutate({
                  name: `Bulk Upload ${new Date().toLocaleDateString()}`,
                  bulkMode: true,
                })}
                disabled={createSessionMutation.isPending}
                size="lg"
              >
                {createSessionMutation.isPending ? (
                  "Creating..."
                ) : (
                  "Create Upload Session"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Bulk upload interface */
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Upload Photos</h2>
                  <p className="text-sm text-muted-foreground">
                    Drag and drop your photos or click to browse
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    Session: {sessionId.slice(0, 8)}...
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <BulkUploadComponent
                sessionId={sessionId}
                maxFiles={200}
                maxFileSize={10 * 1024 * 1024} // 10MB
                onUploadProgress={handleUploadProgress}
                onUploadComplete={handleUploadComplete}
                onError={handleError}
              />
            </CardContent>
          </Card>


        </div>
      )}
    </div>
  );
}
