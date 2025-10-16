import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, AlertCircle, Eye, EyeOff, Smile } from "lucide-react";

type Photo = {
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
      qualityScore: number;
    }>;
    overallQualityScore: number;
    issues: {
      closedEyes: number;
      poorExpressions: number;
      blurryFaces: number;
    };
    recommendation: string;
  };
};

export default function Comparison() {
  const [, params] = useRoute("/session/:sessionId/compare");
  const sessionId = params?.sessionId;
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const { data: photos, isLoading } = useQuery<Photo[]>({
    queryKey: ["/api/sessions", sessionId, "photos"],
    enabled: !!sessionId && !!user,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading comparison...</p>
      </div>
    );
  }

  if (!photos || photos.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">No photos to compare</p>
      </div>
    );
  }

  const sortedPhotos = [...photos].sort((a, b) => 
    parseFloat(b.qualityScore) - parseFloat(a.qualityScore)
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 pb-20 max-w-7xl">
        <Button
          variant="ghost"
          onClick={() => setLocation("/")}
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>

        <h1 className="text-3xl font-bold mb-2">Photo Comparison</h1>
        <p className="text-muted-foreground mb-6">
          See how each photo scored and which faces were detected
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {sortedPhotos.map((photo, index) => {
            const score = parseFloat(photo.qualityScore);
            const faces = photo.analysisData?.faces || [];
            const issues = photo.analysisData?.issues;

            return (
              <Card
                key={photo.id}
                className={`overflow-hidden ${
                  photo.isSelectedBest ? "ring-2 ring-primary" : ""
                }`}
                data-testid={`card-photo-${index}`}
              >
                <div className="relative">
                  {/* Photo */}
                  <div className="relative bg-muted">
                    <img
                      src={photo.fileUrl}
                      alt={photo.originalFilename}
                      className="w-full h-64 object-cover"
                      data-testid={`img-photo-${index}`}
                    />
                    
                    {/* Face bounding boxes overlay */}
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      {faces.map((face, faceIdx) => (
                        <rect
                          key={face.faceId}
                          x={face.boundingBox.x * 100}
                          y={face.boundingBox.y * 100}
                          width={face.boundingBox.width * 100}
                          height={face.boundingBox.height * 100}
                          fill="none"
                          stroke={face.attributes.eyesOpen.detected ? "#10b981" : "#ef4444"}
                          strokeWidth="1"
                          data-testid={`bbox-face-${index}-${faceIdx}`}
                        />
                      ))}
                    </svg>
                  </div>

                  {/* Winner badge */}
                  {photo.isSelectedBest && (
                    <Badge
                      className="absolute top-2 right-2 bg-primary text-primary-foreground"
                      data-testid={`badge-winner-${index}`}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Winner
                    </Badge>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  {/* Score */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Quality Score</span>
                    <span className={`text-2xl font-bold ${
                      score >= 85 ? "text-green-600 dark:text-green-400" :
                      score >= 70 ? "text-blue-600 dark:text-blue-400" :
                      score >= 50 ? "text-yellow-600 dark:text-yellow-400" :
                      "text-red-600 dark:text-red-400"
                    }`} data-testid={`text-score-${index}`}>
                      {score.toFixed(1)}
                    </span>
                  </div>

                  {/* Filename */}
                  <p className="text-xs text-muted-foreground truncate" data-testid={`text-filename-${index}`}>
                    {photo.originalFilename}
                  </p>

                  {/* Faces detected */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Faces Detected:</span>
                    <Badge variant="outline" data-testid={`badge-faces-${index}`}>
                      {faces.length}
                    </Badge>
                  </div>

                  {/* Issues */}
                  <div className="space-y-2">
                    {issues && issues.closedEyes > 0 && (
                      <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                        <EyeOff className="w-4 h-4" />
                        <span>{issues.closedEyes} closed eyes</span>
                      </div>
                    )}
                    {issues && issues.closedEyes === 0 && faces.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                        <Eye className="w-4 h-4" />
                        <span>All eyes open</span>
                      </div>
                    )}
                    {faces.every(f => f.attributes.smile.detected) && faces.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                        <Smile className="w-4 h-4" />
                        <span>All smiling</span>
                      </div>
                    )}
                  </div>

                  {/* Face quality breakdown */}
                  {faces.length > 0 && (
                    <div className="pt-2 border-t space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Face Quality:</p>
                      {faces.map((face, faceIdx) => (
                        <div key={face.faceId} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Face {faceIdx + 1}</span>
                          <span className="font-medium" data-testid={`text-face-quality-${index}-${faceIdx}`}>
                            {face.qualityScore.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Detection info */}
        <Card className="mt-8 p-6 bg-muted/50">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="space-y-2">
              <h3 className="font-semibold">About Face Detection</h3>
              <p className="text-sm text-muted-foreground">
                The AI uses TinyFaceDetector optimized for CPU processing. Some faces might not be detected if they are:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>Too small (faces should be at least 80x80 pixels)</li>
                <li>At extreme angles or partially occluded</li>
                <li>In poor lighting or out of focus</li>
                <li>At the edges with partial visibility</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                Green boxes = Eyes open | Red boxes = Eyes closed
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
