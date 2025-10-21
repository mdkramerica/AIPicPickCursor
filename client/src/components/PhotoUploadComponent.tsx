import { useState, useCallback } from "react";
import { Upload, Sparkles, Image as ImageIcon, Layers, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ObjectUploader } from "@/components/ObjectUploader";
import BulkUploadComponent from "./BulkUploadComponent";
import { useToast } from "@/hooks/use-toast";
import type { UploadResult } from "@uppy/core";

interface UploadProgress {
  totalFiles: number;
  completedFiles: number;
  currentFile?: string;
  overallProgress: number; // 0-100
  estimatedTimeRemaining?: number;
}

interface PhotoUploadResult {
  file: File;
  url: string;
  filename: string;
  success: boolean;
  error?: string;
}

interface PhotoUploadComponentProps {
  sessionId: string;
  maxFiles?: number;
  maxFileSize?: number;
  onComplete?: (results: PhotoUploadResult[]) => void;
  onProgress?: (progress: UploadProgress) => void;
  onError?: (error: string) => void;
  defaultMode?: 'single' | 'bulk';
}

export default function PhotoUploadComponent({
  sessionId,
  maxFiles = 200,
  maxFileSize = 10 * 1024 * 1024, // 10MB
  onComplete,
  onProgress,
  onError,
  defaultMode = 'single'
}: PhotoUploadComponentProps) {
  const [uploadMode, setUploadMode] = useState<'single' | 'bulk'>(defaultMode);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStats, setUploadStats] = useState({
    totalFiles: 0,
    uploadedFiles: 0,
    failedFiles: 0
  });
  const { toast } = useToast();

  const handleSingleUploadComplete = useCallback((result: any) => {
    if (!result.successful || result.successful.length === 0) {
      onError?.('No files were successfully uploaded');
      return;
    }

    const uploadResults: PhotoUploadResult[] = result.successful.map((file: any) => ({
      file: file.data as File,
      url: file.uploadURL as string,
      filename: file.name || 'unknown',
      success: true
    }));

    const failedResults: PhotoUploadResult[] = result.failed.map((file: any) => ({
      file: file.data as File,
      url: '',
      filename: file.name || 'unknown',
      success: false,
      error: file.error?.message || 'Upload failed'
    }));

    const allResults = [...uploadResults, ...failedResults];
    onComplete?.(allResults);

    // Show success toast
    toast({
      title: "Upload Complete",
      description: `Successfully uploaded ${uploadResults.length} file${uploadResults.length !== 1 ? 's' : ''}`,
    });
  }, [onComplete, onError, toast]);

  const handleBulkUploadProgress = useCallback((progress: UploadProgress) => {
    onProgress?.(progress);
    setUploadStats({
      totalFiles: progress.totalFiles,
      uploadedFiles: progress.completedFiles,
      failedFiles: 0 // Will be updated in complete handler
    });
  }, [onProgress]);

  const handleBulkUploadComplete = useCallback((results: PhotoUploadResult[]) => {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    setUploadStats({
      totalFiles: results.length,
      uploadedFiles: successful.length,
      failedFiles: failed.length
    });

    onComplete?.(results);

    // Show appropriate toast
    if (failed.length === 0) {
      toast({
        title: "Upload Complete",
        description: `Successfully uploaded ${successful.length} photos`,
      });
    } else {
      toast({
        title: "Upload Complete with Errors",
        description: `${successful.length} uploaded successfully, ${failed.length} failed`,
        variant: "destructive"
      });
    }
  }, [onComplete, toast]);

  const handleError = useCallback((error: string) => {
    onError?.(error);
    toast({
      title: "Upload Error",
      description: error,
      variant: "destructive"
    });
  }, [onError, toast]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Photos
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {uploadMode === 'bulk' 
                  ? `Upload up to ${maxFiles} photos at once with progress tracking`
                  : 'Upload photos one by one or in small batches'
                }
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <ImageIcon className="h-3 w-3" />
                Max {(maxFileSize / 1024 / 1024).toFixed(0)}MB per file
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Mode Toggle */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Upload Mode</Label>
              <p className="text-xs text-muted-foreground">
                {uploadMode === 'bulk' 
                  ? 'Enhanced mode with progress tracking and batch processing'
                  : 'Simple mode for quick uploads'
                }
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="upload-mode-toggle" className="text-sm">Single</Label>
              </div>
              <Switch
                id="upload-mode-toggle"
                checked={uploadMode === 'bulk'}
                onCheckedChange={(checked) => setUploadMode(checked ? 'bulk' : 'single')}
                disabled={isUploading}
              />
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="upload-mode-toggle" className="text-sm">Bulk</Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Interface */}
      <Tabs value={uploadMode} onValueChange={(value) => setUploadMode(value as 'single' | 'bulk')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="single" className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Single Upload
          </TabsTrigger>
          <TabsTrigger value="bulk" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Bulk Upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="mt-6">
          <Card>
            <CardContent className="p-6">
              <div className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <Upload className="h-8 w-8 text-primary" />
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold mb-2">Quick Upload</h3>
                  <p className="text-muted-foreground mb-4">
                    Select photos to upload using the file browser
                  </p>
                </div>

                <ObjectUploader
                  maxNumberOfFiles={10}
                  maxFileSize={maxFileSize}
                  onComplete={handleSingleUploadComplete}
                  buttonClassName="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Select Photos
                </ObjectUploader>

                <div className="text-xs text-muted-foreground">
                  Supports: JPEG, PNG, GIF, WebP, HEIC • Max 10 files at once
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bulk" className="mt-6">
          <BulkUploadComponent
            maxFiles={maxFiles}
            maxFileSize={maxFileSize}
            sessionId={sessionId}
            onUploadProgress={handleBulkUploadProgress}
            onUploadComplete={handleBulkUploadComplete}
            onError={handleError}
          />
        </TabsContent>
      </Tabs>

      {/* Upload Stats */}
      {(uploadStats.totalFiles > 0 || isUploading) && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium mb-1">Upload Statistics</h4>
                <div className="text-sm text-muted-foreground">
                  {isUploading ? 'Upload in progress...' : 'Upload completed'}
                </div>
              </div>
              
              <div className="flex gap-4 text-sm">
                <div className="text-center">
                  <div className="font-mono font-semibold text-green-600">
                    {uploadStats.uploadedFiles}
                  </div>
                  <div className="text-muted-foreground">Success</div>
                </div>
                <div className="text-center">
                  <div className="font-mono font-semibold text-red-600">
                    {uploadStats.failedFiles}
                  </div>
                  <div className="text-muted-foreground">Failed</div>
                </div>
                <div className="text-center">
                  <div className="font-mono font-semibold">
                    {uploadStats.totalFiles}
                  </div>
                  <div className="text-muted-foreground">Total</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help Section */}
      <Card className="border-dashed">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Sparkles className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium mb-1">Upload Tips</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Use Bulk mode for 50+ photos to get better progress tracking</li>
                <li>• Photos are automatically analyzed for quality and grouped by similarity</li>
                <li>• Supported formats: JPEG, PNG, GIF, WebP, HEIC, HEIF</li>
                <li>• Maximum file size: {(maxFileSize / 1024 / 1024).toFixed(0)}MB per photo</li>
                <li>• Upload progress is saved automatically - you can refresh the page</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
