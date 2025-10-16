import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Sparkles, Loader2, CheckCircle2, XCircle } from "lucide-react";

type DetectedFace = {
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence: number;
};

type FaceDetectionResult = {
  photoId: string;
  faces: DetectedFace[];
};

type Photo = {
  id: string;
  fileUrl: string;
  originalFilename: string | null;
};

type FaceSelection = {
  [photoId: string]: {
    [faceIdx: number]: boolean; // true = included, false = excluded
  };
};

export default function FacePreview() {
  const [, params] = useRoute("/session/:sessionId/preview");
  const sessionId = params?.sessionId;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [faceSelections, setFaceSelections] = useState<FaceSelection>({});

  // Fetch photos
  const { data: photos, isLoading: photosLoading } = useQuery<Photo[]>({
    queryKey: ["/api/sessions", sessionId, "photos"],
    enabled: !!sessionId,
  });
  
  console.log("📸 Photos from query:", photos?.map(p => ({ id: p.id, filename: p.originalFilename })));

  // Trigger face detection
  const detectFacesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/sessions/${sessionId}/preview`, {});
      if (!res.ok) {
        const errorText = await res.text();
        console.error("❌ Detection API failed:", res.status, errorText);
        throw new Error(`Detection failed: ${res.status}`);
      }
      const data = await res.json();
      console.log("🔍 Face detection API response:", data);
      return data;
    },
    onError: (error) => {
      console.error("❌ Detection mutation error:", error);
    }
  });

  const detectionResults = detectFacesMutation.data as { detections: FaceDetectionResult[] } | undefined;
  
  console.log("📊 Detection state:", {
    isPending: detectFacesMutation.isPending,
    isError: detectFacesMutation.isError,
    hasData: !!detectFacesMutation.data,
    detectionResults,
    photosCount: photos?.length,
  });

  // Initialize face selections (all faces included by default)
  useEffect(() => {
    if (detectionResults?.detections) {
      const initialSelections: FaceSelection = {};
      detectionResults.detections.forEach((result) => {
        initialSelections[result.photoId] = {};
        result.faces.forEach((_, idx) => {
          initialSelections[result.photoId][idx] = true; // Include by default
        });
      });
      setFaceSelections(initialSelections);
    }
  }, [detectionResults]);

  // Trigger detection on mount
  useEffect(() => {
    if (sessionId && !detectFacesMutation.data && !detectFacesMutation.isPending && photos && photos.length > 0) {
      detectFacesMutation.mutate();
    }
  }, [sessionId, photos]);

  // Analyze with selected faces
  const analyzeWithSelectionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/sessions/${sessionId}/analyze`, {
        faceSelections,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      toast({
        title: "Analysis Complete",
        description: "Your photos have been analyzed",
      });
      navigate("/");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to analyze photos",
        variant: "destructive",
      });
    },
  });

  const toggleFace = (photoId: string, faceIdx: number) => {
    setFaceSelections((prev) => ({
      ...prev,
      [photoId]: {
        ...prev[photoId],
        [faceIdx]: !prev[photoId]?.[faceIdx],
      },
    }));
  };

  const totalFaces = detectionResults?.detections?.reduce((sum, result) => sum + result.faces.length, 0) || 0;
  const selectedFaces = Object.values(faceSelections).reduce(
    (sum, photoFaces) => sum + Object.values(photoFaces).filter(Boolean).length,
    0
  );

  if (!sessionId) {
    return <div>Invalid session</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Select Faces</h1>
              <p className="text-sm text-muted-foreground">
                Choose which faces to include in analysis
              </p>
            </div>
          </div>
          {detectionResults && (
            <Badge variant="outline" className="hidden sm:flex">
              {selectedFaces} of {totalFaces} faces selected
            </Badge>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-6 pb-24">
        {/* Instructions */}
        <Card className="p-4 mb-6">
          <p className="text-sm text-muted-foreground">
            Tap faces to exclude them from analysis. Excluded faces will be ignored when selecting the best photo.
          </p>
        </Card>

        {/* Loading state */}
        {(photosLoading || detectFacesMutation.isPending) && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="w-full h-64" />
            ))}
          </div>
        )}

        {/* Error state */}
        {detectFacesMutation.isError && (
          <Card className="p-6 text-center">
            <p className="text-destructive">Failed to detect faces. Please try again.</p>
            <Button
              onClick={() => detectFacesMutation.mutate()}
              className="mt-4"
              data-testid="button-retry-detection"
            >
              Retry
            </Button>
          </Card>
        )}

        {/* Photos with faces */}
        {detectionResults && detectionResults.detections && photos && (
          <div className="space-y-6">
            {photos.map((photo) => {
              const detection = detectionResults.detections?.find((d) => d.photoId === photo.id);
              console.log("🔎 Photo matching:", {
                photoId: photo.id,
                detectionPhotoIds: detectionResults.detections.map(d => d.photoId),
                foundMatch: !!detection,
                faceCount: detection?.faces.length || 0
              });
              if (!detection || detection.faces.length === 0) {
                console.log("⏭️ Skipping photo (no detection or no faces):", photo.id);
                return null;
              }

              console.log("🎨 Rendering Card for photo:", photo.id, detection.faces.length, "faces");
              return (
                <Card key={photo.id} className="overflow-hidden" data-testid={`card-photo-preview-${photo.id}`}>
                  <div className="p-4">
                    <h3 className="font-medium mb-2">
                      {photo.originalFilename || "Photo"} ({detection.faces.length} faces)
                    </h3>
                    <div className="relative">
                      <FacePreviewImage
                        photo={photo}
                        faces={detection.faces}
                        selections={faceSelections[photo.id] || {}}
                        onToggleFace={(idx) => toggleFace(photo.id, idx)}
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Bottom action bar */}
      {detectionResults && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t">
          <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {selectedFaces} of {totalFaces} faces selected
            </div>
            <Button
              onClick={() => analyzeWithSelectionMutation.mutate()}
              disabled={selectedFaces === 0 || analyzeWithSelectionMutation.isPending}
              className="w-full sm:w-auto min-h-[44px]"
              data-testid="button-analyze-with-selection"
            >
              {analyzeWithSelectionMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Analyze Photos
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FacePreviewImage({
  photo,
  faces,
  selections,
  onToggleFace,
}: {
  photo: Photo;
  faces: DetectedFace[];
  selections: { [faceIdx: number]: boolean };
  onToggleFace: (faceIdx: number) => void;
}) {
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });

  return (
    <div className="relative w-full">
      <img
        src={photo.fileUrl}
        alt={photo.originalFilename || "Photo"}
        className="w-full h-auto"
        onLoad={(e) => {
          const img = e.currentTarget;
          console.log("✅ Image loaded:", photo.fileUrl, {
            natural: { w: img.naturalWidth, h: img.naturalHeight },
            client: { w: img.clientWidth, h: img.clientHeight }
          });
          setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
          setContainerDimensions({ width: img.clientWidth, height: img.clientHeight });
        }}
        onError={(e) => {
          console.error("❌ Image failed to load:", photo.fileUrl, e);
        }}
        data-testid={`img-preview-${photo.id}`}
      />

      {/* Face overlays */}
      {containerDimensions.width > 0 && (
        <svg
          className="absolute top-0 left-0 pointer-events-none"
          style={{
            width: `${containerDimensions.width}px`,
            height: `${containerDimensions.height}px`,
          }}
          viewBox={`0 0 ${containerDimensions.width} ${containerDimensions.height}`}
        >
          {faces.map((face, idx) => {
            const included = selections[idx] !== false;
            const x = face.boundingBox.x * containerDimensions.width;
            const y = face.boundingBox.y * containerDimensions.height;
            const width = face.boundingBox.width * containerDimensions.width;
            const height = face.boundingBox.height * containerDimensions.height;
            const color = included ? "#10b981" : "#6b7280";

            return (
              <g key={idx}>
                {/* Clickable overlay for toggling */}
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill="transparent"
                  stroke={color}
                  strokeWidth="3"
                  className="pointer-events-auto cursor-pointer"
                  onClick={() => onToggleFace(idx)}
                  data-testid={`face-toggle-${photo.id}-${idx}`}
                />

                {/* Status indicator */}
                <circle
                  cx={x + width - 12}
                  cy={y + 12}
                  r="10"
                  fill={color}
                  className="pointer-events-auto cursor-pointer"
                  onClick={() => onToggleFace(idx)}
                />
                {included ? (
                  <path
                    d={`M ${x + width - 16} ${y + 12} l 3 3 l 6 -6`}
                    stroke="white"
                    strokeWidth="2"
                    fill="none"
                    className="pointer-events-none"
                  />
                ) : (
                  <>
                    <line
                      x1={x + width - 16}
                      y1={y + 8}
                      x2={x + width - 8}
                      y2={y + 16}
                      stroke="white"
                      strokeWidth="2"
                      className="pointer-events-none"
                    />
                    <line
                      x1={x + width - 8}
                      y1={y + 8}
                      x2={x + width - 16}
                      y2={y + 16}
                      stroke="white"
                      strokeWidth="2"
                      className="pointer-events-none"
                    />
                  </>
                )}

                {/* Face number label */}
                <rect
                  x={x}
                  y={y - 28}
                  width={60}
                  height={24}
                  fill={color}
                  rx="4"
                  className="pointer-events-none"
                />
                <text
                  x={x + 30}
                  y={y - 16}
                  fill="white"
                  fontSize="14"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none"
                >
                  Face {idx + 1}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
