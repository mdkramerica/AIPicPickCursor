import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Upload, 
  Sparkles, 
  Users, 
  Brain,
  X,
  RefreshCw,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface AnalysisError {
  photoId: string;
  filename: string;
  error: string;
  retryable: boolean;
}

export interface BulkAnalysisProgress {
  stage: 'uploading' | 'grouping' | 'analyzing' | 'completed' | 'error';
  totalPhotos: number;
  processedPhotos: number;
  currentGroup?: number;
  totalGroups?: number;
  estimatedTimeRemaining?: number;
  errors?: AnalysisError[];
  message?: string;
  currentPhoto?: string;
  currentOperation?: string;
}

export interface BulkAnalysisProgressProps {
  sessionId: string;
  progress: BulkAnalysisProgress;
  onCancel?: () => void;
  onRetry?: (photoId?: string) => void;
  showDetails?: boolean;
}

interface StageConfig {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  color: string;
}

const STAGE_CONFIG: Record<string, StageConfig> = {
  uploading: {
    icon: Upload,
    title: 'Uploading Photos',
    description: 'Uploading your photos to secure cloud storage',
    color: 'text-blue-600'
  },
  grouping: {
    icon: Users,
    title: 'Grouping Similar Photos',
    description: 'AI is finding and grouping similar photos together',
    color: 'text-purple-600'
  },
  analyzing: {
    icon: Brain,
    title: 'Analyzing Photos',
    description: 'AI is analyzing photo quality and detecting faces',
    color: 'text-orange-600'
  },
  completed: {
    icon: CheckCircle,
    title: 'Analysis Complete',
    description: 'Your photos have been successfully analyzed',
    color: 'text-green-600'
  },
  error: {
    icon: AlertCircle,
    title: 'Analysis Failed',
    description: 'There was an error during analysis',
    color: 'text-red-600'
  }
};

function StageIndicator({ 
  stage, 
  isActive, 
  isCompleted, 
  config 
}: {
  stage: string;
  isActive: boolean;
  isCompleted: boolean;
  config: StageConfig;
}) {
  const Icon = config.icon;
  
  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg transition-all",
      isActive && "bg-primary/10 border border-primary/20",
      isCompleted && !isActive && "bg-green-50 border border-green-200",
      !isActive && !isCompleted && "bg-muted/30"
    )}>
      <div className={cn(
        "flex items-center justify-center w-10 h-10 rounded-full transition-all",
        isActive && "bg-primary text-white",
        isCompleted && !isActive && "bg-green-500 text-white",
        !isActive && !isCompleted && "bg-muted text-muted-foreground"
      )}>
        {isCompleted && !isActive ? (
          <CheckCircle className="h-5 w-5" />
        ) : (
          <Icon className={cn("h-5 w-5", isActive && "animate-pulse")} />
        )}
      </div>
      
      <div className="flex-1">
        <h4 className={cn(
          "font-medium",
          isActive && "text-primary",
          isCompleted && !isActive && "text-green-700",
          !isActive && !isCompleted && "text-muted-foreground"
        )}>
          {config.title}
        </h4>
        <p className="text-sm text-muted-foreground">
          {config.description}
        </p>
      </div>
      
      {isActive && (
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      )}
    </div>
  );
}

