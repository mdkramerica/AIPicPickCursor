import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Sparkles, Upload, LogOut, Eye, Smile, Loader2, Image as ImageIcon, Download, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { UploadResult } from "@uppy/core";
import type { PhotoSession, Photo } from "@shared/schema";
import { useKindeAuth } from "@kinde-oss/kinde-auth-react";

interface AnalysisProgress {
  sessionId: string;
  currentPhoto: number;
  totalPhotos: number;
  percentage: number;
  status: 'loading_models' | 'analyzing' | 'selecting_best' | 'complete' | 'error';
  message: string;
  currentPhotoId?: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { logout } = useKindeAuth();
  const { toast } = useToast();
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch sessions
  const { data: sessions, isLoading: sessionsLoading } = useQuery<PhotoSession[]>({
    queryKey: ["/api/sessions"],
  });

  // Fetch photos for selected session
  const { data: photos, isLoading: photosLoading } = useQuery<Photo[]>({
    queryKey: ["/api/sessions", selectedSession, "photos"],
    enabled: !!selectedSession,
  });

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sessions", {
        name: `Session ${new Date().toLocaleString()}`,
      });
      return await res.json() as PhotoSession;
    },
    onSuccess: (data: PhotoSession) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setSelectedSession(data.id);
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to create session",
        variant: "destructive",
      });
    },
  });

  // Upload photos mutation
  const uploadPhotosMutation = useMutation({
    mutationFn: async (uploadedFiles: { url: string; filename: string }[]) => {
      if (!selectedSession) throw new Error("No session selected");
      
      for (const file of uploadedFiles) {
        await apiRequest("POST", "/api/sessions/" + selectedSession + "/photos", {
          fileUrl: file.url,
          originalFilename: file.filename,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", selectedSession, "photos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      toast({
        title: "Success",
        description: "Photos uploaded successfully",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to upload photos",
        variant: "destructive",
      });
    },
  });

  // Navigate to results
  const [, navigate] = useLocation();

  // Analyze session mutation with SSE progress tracking
  const analyzeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      // Connect to SSE for progress updates
      const eventSource = new EventSource(`/api/sessions/${sessionId}/progress`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const progress: AnalysisProgress = JSON.parse(event.data);
        setAnalysisProgress(progress);

        if (progress.status === 'complete') {
          eventSource.close();
          eventSourceRef.current = null;
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
      };

      // Start the analysis
      const res = await apiRequest("POST", `/api/sessions/${sessionId}/analyze`, {});
      return await res.json();
    },
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", sessionId, "photos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setAnalysisProgress(null);
      toast({
        title: "Analysis Complete",
        description: "Your photos have been analyzed!",
      });
      navigate(`/session/${sessionId}/compare`);
    },
    onError: (error: Error) => {
      setAnalysisProgress(null);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to analyze photos",
        variant: "destructive",
      });
    },
  });

  const handleUploadComplete = async (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    console.log("📦 Upload complete callback triggered", result);

    if (!result.successful || result.successful.length === 0) {
      console.error("❌ No successful uploads");
      toast({
        title: "Error",
        description: "No files were successfully uploaded",
        variant: "destructive",
      });
      return;
    }

    console.log("✅ Processing", result.successful.length, "uploaded files");
    const uploadedFiles = result.successful.map(file => ({
      url: file.uploadURL as string,
      filename: file.name || "unknown",
    }));

    console.log("💾 Saving photos to database:", uploadedFiles);
    uploadPhotosMutation.mutate(uploadedFiles);
  };

  const handleNewSession = () => {
    createSessionMutation.mutate();
  };

  const currentSession = sessions?.find(s => s.id === selectedSession);
  const canAnalyze = currentSession && currentSession.status === "uploading" && (photos?.length || 0) >= 2;

  // Debug logging
  console.log('Dashboard Debug:', {
    selectedSession,
    currentSession,
    photosLength: photos?.length,
    canAnalyze,
    sessionStatus: currentSession?.status
  });

  // Debug panel toggle
  const [showDebug, setShowDebug] = useState(false);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-8">
      {/* Mobile-Friendly Debug Panel */}
      {showDebug && selectedSession && (
        <div className="fixed bottom-20 sm:bottom-4 right-3 sm:right-4 bg-black text-white p-3 rounded-lg shadow-lg text-xs font-mono max-w-xs z-50">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold">Debug Info</span>
            <button onClick={() => setShowDebug(false)} className="text-white hover:text-gray-300">✕</button>
          </div>
          <div className="space-y-1">
            <div>Session: {selectedSession.slice(0, 8)}...</div>
            <div>Photos: {photos?.length || 0}</div>
            <div>Status: {currentSession?.status || 'none'}</div>
            <div className={canAnalyze ? 'text-green-400' : 'text-red-400'}>
              Can Analyze: {canAnalyze ? '✓ YES' : '✗ NO'}
            </div>
            {!canAnalyze && (
              <div className="mt-2 text-yellow-300 text-xs">
                {!currentSession ? '• No session' : 
                 currentSession.status !== 'uploading' ? `• Status not uploading (${currentSession.status})` :
                 (photos?.length || 0) < 2 ? `• Need 2+ photos (have ${photos?.length || 0})` :
                 '• Unknown issue'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Debug Toggle Button */}
      {selectedSession && (
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="fixed bottom-24 sm:bottom-8 right-3 sm:right-4 bg-gray-800 text-white px-3 py-2 rounded-full shadow-lg text-xs font-mono z-50 hover:bg-gray-700"
          data-testid="button-toggle-debug"
        >
          🐛 Debug
        </button>
      )}
      {/* Mobile-Optimized Header */}
      <header className="border-b sticky top-0 bg-background z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <span className="text-base sm:text-xl font-semibold">AI Photo Selector</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-4">
            <Button variant="ghost" size="sm" asChild data-testid="button-album" className="min-h-[44px]">
              <Link href="/album">
                <Images className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">Album</span>
              </Link>
            </Button>
            {selectedSession && canAnalyze && (
              <Button 
                onClick={() => analyzeSessionMutation.mutate(selectedSession)}
                disabled={analyzeSessionMutation.isPending}
                data-testid="button-analyze-session-header"
                className="hidden sm:flex min-h-[44px]"
              >
                {analyzeSessionMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {analyzeSessionMutation.isPending ? 'Analyzing...' : 'Analyze Photos'}
              </Button>
            )}
            {user && user.profileImageUrl && (
              <img 
                src={user.profileImageUrl} 
                alt={user.firstName || "User"} 
                className="h-8 w-8 rounded-full object-cover"
              />
            )}
            <Button onClick={() => logout()} variant="ghost" size="sm" data-testid="button-logout" className="min-h-[44px]">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline ml-2">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Mobile-Optimized Action Bar */}
        <div className="mb-6 sm:mb-8">
          <div className="mb-4">
            <h1 className="text-2xl sm:text-3xl font-bold mb-1">Your Photo Sessions</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Upload group photos and let AI find the best one</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
            <Button 
              onClick={handleNewSession} 
              disabled={createSessionMutation.isPending} 
              data-testid="button-new-session"
              className="w-full sm:w-auto min-h-[48px] sm:min-h-[40px]"
            >
              {createSessionMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              New Session
            </Button>
            {selectedSession && (
              <ObjectUploader
                maxNumberOfFiles={10}
                maxFileSize={10485760}
                onComplete={handleUploadComplete}
                buttonClassName="w-full sm:w-auto gap-2 min-h-[48px] sm:min-h-[40px]"
              >
                <Upload className="h-4 w-4" />
                Upload Photos
              </ObjectUploader>
            )}
          </div>
        </div>

        {/* Sessions List */}
        {sessionsLoading ? (
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="p-6">
                <Skeleton className="h-32 w-full mb-4" />
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </Card>
            ))}
          </div>
        ) : sessions && sessions.length > 0 ? (
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-6 sm:mb-8">
            {sessions.map((session) => (
              <Card 
                key={session.id} 
                className={`cursor-pointer transition-all hover-elevate min-h-[88px] ${selectedSession === session.id ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setSelectedSession(session.id)}
                data-testid={`card-session-${session.id}`}
              >
                <CardHeader className="pb-2 sm:pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold truncate text-base sm:text-lg">{session.name}</h3>
                    <Badge variant={session.status === "completed" ? "default" : "secondary"} className="shrink-0">
                      {session.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pb-3 sm:pb-3">
                  <div className="flex items-center gap-3 sm:gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ImageIcon className="h-4 w-4" />
                      {session.photoCount} photos
                    </span>
                    <span className="text-xs sm:text-sm">{new Date(session.createdAt).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Sessions Yet</h3>
            <p className="text-muted-foreground mb-6">Create your first session to start analyzing photos</p>
            <Button onClick={handleNewSession} disabled={createSessionMutation.isPending} data-testid="button-create-first-session">
              <Sparkles className="mr-2 h-4 w-4" />
              Create First Session
            </Button>
          </Card>
        )}

        {/* Selected Session Photos */}
        {selectedSession && (
          <div className="mt-6 sm:mt-8">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold">Session Photos</h2>
              <div className="flex gap-2">
                {/* View Comparison Button (only show when completed) */}
                {currentSession?.status === 'completed' && photos && photos.length > 0 && (
                  <Button 
                    variant="outline"
                    onClick={() => navigate(`/session/${selectedSession}/compare`)}
                    data-testid="button-view-comparison"
                    className="hidden sm:flex"
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View Comparison
                  </Button>
                )}
                {/* Desktop Analyze Button */}
                <Button 
                  onClick={() => analyzeSessionMutation.mutate(selectedSession)}
                  disabled={!canAnalyze || analyzeSessionMutation.isPending}
                  data-testid="button-analyze-session"
                  className="hidden sm:flex"
                >
                  {analyzeSessionMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  {analyzeSessionMutation.isPending ? 'Analyzing...' : 'Analyze Photos'}
                </Button>
              </div>
            </div>
            
            {/* Analysis Progress Bar */}
            {analysisProgress && (
              <Card className="mb-6 p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">Analyzing Photos</h3>
                      <p className="text-sm text-muted-foreground">{analysisProgress.message}</p>
                    </div>
                    <Badge variant="secondary" className="font-mono text-lg px-3 py-1">
                      {analysisProgress.percentage}%
                    </Badge>
                  </div>
                  <Progress value={analysisProgress.percentage} className="h-3" />
                  {analysisProgress.status === 'analyzing' && (
                    <p className="text-xs text-muted-foreground text-center">
                      Photo {analysisProgress.currentPhoto} of {analysisProgress.totalPhotos}
                    </p>
                  )}
                </div>
              </Card>
            )}

            {!canAnalyze && photos && photos.length > 0 && photos.length < 2 && (
              <div className="mb-4 p-3 sm:p-4 bg-muted rounded-lg text-sm text-muted-foreground text-center">
                Upload at least 2 photos to start analysis
              </div>
            )}

            {photosLoading ? (
              <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="aspect-square w-full rounded-xl" />
                ))}
              </div>
            ) : photos && photos.length > 0 ? (
              <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3">
                {photos.map((photo) => (
                  <Card key={photo.id} className="overflow-hidden" data-testid={`card-photo-${photo.id}`}>
                    <div className="aspect-square relative bg-muted">
                      <img 
                        src={photo.fileUrl} 
                        alt={photo.originalFilename || "Photo"} 
                        className="w-full h-full object-cover"
                      />
                      {photo.isSelectedBest && (
                        <div className="absolute top-3 right-3">
                          <Badge className="bg-chart-2 text-white gap-1">
                            <Sparkles className="h-3 w-3" />
                            Best Photo
                          </Badge>
                        </div>
                      )}
                      {photo.qualityScore && (
                        <div className="absolute top-3 left-3">
                          <Badge variant="secondary" className="font-mono">
                            {Number(photo.qualityScore).toFixed(0)}
                          </Badge>
                        </div>
                      )}
                    </div>
                    <CardFooter className="p-3 sm:p-4">
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className="text-xs sm:text-sm text-muted-foreground truncate">
                          {photo.originalFilename}
                        </span>
                        {photo.qualityScore && Number(photo.qualityScore) > 0 && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                            <Eye className="h-3 w-3" />
                            <Smile className="h-3 w-3" />
                          </div>
                        )}
                      </div>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-8 sm:p-12 text-center">
                <Upload className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
                <h3 className="text-lg sm:text-xl font-semibold mb-2">No Photos Yet</h3>
                <p className="text-sm sm:text-base text-muted-foreground">Use the "Upload Photos" button above to add at least 2 photos for analysis</p>
              </Card>
            )}
          </div>
        )}
      </main>

      {/* Mobile Sticky Button */}
      {selectedSession && photos && photos.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-background border-t sm:hidden z-40">
          {currentSession?.status === 'completed' ? (
            <Button 
              variant="outline"
              onClick={() => navigate(`/session/${selectedSession}/compare`)}
              data-testid="button-view-comparison-mobile"
              className="w-full min-h-[52px] text-base"
            >
              <Eye className="mr-2 h-5 w-5" />
              View Comparison
            </Button>
          ) : (
            <Button 
              onClick={() => analyzeSessionMutation.mutate(selectedSession)}
              disabled={!canAnalyze || analyzeSessionMutation.isPending}
              data-testid="button-analyze-session-mobile"
              className="w-full min-h-[52px] text-base"
            >
              {analyzeSessionMutation.isPending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-5 w-5" />
              )}
              {analyzeSessionMutation.isPending ? 'Analyzing...' : 'Analyze Photos'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
