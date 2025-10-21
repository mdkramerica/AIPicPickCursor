import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2, Images, LogOut, Home } from "lucide-react";
import { useState } from "react";
import type { PhotoSession, Photo } from "@shared/schema";
import { useKindeAuth } from "@kinde-oss/kinde-auth-react";

type AlbumItem = {
  session: PhotoSession;
  bestPhoto: Photo;
};

type PhotoWithAnalysis = {
  id: string;
  fileUrl: string;
  originalFilename: string;
  qualityScore: string;
  isSelectedBest: boolean;
  analysisData: {
    faces: Array<{
      faceId: string;
      boundingBox: { x: number; y: number; width: number; height: number };
      attributes: {
        eyesOpen: { detected: boolean };
        smile: { detected: boolean; intensity: number };
        expression: string;
      };
      qualityScore: number | null;
    }>;
    overallQualityScore: number | null;
    issues: {
      closedEyes: number;
      poorExpressions: number;
      blurryFaces: number;
    };
    recommendation: string;
  };
};

export default function Album() {
  const { user } = useAuth();
  const { logout } = useKindeAuth();
  const { toast } = useToast();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);

  // Fetch album data
  const { data: album, isLoading } = useQuery<AlbumItem[]>({
    queryKey: ["/api/album"],
  });

  // Fetch photos for selected session
  const { data: sessionPhotos } = useQuery<PhotoWithAnalysis[]>({
    queryKey: ["/api/sessions", selectedSessionId, "photos"],
    enabled: !!selectedSessionId,
  });

  // Delete photo mutation
  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: string) => {
      await apiRequest("DELETE", `/api/photos/${photoId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/album"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", selectedSessionId, "photos"] });
      toast({
        title: "Photo deleted",
        description: "The photo has been removed from your album",
      });
      setPhotoToDelete(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete photo",
        variant: "destructive",
      });
    },
  });

  // Mark photo as best mutation
  const markBestMutation = useMutation({
    mutationFn: async (photoId: string) => {
      await apiRequest("PATCH", `/api/photos/${photoId}/mark-best`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/album"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", selectedSessionId, "photos"] });
      toast({
        title: "Best photo updated",
        description: "The selected photo is now marked as best",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update best photo",
        variant: "destructive",
      });
    },
  });


  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Images className="w-6 h-6 text-primary" />
              <h1 className="text-xl font-semibold">Best Photos Album</h1>
            </div>
            {user && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild data-testid="button-home">
                  <Link href="/">
                    <Home className="w-4 h-4 mr-2" />
                    Dashboard
                  </Link>
                </Button>
                <span className="text-sm text-muted-foreground">
                  {user.firstName} {user.lastName}
                </span>
                <Button variant="ghost" size="sm" onClick={() => logout()} data-testid="button-logout">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </div>
            )}
          </div>
        </header>
        <div className="container mx-auto px-4 py-8 flex items-center justify-center">
          <p className="text-muted-foreground">Loading your album...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Images className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold">Best Photos Album</h1>
          </div>
          {user && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild data-testid="button-home">
                <Link href="/">
                  <Home className="w-4 h-4 mr-2" />
                  Dashboard
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground">
                {user.firstName} {user.lastName}
              </span>
              <Button variant="ghost" size="sm" onClick={() => logout()} data-testid="button-logout">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!album || album.length === 0 ? (
          <div className="text-center py-12">
            <Images className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-semibold mb-2">No photos yet</h2>
            <p className="text-muted-foreground mb-6">
              Upload and analyze photos to see your best shots here
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {album.map(({ session, bestPhoto }) => (
              <Card
                key={session.id}
                className="overflow-hidden hover-elevate cursor-pointer"
                onClick={() => setSelectedSessionId(session.id)}
                data-testid={`card-album-${session.id}`}
              >
                <div className="aspect-square relative">
                  <img
                    src={bestPhoto.fileUrl}
                    alt={session.name || "Best photo"}
                    className="w-full h-full object-cover"
                    data-testid={`img-best-${session.id}`}
                  />
                </div>
                <div className="p-4">
                  <h3 className="font-medium truncate" data-testid={`text-session-name-${session.id}`}>
                    {session.name || "Untitled Session"}
                  </h3>
                  <p className="text-sm text-muted-foreground" data-testid={`text-session-date-${session.id}`}>
                    {new Date(session.createdAt).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {session.photoCount} {session.photoCount === 1 ? "photo" : "photos"}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Session Detail Dialog */}
      <Dialog open={!!selectedSessionId} onOpenChange={(open) => !open && setSelectedSessionId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-session-detail">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {album?.find(a => a.session.id === selectedSessionId)?.session.name || "Session Photos"}
            </DialogTitle>
            <DialogDescription>
              Select a different photo to mark as best, or delete photos from this session
            </DialogDescription>
          </DialogHeader>
          
          {sessionPhotos && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              {sessionPhotos.map((photo) => (
                <Card key={photo.id} className={photo.isSelectedBest ? "border-primary border-2" : ""} data-testid={`card-photo-${photo.id}`}>
                  <div className="aspect-square relative">
                    <img
                      src={photo.fileUrl}
                      alt={photo.originalFilename || "Photo"}
                      className="w-full h-full object-cover rounded-t-md"
                      data-testid={`img-photo-${photo.id}`}
                    />
                    {photo.isSelectedBest && (
                      <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs font-medium px-2 py-1 rounded" data-testid={`badge-best-${photo.id}`}>
                        Best Photo
                      </div>
                    )}
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">
                        {photo.originalFilename || "Untitled"}
                      </span>
                    </div>
                    {photo.analysisData && (
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>Score: {photo.analysisData.overallQualityScore?.toFixed(1) || "N/A"}</div>
                        <div>
                          Eyes open: {photo.analysisData.faces.filter(f => f.attributes.eyesOpen.detected).length}/{photo.analysisData.faces.length}
                        </div>
                        <div>
                          Smiling: {photo.analysisData.faces.filter(f => f.attributes.smile.detected).length}/{photo.analysisData.faces.length}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      {!photo.isSelectedBest && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => markBestMutation.mutate(photo.id)}
                          disabled={markBestMutation.isPending}
                          data-testid={`button-mark-best-${photo.id}`}
                        >
                          Mark as Best
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPhotoToDelete(photo.id)}
                        data-testid={`button-delete-${photo.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!photoToDelete} onOpenChange={(open) => !open && setPhotoToDelete(null)}>
        <AlertDialogContent data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Photo</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this photo? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => photoToDelete && deletePhotoMutation.mutate(photoToDelete)}
              disabled={deletePhotoMutation.isPending}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
