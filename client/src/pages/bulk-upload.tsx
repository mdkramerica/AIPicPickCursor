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

  const handleUploadComplete = async (results: any[]) => {
    if (sessionId) {
      toast({
        title: "Upload complete",
        description: `Successfully uploaded ${results.length} photos`,
      });
      
      // Start grouping analysis using existing endpoint
      try {
        const response = await apiRequest("POST", `/api/sessions/${sessionId}/group-analyze`, {
          similarityThreshold: 0.7,
          targetGroupSize: 5,
          minGroupSize: 2,
          maxGroupSize: 10,
        });
        await response.json();
        toast({
          title: "Grouping started",
          description: "AI is analyzing your photos",
        });
      } catch (error) {
        toast({
          title: "Failed to start grouping",
          description: "Please try again",
          variant: "destructive",
        });
      }
    }
  };

  const handleUploadProgress = (progress: any) => {
    console.log("Upload progress:", progress);
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
