import { useState, useCallback, useMemo } from "react";
import { 
  GripVertical, 
  Sparkles, 
  Users, 
  Edit3, 
  X, 
  Check, 
  AlertCircle,
  ZoomIn,
  ZoomOut,
  Grid3X3,
  List,
  Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Interfaces
export interface Photo {
  id: string;
  fileUrl: string;
  originalFilename: string;
  qualityScore?: number;
  isSelectedBest?: boolean;
  confidenceScore?: number;
  groupId?: string;
}

export interface PhotoGroup {
  id: string;
  name: string;
  groupType: 'auto' | 'manual' | 'merged';
  confidenceScore: number;
  similarityScore: number;
  photos: Photo[];
  bestPhotoId?: string;
  metadata?: {
    dominantColors?: string[];
    averageBrightness?: number;
    faceCount?: number;
    timeRange?: {
      start: string;
      end: string;
    };
  };
}

export interface GroupVisualizationProps {
  sessionId: string;
  groups: PhotoGroup[];
  photos: Photo[];
  onGroupSelect: (groupId: string) => void;
  onPhotoMove: (photoId: string, fromGroupId: string, toGroupId: string) => void;
  onGroupEdit: (groupId: string, updates: Partial<PhotoGroup>) => void;
  loading?: boolean;
}

// Photo Card Component
function PhotoCard({ 
  photo, 
  groupId, 
  onPhotoClick 
}: { 
  photo: Photo; 
  groupId: string;
  onPhotoClick?: (photo: Photo) => void;
}) {
  return (
    <div className="relative group cursor-pointer transition-all duration-200">
      <Card className="overflow-hidden hover:shadow-lg transition-shadow">
        <div className="aspect-square relative bg-muted">
          <img
            src={photo.fileUrl}
            alt={photo.originalFilename}
            className="w-full h-full object-cover"
            onClick={() => onPhotoClick?.(photo)}
          />

          {/* Quality/Confidence Score */}
          {(photo.qualityScore || photo.confidenceScore) && (
            <div className="absolute top-2 right-2">
              <Badge 
                variant="secondary" 
                className="bg-black/50 text-white font-mono text-xs"
              >
                {photo.qualityScore ? `${Number(photo.qualityScore).toFixed(0)}` : 
                 photo.confidenceScore ? `${Number(photo.confidenceScore).toFixed(1)}%` : ''}
              </Badge>
            </div>
          )}

          {/* Best Photo Indicator */}
          {photo.isSelectedBest && (
            <div className="absolute bottom-2 right-2">
              <Badge className="bg-green-500 text-white gap-1">
                <Sparkles className="h-3 w-3" />
                Best
              </Badge>
            </div>
          )}
        </div>
        
        <div className="p-2">
          <p className="text-xs truncate font-medium" title={photo.originalFilename}>
            {photo.originalFilename}
          </p>
        </div>
      </Card>
    </div>
  );
}

// Group Component
function Group({ 
  group, 
  onPhotoMove, 
  onGroupEdit, 
  onPhotoClick,
  onGroupSelect 
}: {
  group: PhotoGroup;
  onPhotoMove: (photoId: string, fromGroupId: string, toGroupId: string) => void;
  onGroupEdit: (groupId: string, updates: Partial<PhotoGroup>) => void;
  onPhotoClick?: (photo: Photo) => void;
  onGroupSelect: (groupId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);

  const handleSaveEdit = () => {
    onGroupEdit(group.id, { name: editName });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditName(group.name);
    setIsEditing(false);
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceLabel = (score: number) => {
    if (score >= 0.8) return 'High';
    if (score >= 0.6) return 'Medium';
    return 'Low';
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onGroupSelect(group.id)}
              className="p-1 h-auto"
            >
              <Users className="h-4 w-4" />
            </Button>
            {isEditing ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEdit();
                    if (e.key === 'Escape') handleCancelEdit();
                  }}
                />
                <Button size="sm" variant="ghost" onClick={handleSaveEdit}>
                  <Check className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{group.name}</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditing(true)}
                  className="p-1 h-auto opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Edit3 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {group.photos.length} photos
            </Badge>
            <Badge 
              variant="outline" 
              className={cn("text-xs", getConfidenceColor(group.confidenceScore))}
            >
              {getConfidenceLabel(group.confidenceScore)} confidence
            </Badge>
          </div>
        </div>
        
        {/* Group Stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Similarity: {(group.similarityScore * 100).toFixed(0)}%</span>
          {group.metadata?.faceCount && (
            <span>{group.metadata.faceCount} faces</span>
          )}
          <span className="capitalize">{group.groupType}</span>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {group.photos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                groupId={group.id}
                onPhotoClick={onPhotoClick}
              />
            ))}
          </div>
      </CardContent>
    </Card>
  );
}

// Main Component
export default function GroupVisualizationComponent({
  sessionId,
  groups,
  photos,
  onGroupSelect,
  onPhotoMove,
  onGroupEdit,
  loading = false
}: GroupVisualizationProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const organizedGroups = useMemo(() => {
    return groups.map(group => ({
      ...group,
      photos: group.photos.sort((a, b) => {
        // Sort by quality score descending, then by filename
        const aScore = a.qualityScore || a.confidenceScore || 0;
        const bScore = b.qualityScore || b.confidenceScore || 0;
        if (bScore !== aScore) {
          return bScore - aScore;
        }
        return a.originalFilename.localeCompare(b.originalFilename);
      })
    }));
  }, [groups]);

  const stats = useMemo(() => {
    const totalPhotos = groups.reduce((sum, g) => sum + g.photos.length, 0);
    const avgConfidence = groups.length > 0 
      ? groups.reduce((sum, g) => sum + g.confidenceScore, 0) / groups.length 
      : 0;
    const avgSimilarity = groups.length > 0
      ? groups.reduce((sum, g) => sum + g.similarityScore, 0) / groups.length
      : 0;

    return {
      totalPhotos,
      totalGroups: groups.length,
      avgConfidence,
      avgSimilarity
    };
  }, [groups]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <h3 className="text-lg font-semibold">Organizing Photos...</h3>
          <p className="text-muted-foreground">AI is grouping similar photos together</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">Photo Groups</h2>
              <p className="text-muted-foreground">
                {stats.totalPhotos} photos organized into {stats.totalGroups} groups
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="text-right mr-4">
                <div className="text-sm font-medium">
                  Avg Confidence: {(stats.avgConfidence * 100).toFixed(0)}%
                </div>
                <div className="text-sm font-medium">
                  Avg Similarity: {(stats.avgSimilarity * 100).toFixed(0)}%
                </div>
              </div>
              
              <div className="flex items-center gap-1 border rounded-md">
                <Button
                  size="sm"
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  onClick={() => setViewMode('grid')}
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Groups Grid */}
      <div className={cn(
        "space-y-6",
        viewMode === 'grid' && "grid grid-cols-1 lg:grid-cols-2 gap-6 space-y-0"
      )}>
        {organizedGroups.map((group) => (
          <div key={group.id} data-group-id={group.id}>
            <Group
              group={group}
              onPhotoMove={onPhotoMove}
              onGroupEdit={onGroupEdit}
              onPhotoClick={setSelectedPhoto}
              onGroupSelect={onGroupSelect}
            />
          </div>
        ))}
      </div>

      {/* Photo Preview Dialog */}
      <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedPhoto?.originalFilename}</DialogTitle>
          </DialogHeader>
          {selectedPhoto && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <img
                  src={selectedPhoto.fileUrl}
                  alt={selectedPhoto.originalFilename}
                  className="max-w-full max-h-96 object-contain rounded-lg"
                  style={{ transform: `scale(${zoomLevel})` }}
                />
              </div>
              
              <div className="flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.25))}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setZoomLevel(1)}
                >
                  Reset
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {selectedPhoto.qualityScore && (
                  <div>
                    <span className="font-medium">Quality Score:</span>
                    <div className="font-mono">{Number(selectedPhoto.qualityScore).toFixed(0)}</div>
                  </div>
                )}
                {selectedPhoto.confidenceScore && (
                  <div>
                    <span className="font-medium">Confidence:</span>
                    <div className="font-mono">{Number(selectedPhoto.confidenceScore).toFixed(1)}%</div>
                  </div>
                )}
                {selectedPhoto.isSelectedBest && (
                  <div>
                    <span className="font-medium">Status:</span>
                    <div className="text-green-600">Best Photo</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Empty State */}
      {groups.length === 0 && (
        <Card className="p-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Groups Yet</h3>
          <p className="text-muted-foreground">
            Upload photos and run analysis to create automatic groups
          </p>
        </Card>
      )}
    </div>
  );
}
