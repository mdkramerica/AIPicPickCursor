import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Types
export interface BulkSessionOptions {
  name?: string;
  description?: string;
  maxGroups?: number;
  similarityThreshold?: number;
  enableFaceDetection?: boolean;
  enableQualityAnalysis?: boolean;
}

export interface GroupingOptions {
  algorithm?: 'kmeans' | 'hierarchical' | 'spectral';
  nClusters?: number;
  similarityThreshold?: number;
  enableTemporalGrouping?: boolean;
  enableLocationGrouping?: boolean;
  enableFeatureGrouping?: boolean;
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
  startTime?: number;
  endTime?: number;
}

export interface AnalysisError {
  photoId: string;
  filename: string;
  error: string;
  retryable: boolean;
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

export interface Photo {
  id: string;
  fileUrl: string;
  originalFilename: string;
  qualityScore?: number;
  isSelectedBest?: boolean;
  confidenceScore?: number;
  groupId?: string;
  metadata?: {
    fileSize?: number;
    dimensions?: { width: number; height: number };
    uploadTime?: string;
    analysisTime?: string;
  };
}

export interface BulkSession {
  id: string;
  name: string;
  description?: string;
  status: 'creating' | 'uploading' | 'grouping' | 'analyzing' | 'completed' | 'error';
  totalPhotos: number;
  processedPhotos: number;
  groups: PhotoGroup[];
  createdAt: string;
  updatedAt: string;
  settings: {
    maxGroups?: number;
    similarityThreshold?: number;
    enableFaceDetection?: boolean;
    enableQualityAnalysis?: boolean;
  };
  progress?: BulkAnalysisProgress;
}

// Hook
export function useBulkSession(sessionId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [progress, setProgress] = useState<BulkAnalysisProgress>({
    stage: 'uploading',
    totalPhotos: 0,
    processedPhotos: 0
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch session details
  const { data: session, isLoading: sessionLoading, error: sessionError } = useQuery<BulkSession>({
    queryKey: ['/api/bulk-sessions', sessionId],
    enabled: !!sessionId,
    refetchInterval: (data: BulkSession | undefined) => {
      // Refetch more frequently during active processing
      if (data && (data.status === 'uploading' || data.status === 'grouping' || data.status === 'analyzing')) {
        return 2000; // 2 seconds
      }
      return false; // Don't refetch automatically
    }
  });

  // Start progress tracking
  const startProgressTracking = useCallback((sessionId: string) => {
    // Clear any existing tracking
    stopProgressTracking();

    // Use Server-Sent Events for real-time progress
    try {
      const eventSource = new EventSource(`/api/bulk-sessions/${sessionId}/progress`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setProgress(data.progress);

          // Update session data in cache
          queryClient.setQueryData(['/api/bulk-sessions', sessionId], (old: BulkSession | undefined) => {
            if (!old) return old;
            return {
              ...old,
              ...data.session,
              progress: data.progress
            };
          });

          // Stop tracking when completed or error
          if (data.progress.stage === 'completed' || data.progress.stage === 'error') {
            stopProgressTracking();
          }
        } catch (error) {
          console.error('Error parsing progress data:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        // Fallback to polling if SSE fails
        startPollingFallback(sessionId);
      };

    } catch (error) {
      console.error('Error setting up SSE:', error);
      // Fallback to polling
      startPollingFallback(sessionId);
    }
  }, [queryClient]);

  // Fallback polling mechanism
  const startPollingFallback = useCallback((sessionId: string) => {
    progressIntervalRef.current = setInterval(async () => {
      try {
        const response = await apiRequest('GET', `/api/bulk-sessions/${sessionId}/progress`);
        const data = await response.json();
        
        if (data.progress) {
          setProgress(data.progress);

          // Update session data in cache
          queryClient.setQueryData(['/api/bulk-sessions', sessionId], (old: BulkSession | undefined) => {
            if (!old) return old;
            return {
              ...old,
              ...data.session,
              progress: data.progress
            };
          });

          // Stop polling when completed or error
          if (data.progress.stage === 'completed' || data.progress.stage === 'error') {
            stopProgressTracking();
          }
        }
      } catch (error) {
        console.error('Error polling progress:', error);
      }
    }, 2000); // Poll every 2 seconds
  }, [queryClient]);

  // Stop progress tracking
  const stopProgressTracking = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  // Create bulk session mutation
  const createBulkSessionMutation = useMutation({
    mutationFn: async (options: BulkSessionOptions): Promise<string> => {
      setIsLoading(true);
      setError(null);
      
      const response = await apiRequest('POST', '/api/bulk-sessions', {
        name: options.name || `Bulk Session ${new Date().toLocaleString()}`,
        description: options.description,
        settings: {
          maxGroups: options.maxGroups || 50,
          similarityThreshold: options.similarityThreshold || 0.7,
          enableFaceDetection: options.enableFaceDetection ?? true,
          enableQualityAnalysis: options.enableQualityAnalysis ?? true
        }
      });
      
      const data = await response.json();
      return data.sessionId;
    },
    onSuccess: (sessionId) => {
      setIsLoading(false);
      toast({
        title: "Session Created",
        description: "Bulk upload session created successfully",
      });
      
      // Start progress tracking for the new session
      startProgressTracking(sessionId);
      
      // Invalidate queries to refresh session list
      queryClient.invalidateQueries({ queryKey: ['/api/bulk-sessions'] });
    },
    onError: (error: Error) => {
      setIsLoading(false);
      const errorMessage = error.message || 'Failed to create bulk session';
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  });

  // Upload files mutation
  const uploadFilesMutation = useMutation({
    mutationFn: async ({ files, sessionId }: { files: File[]; sessionId: string }) => {
      setIsLoading(true);
      setError(null);

      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sessionId', sessionId);

        const response = await fetch('/api/objects/upload', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          throw new Error(`Upload failed for ${file.name}: ${response.statusText}`);
        }

        return await response.json();
      });

      return await Promise.allSettled(uploadPromises);
    },
    onSuccess: () => {
      setIsLoading(false);
      toast({
        title: "Upload Complete",
        description: "Files uploaded successfully",
      });
      
      // Invalidate session queries to refresh data
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: ['/api/bulk-sessions', sessionId] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/bulk-sessions'] });
    },
    onError: (error: Error) => {
      setIsLoading(false);
      const errorMessage = error.message || 'Failed to upload files';
      setError(errorMessage);
      toast({
        title: "Upload Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  });

  // Start grouping mutation
  const startGroupingMutation = useMutation({
    mutationFn: async ({ sessionId, options }: { sessionId: string; options?: GroupingOptions }) => {
      setIsLoading(true);
      setError(null);

      const response = await apiRequest('POST', `/api/bulk-sessions/${sessionId}/group`, {
        algorithm: options?.algorithm || 'kmeans',
        nClusters: options?.nClusters,
        similarityThreshold: options?.similarityThreshold || 0.7,
        enableTemporalGrouping: options?.enableTemporalGrouping ?? true,
        enableLocationGrouping: options?.enableLocationGrouping ?? false,
        enableFeatureGrouping: options?.enableFeatureGrouping ?? true
      });

      return await response.json();
    },
    onSuccess: (_, { sessionId }) => {
      setIsLoading(false);
      toast({
        title: "Grouping Started",
        description: "AI is now grouping your photos",
      });
      
      // Start progress tracking
      startProgressTracking(sessionId);
      
      // Invalidate session queries
      queryClient.invalidateQueries({ queryKey: ['/api/bulk-sessions', sessionId] });
    },
    onError: (error: Error) => {
      setIsLoading(false);
      const errorMessage = error.message || 'Failed to start grouping';
      setError(errorMessage);
      toast({
        title: "Grouping Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  });

  // Retry analysis mutation
  const retryAnalysisMutation = useMutation({
    mutationFn: async ({ sessionId, photoId }: { sessionId: string; photoId?: string }) => {
      setIsLoading(true);
      setError(null);

      const url = photoId 
        ? `/api/bulk-sessions/${sessionId}/retry/${photoId}`
        : `/api/bulk-sessions/${sessionId}/retry`;
      
      const response = await apiRequest('POST', url);
      return await response.json();
    },
    onSuccess: (_, { sessionId }) => {
      setIsLoading(false);
      toast({
        title: "Retry Started",
        description: "Analysis retry has been initiated",
      });
      
      // Start progress tracking
      startProgressTracking(sessionId);
      
      // Invalidate session queries
      queryClient.invalidateQueries({ queryKey: ['/api/bulk-sessions', sessionId] });
    },
    onError: (error: Error) => {
      setIsLoading(false);
      const errorMessage = error.message || 'Failed to retry analysis';
      setError(errorMessage);
      toast({
        title: "Retry Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  });

  // Cancel session mutation
  const cancelSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      setIsLoading(true);
      setError(null);

      const response = await apiRequest('POST', `/api/bulk-sessions/${sessionId}/cancel`);
      return await response.json();
    },
    onSuccess: (sessionId) => {
      setIsLoading(false);
      toast({
        title: "Session Cancelled",
        description: "The bulk session has been cancelled",
      });
      
      // Stop progress tracking
      stopProgressTracking();
      
      // Invalidate session queries
      queryClient.invalidateQueries({ queryKey: ['/api/bulk-sessions', sessionId] });
    },
    onError: (error: Error) => {
      setIsLoading(false);
      const errorMessage = error.message || 'Failed to cancel session';
      setError(errorMessage);
      toast({
        title: "Cancel Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  });

  // Combined functions
  const createBulkSession = useCallback(async (options: BulkSessionOptions): Promise<string> => {
    return await createBulkSessionMutation.mutateAsync(options);
  }, [createBulkSessionMutation]);

  const uploadFiles = useCallback(async (files: File[], sessionId: string): Promise<void> => {
    await uploadFilesMutation.mutateAsync({ files, sessionId });
  }, [uploadFilesMutation]);

  const startGrouping = useCallback(async (sessionId: string, options?: GroupingOptions): Promise<void> => {
    await startGroupingMutation.mutateAsync({ sessionId, options });
  }, [startGroupingMutation]);

  const retryAnalysis = useCallback(async (sessionId: string, photoId?: string): Promise<void> => {
    await retryAnalysisMutation.mutateAsync({ sessionId, photoId });
  }, [retryAnalysisMutation]);

  const cancelSession = useCallback(async (sessionId: string): Promise<void> => {
    await cancelSessionMutation.mutateAsync(sessionId);
  }, [cancelSessionMutation]);

  // Auto-start progress tracking when sessionId changes
  useEffect(() => {
    if (sessionId && session?.status && ['uploading', 'grouping', 'analyzing'].includes(session.status)) {
      startProgressTracking(sessionId);
    }

    return () => {
      stopProgressTracking();
    };
  }, [sessionId, session?.status, startProgressTracking, stopProgressTracking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopProgressTracking();
    };
  }, [stopProgressTracking]);

  return {
    // Data
    session,
    progress,
    error: error || sessionError?.message || null,
    isLoading: isLoading || sessionLoading || createBulkSessionMutation.isPending || 
              uploadFilesMutation.isPending || startGroupingMutation.isPending || 
              retryAnalysisMutation.isPending || cancelSessionMutation.isPending,
    
    // Functions
    createBulkSession,
    uploadFiles,
    startGrouping,
    retryAnalysis,
    cancelSession,
    
    // Utilities
    refetch: () => {
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: ['/api/bulk-sessions', sessionId] });
      }
    },
    
    // State helpers
    isSessionActive: session?.status && ['uploading', 'grouping', 'analyzing'].includes(session.status),
    isSessionCompleted: session?.status === 'completed',
    isSessionError: session?.status === 'error',
    
    // Computed values
    totalPhotos: session?.totalPhotos || 0,
    processedPhotos: session?.processedPhotos || 0,
    groupCount: session?.groups?.length || 0,
    
    // Mutations status
    isCreating: createBulkSessionMutation.isPending,
    isUploading: uploadFilesMutation.isPending,
    isGrouping: startGroupingMutation.isPending,
    isRetrying: retryAnalysisMutation.isPending,
    isCancelling: cancelSessionMutation.isPending
  };
}
