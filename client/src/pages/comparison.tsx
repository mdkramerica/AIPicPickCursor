import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, AlertCircle, Eye, EyeOff, Smile, Share2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";

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

export default function Comparison() {
  const [, params] = useRoute("/session/:sessionId/compare");
  const sessionId = params?.sessionId;
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSharing, setIsSharing] = useState(false);
  const [presignedUrls, setPresignedUrls] = useState<Record<string, string>>({});

  const { data: photos, isLoading } = useQuery<Photo[]>({
    queryKey: ["/api/sessions", sessionId, "photos"],
    enabled: !!sessionId && !!user,
  });

  // Fetch presigned URLs for all photos
  const { data: presignedData, isLoading: presignedLoading } = useQuery<{
    photos: Array<{ photoId: string; presignedUrl: string | null }>;
  }>({
    queryKey: ["/api/sessions", sessionId, "photos/presigned-urls"],
    enabled: !!sessionId && !!user,
  });

  // Update presignedUrls state when data arrives
  useEffect(() => {
    if (presignedData?.photos) {
      const urlMap: Record<string, string> = {};
      presignedData.photos.forEach((item) => {
        if (item.presignedUrl) {
          urlMap[item.photoId] = item.presignedUrl;
        }
      });
      setPresignedUrls(urlMap);
    }
  }, [presignedData]);

  const sharePhoto = async (photoUrl: string, filename: string) => {
    setIsSharing(true);
    
    try {
      // First try Web Share API with file sharing
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [] })) {
        try {
          // Fetch the image as a blob
          const response = await fetch(photoUrl, { mode: 'cors' });
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
          }
          const blob = await response.blob();
          
          // Create an image bitmap with proper orientation handling
          // 'from-image' respects EXIF orientation data
          const imageBitmap = await createImageBitmap(blob, {
            imageOrientation: 'from-image'
          });
          
          // Create a canvas and draw the properly oriented image
          const canvas = document.createElement('canvas');
          canvas.width = imageBitmap.width;
          canvas.height = imageBitmap.height;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            throw new Error('Could not get canvas context');
          }
          
          // Draw the image with proper orientation
          ctx.drawImage(imageBitmap, 0, 0);
          
          // Convert canvas to blob with high quality
          const orientedBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  resolve(blob);
                } else {
                  reject(new Error('Failed to create blob from canvas'));
                }
              },
              'image/jpeg',
              0.95 // High quality
            );
          });
          
          // Create a file from the oriented blob
          const file = new File([orientedBlob], filename, { type: 'image/jpeg' });

          // Check if we can share files
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: 'Best Group Photo',
              text: 'Check out this photo selected by AI!',
            });
          } else {
            // Fallback to URL sharing
            await navigator.share({
              title: 'Best Group Photo',
              text: 'Check out this photo selected by AI!',
              url: window.location.href,
            });
          }

          toast({
            title: "Shared successfully!",
            description: "Photo shared via your selected app",
          });
          return;
        } catch (shareError) {
          console.warn('Web Share API failed, trying fallback:', shareError);
          // Fall through to fallback methods
        }
      }

      // Fallback 1: Try basic Web Share API without files
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Best Group Photo',
            text: 'Check out this photo selected by AI!',
            url: window.location.href,
          });
          
          toast({
            title: "Shared successfully!",
            description: "Link shared via your selected app",
          });
          return;
        } catch (basicShareError) {
          console.warn('Basic Web Share API failed:', basicShareError);
        }
      }

      // Fallback 2: Copy image URL to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast({
          title: "Link copied!",
          description: "Photo page link copied to clipboard. Share it with your friends!",
        });
      } catch (clipboardError) {
        console.warn('Clipboard access failed:', clipboardError);
        
        // Fallback 3: Download the image
        try {
          const response = await fetch(photoUrl, { mode: 'cors' });
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
          }
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          toast({
            title: "Download started!",
            description: "Photo downloaded for sharing",
          });
        } catch (downloadError) {
          throw new Error('All sharing methods failed. Please try again.');
        }
      }
    } catch (error) {
      console.error('Share error:', error);
      toast({
        title: "Sharing failed",
        description: error instanceof Error ? error.message : "Could not share the photo. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSharing(false);
    }
  };

  if (isLoading || presignedLoading) {
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

  // Filter out photos with 0 faces and sort by quality score
  const sortedPhotos = (photos || [])
    .filter(photo => {
      const faces = photo.analysisData?.faces || [];
      return faces.length > 0; // Only show photos with detected faces
    })
    .sort((a, b) => {
      const scoreA = parseFloat(a.qualityScore) || 0;
      const scoreB = parseFloat(b.qualityScore) || 0;
      return scoreB - scoreA;
    });

  // Component for photo with properly aligned bounding boxes
  const PhotoWithBoundingBoxes = ({
    photo,
    faces
  }: {
    photo: Photo;
    faces: Photo['analysisData']['faces']
  }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const [overlayDimensions, setOverlayDimensions] = useState<{
      width: number;
      height: number;
      offsetX: number;
      offsetY: number;
      scale: number;
    } | null>(null);

    // Get presigned URL for this photo
    const imageUrl = presignedUrls[photo.id] || photo.fileUrl;

    const updateOverlayDimensions = () => {
      const container = containerRef.current;
      const image = imageRef.current;

      if (!container || !image || !image.naturalWidth) return;

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const imageWidth = image.naturalWidth;
      const imageHeight = image.naturalHeight;

      // Calculate scale (object-contain logic)
      const scale = Math.min(
        containerWidth / imageWidth,
        containerHeight / imageHeight
      );

      // Calculate displayed dimensions
      const displayedWidth = imageWidth * scale;
      const displayedHeight = imageHeight * scale;

      // Calculate offset (centering logic)
      const offsetX = (containerWidth - displayedWidth) / 2;
      const offsetY = (containerHeight - displayedHeight) / 2;

      setOverlayDimensions({
        width: displayedWidth,
        height: displayedHeight,
        offsetX,
        offsetY,
        scale,
      });
    };

    useEffect(() => {
      const image = imageRef.current;
      if (!image) return;

      // Update on load
      image.addEventListener('load', updateOverlayDimensions);

      // Update on resize
      const resizeObserver = new ResizeObserver(updateOverlayDimensions);
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }

      // Initial update if image already loaded
      if (image.complete) {
        updateOverlayDimensions();
      }

      return () => {
        image.removeEventListener('load', updateOverlayDimensions);
        resizeObserver.disconnect();
      };
    }, [imageUrl]);

    return (
      <div ref={containerRef} className="relative bg-muted aspect-[4/3]">
        <img
          ref={imageRef}
          src={imageUrl}
          alt={photo.originalFilename}
          className="w-full h-full object-contain"
          data-testid={`img-photo-${photo.id}`}
        />
        
        {/* Face bounding boxes overlay - positioned to match displayed image */}
        {overlayDimensions && (
          <svg
            className="absolute pointer-events-none"
            style={{
              left: `${overlayDimensions.offsetX}px`,
              top: `${overlayDimensions.offsetY}px`,
              width: `${overlayDimensions.width}px`,
              height: `${overlayDimensions.height}px`,
            }}
            viewBox={`0 0 ${overlayDimensions.width} ${overlayDimensions.height}`}
          >
            {faces.map((face, faceIdx) => {
              const x = face.boundingBox.x * overlayDimensions.width;
              const y = face.boundingBox.y * overlayDimensions.height;
              const width = face.boundingBox.width * overlayDimensions.width;
              const height = face.boundingBox.height * overlayDimensions.height;
              const color = face.attributes.eyesOpen.detected ? "#10b981" : "#ef4444";
              
              // Position label above box, or below if too close to top edge
              const labelHeight = 24;
              const labelPadding = 4;
              const labelAboveY = y - labelHeight - labelPadding;
              const labelBelowY = y + height + labelPadding;
              const labelY = labelAboveY < 0 ? labelBelowY : labelAboveY;
              const textY = labelY + labelHeight / 2;
              
              return (
                <g key={face.faceId}>
                  {/* Bounding box rectangle */}
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill="none"
                    stroke={color}
                    strokeWidth="3"
                    data-testid={`bbox-face-${photo.id}-${faceIdx}`}
                  />
                  
                  {/* Face label - positioned above or below box to avoid clipping */}
                  <g>
                    {/* Label background */}
                    <rect
                      x={x}
                      y={labelY}
                      width={60}
                      height={labelHeight}
                      fill={color}
                      rx="4"
                    />
                    {/* Label text */}
                    <text
                      x={x + 30}
                      y={textY}
                      fill="white"
                      fontSize="16"
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      Face {faceIdx + 1}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    );
  };

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
                  {/* Photo with properly aligned bounding boxes */}
                  <PhotoWithBoundingBoxes photo={photo} faces={faces} />

                  {/* Winner badge */}
                  {photo.isSelectedBest && (
                    <Badge
                      className="absolute top-2 right-2 bg-primary text-primary-foreground z-10"
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
                            {face.qualityScore != null ? face.qualityScore.toFixed(1) : 'N/A'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Share button - available for all photos */}
                  <Button
                    onClick={() => sharePhoto(presignedUrls[photo.id] || photo.fileUrl, photo.originalFilename)}
                    disabled={isSharing}
                    variant={photo.isSelectedBest ? "default" : "outline"}
                    className="w-full mt-3"
                    data-testid={`button-share-${index}`}
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    {isSharing ? "Sharing..." : "Share Photo"}
                  </Button>
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
                The AI uses SSD MobileNet v1 for accurate face detection. Some faces might not be detected if they are:
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