function ErrorDisplay({ 
  errors, 
  onRetry 
}: { 
  errors: AnalysisError[];
  onRetry?: (photoId?: string) => void;
}) {
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());

  const toggleError = (photoId: string) => {
    const newExpanded = new Set(expandedErrors);
    if (newExpanded.has(photoId)) {
      newExpanded.delete(photoId);
    } else {
      newExpanded.add(photoId);
    }
    setExpandedErrors(newExpanded);
  };

  const retryableErrors = errors.filter(e => e.retryable);
  const nonRetryableErrors = errors.filter(e => !e.retryable);

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Analysis Errors ({errors.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {retryableErrors.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm">Retryable Errors ({retryableErrors.length})</h4>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onRetry?.()}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry All
              </Button>
            </div>
            <div className="space-y-2">
              {retryableErrors.map((error) => (
                <div key={error.photoId} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-sm truncate">{error.filename}</p>
                      <p className="text-xs text-muted-foreground">{error.error}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRetry?.(error.photoId)}
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleError(error.photoId)}
                      >
                        {expandedErrors.has(error.photoId) ? <X className="h-3 w-3" /> : '...'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {nonRetryableErrors.length > 0 && (
          <div>
            <h4 className="font-medium text-sm mb-2">Non-Retryable Errors ({nonRetryableErrors.length})</h4>
            <div className="space-y-2">
              {nonRetryableErrors.map((error) => (
                <div key={error.photoId} className="border rounded-lg p-3 opacity-60">
                  <p className="font-medium text-sm truncate">{error.filename}</p>
                  <p className="text-xs text-muted-foreground">{error.error}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function BulkAnalysisProgressComponent({
  sessionId,
  progress,
  onCancel,
  onRetry,
  showDetails = true
}: BulkAnalysisProgressProps) {
  const [startTime] = useState(Date.now());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate overall progress percentage
  const overallProgress = useMemo(() => {
    if (progress.stage === 'completed') return 100;
    if (progress.stage === 'error') return 0;
    
    const stageWeights: Record<string, number> = {
      uploading: 0.2,
      grouping: 0.3,
      analyzing: 0.5
    };
    
    let totalProgress = 0;
    const stageOrder = ['uploading', 'grouping', 'analyzing'];
    
    for (let i = 0; i < stageOrder.length; i++) {
      const stage = stageOrder[i];
      if (stage === progress.stage) {
        // Current stage: add partial progress
        const stageProgress = progress.totalPhotos > 0 
          ? (progress.processedPhotos / progress.totalPhotos) * stageWeights[stage] * 100
          : 0;
        totalProgress += stageProgress;
        break;
      } else if (stageOrder.indexOf(stage) < stageOrder.indexOf(progress.stage)) {
        // Completed stage: add full weight
        totalProgress += stageWeights[stage] * 100;
      }
    }
    
    return Math.min(totalProgress, 100);
  }, [progress]);

  // Format time remaining
  const formatTimeRemaining = useCallback((ms: number): string => {
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.ceil(minutes / 60);
    return `${hours}h`;
  }, []);

  // Get current stage config
  const currentStageConfig = STAGE_CONFIG[progress.stage] || STAGE_CONFIG.uploading;

  // Determine which stages are completed
  const getStageStatus = useCallback((stage: string) => {
    const stageOrder = ['uploading', 'grouping', 'analyzing'];
    const currentIndex = stageOrder.indexOf(progress.stage);
    const stageIndex = stageOrder.indexOf(stage);
    
    if (stageIndex < currentIndex) return 'completed';
    if (stageIndex === currentIndex) return 'active';
    return 'pending';
  }, [progress.stage]);

  if (progress.stage === 'completed') {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-6 text-center">
          <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-green-800 mb-2">
            Analysis Complete!
          </h3>
          <p className="text-green-700 mb-4">
            Successfully analyzed {progress.totalPhotos} photos
          </p>
          {progress.errors && progress.errors.length > 0 && (
            <p className="text-sm text-yellow-700">
              {progress.errors.length} photos had errors but were skipped
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Progress Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg bg-muted", currentStageConfig.color)}>
                <currentStageConfig.icon className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  {currentStageConfig.title}
                  {progress.stage !== 'error' && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {progress.message || currentStageConfig.description}
                </p>
              </div>
            </div>
            
            {onCancel && !['completed', 'error'].includes(progress.stage) && (
              <Button variant="outline" size="sm" onClick={onCancel}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Overall Progress Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm font-mono">{Math.round(overallProgress)}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>

          {/* Current Stage Progress */}
          {progress.stage !== 'error' && progress.totalPhotos > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  {progress.stage === 'uploading' && 'Uploading photos...'}
                  {progress.stage === 'grouping' && 'Creating groups...'}
                  {progress.stage === 'analyzing' && 'Analyzing photos...'}
                </span>
                <span className="text-sm text-muted-foreground font-mono">
                  {progress.processedPhotos} / {progress.totalPhotos}
                </span>
              </div>
              <Progress 
                value={(progress.processedPhotos / progress.totalPhotos) * 100} 
                className="h-1" 
              />
            </div>
          )}

          {/* Time Remaining */}
          {progress.estimatedTimeRemaining && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Estimated time remaining: {formatTimeRemaining(progress.estimatedTimeRemaining)}</span>
            </div>
          )}

          {/* Current Operation */}
          {progress.currentOperation && (
            <div className="text-sm text-muted-foreground">
              {progress.currentOperation}
            </div>
          )}

          {/* Current Photo/Group Info */}
          {progress.currentPhoto && !['completed'].includes(progress.stage) && (
            <div className="text-sm text-muted-foreground">
              Processing: {progress.currentPhoto}
            </div>
          )}
          
          {progress.currentGroup && progress.totalGroups && (
            <div className="text-sm text-muted-foreground">
              Group {progress.currentGroup} of {progress.totalGroups}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stage Indicators */}
      {showDetails && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Analysis Stages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(STAGE_CONFIG).map(([stage, config]) => {
              const status = getStageStatus(stage);
              return (
                <StageIndicator
                  key={stage}
                  stage={stage}
                  isActive={status === 'active'}
                  isCompleted={status === 'completed'}
                  config={config}
                />
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Errors Display */}
      {progress.errors && progress.errors.length > 0 && onRetry && (
        <ErrorDisplay errors={progress.errors} onRetry={onRetry} />
      )}

      {/* Error State */}
      {progress.stage === 'error' && (
        <Card className="border-destructive/50">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-destructive mb-2">
              Analysis Failed
            </h3>
            <p className="text-muted-foreground mb-4">
              {progress.message || 'An error occurred during analysis'}
            </p>
            {onRetry && (
              <Button onClick={() => onRetry()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Analysis
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
