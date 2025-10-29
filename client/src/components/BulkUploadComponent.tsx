import { useState, useRef, useCallback, useEffect } from "react";
import { CloudUpload, X, Check, AlertCircle, Loader2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useKindeAuth } from "@kinde-oss/kinde-auth-react";
import { apiRequest } from "@/lib/queryClient";

export interface UploadProgress {
  totalFiles: number;
  completedFiles: number;
  currentFile?: string;
  overallProgress: number; // 0-100
  estimatedTimeRemaining?: number;
}

export interface UploadResult {
  file: File;
  url: string;
  filename: string;
  success: boolean;
  error?: string;
}

export interface BulkUploadProps {
  maxFiles?: number; // default 200
  maxFileSize?: number; // default 10MB
  sessionId: string;
  onUploadProgress: (progress: UploadProgress) => void;
  onUploadComplete: (results: UploadResult[]) => void;
  onError: (error: string) => void;
}

interface QueuedFile {
  file: File;
  id: string;
  preview: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  url?: string; // Uploaded object path (e.g., /objects/uploads/...)
  displayUrl?: string; // Presigned URL for display
}

export default function BulkUploadComponent({
  maxFiles = 200,
  maxFileSize = 10 * 1024 * 1024, // 10MB
  sessionId,
  onUploadProgress,
  onUploadComplete,
  onError
}: BulkUploadProps) {
  const { getToken } = useKindeAuth();
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const validateFile = useCallback((file: File): string | null => {
    // Check file type
    if (!file.type.startsWith('image/')) {
      return 'Only image files are allowed';
    }

    // Check file size
    if (file.size > maxFileSize) {
      return `File size must be less than ${(maxFileSize / 1024 / 1024).toFixed(1)}MB`;
    }

    return null;
  }, [maxFileSize]);

  const createPreview = useCallback((file: File): Promise<string> => {
    return new Promise((resolve) => {
      // Check if file is HEIC/HEIF - Chrome can't display these natively
      const isHeic = file.name.toLowerCase().endsWith('.heic') || 
                     file.name.toLowerCase().endsWith('.heif') ||
                     file.type === 'image/heic' || 
                     file.type === 'image/heif' ||
                     file.type === 'image/heif-sequence';
      
      if (isHeic) {
        // Return a placeholder transparent 1x1 PNG instead of broken HEIC data URL
        // Chrome will display this, and we'll replace with uploaded JPEG after upload completes
        resolve('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => {
        // Fallback to placeholder on FileReader error
        resolve('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const addFiles = useCallback(async (newFiles: File[]) => {
    const validatedFiles: QueuedFile[] = [];
    const errors: string[] = [];

    // Check total file limit
    if (files.length + newFiles.length > maxFiles) {
      onError(`Cannot add more than ${maxFiles} files. You currently have ${files.length} files.`);
      return;
    }

    for (const file of newFiles) {
      const error = validateFile(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
        continue;
      }

      const preview = await createPreview(file);
      validatedFiles.push({
        file,
        id: `${file.name}-${file.size}-${Date.now()}`,
        preview,
        progress: 0,
        status: 'pending'
      });
    }

    if (errors.length > 0) {
      onError(errors.join('\n'));
    }

    if (validatedFiles.length > 0) {
      setFiles(prev => [...prev, ...validatedFiles]);
    }
  }, [files.length, maxFiles, validateFile, createPreview, onError]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      addFiles(droppedFiles);
    }
  }, [addFiles]);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const uploadFile = async (queuedFile: QueuedFile): Promise<UploadResult> => {
    const formData = new FormData();
    formData.append('file', queuedFile.file);
    formData.append('sessionId', sessionId);

    try {
      // Get JWT token for authentication
      const token = await getToken();
      console.log('🔑 Bulk upload token:', token ? `${token.substring(0, 20)}...` : 'NO TOKEN');

      // Step 1: Upload file to R2 storage
      const uploadResponse = await fetch('/api/objects/upload', {
        method: 'POST',
        body: formData,
        headers: {
          // Use JWT Bearer token like other components
          'Authorization': token ? `Bearer ${token}` : '',
          // Don't set Content-Type for FormData, browser does it automatically
        }
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('❌ Upload failed response:', errorText);
        throw new Error(`Upload failed (${uploadResponse.status}): ${errorText}`);
      }

      const uploadResult = await uploadResponse.json();
      console.log('✅ File uploaded to R2:', queuedFile.file.name, uploadResult);
      
      // Step 2: Create Photo record in database
      console.log('📝 Creating Photo record in database...');
      const photoResponse = await apiRequest('POST', `/api/sessions/${sessionId}/photos`, {
        fileUrl: uploadResult.fileUrl,
        originalFilename: queuedFile.file.name,
      });

      if (!photoResponse.ok) {
        const errorText = await photoResponse.text();
        console.error('❌ Failed to create Photo record:', errorText);
        throw new Error(`Failed to create photo record (${photoResponse.status}): ${errorText}`);
      }

      const photo = await photoResponse.json();
      console.log('✅ Photo record created:', photo.id, queuedFile.file.name);
      
      // Step 3: Get presigned URL for immediate display
      let displayUrl = uploadResult.fileUrl;
      if (uploadResult.fileUrl && uploadResult.fileUrl.startsWith('/objects/')) {
        try {
          const presignedResponse = await apiRequest('GET', `/api/objects/presigned-url?path=${encodeURIComponent(uploadResult.fileUrl)}`);
          if (presignedResponse.ok) {
            const presignedData = await presignedResponse.json();
            displayUrl = presignedData.presignedUrl;
            console.log('✅ Got presigned URL for:', queuedFile.file.name);
          }
        } catch (presignedError) {
          console.warn('⚠️ Failed to get presigned URL, will use object path:', presignedError);
          // Continue with object path - might work if browser can handle auth
        }
      }
      
      return {
        file: queuedFile.file,
        url: uploadResult.fileUrl,
        filename: queuedFile.file.name,
        success: true
      };
    } catch (error) {
      console.error('Upload error for file:', queuedFile.file.name, error);
      return {
        file: queuedFile.file,
        url: '',
        filename: queuedFile.file.name,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadStartTime(Date.now());

    const results: UploadResult[] = [];
    let completedCount = 0;

    // Update status to uploading for all files
    setFiles(prev => prev.map(f => ({ ...f, status: 'uploading' as const, progress: 0 })));

    // Upload files sequentially to avoid overwhelming the server
    for (const queuedFile of files) {
      try {
        // Update current file in progress
        onUploadProgress({
          totalFiles: files.length,
          completedFiles: completedCount,
          currentFile: queuedFile.file.name,
          overallProgress: (completedCount / files.length) * 100
        });

        const result = await uploadFile(queuedFile);
        results.push(result);

        if (result.success) {
          // Get presigned URL for display after upload succeeds
          let displayUrl = result.url;
          if (result.url && result.url.startsWith('/objects/')) {
            try {
              const token = await getToken();
              const presignedResponse = await fetch(`/api/objects/presigned-url?path=${encodeURIComponent(result.url)}`, {
                headers: {
                  'Authorization': token ? `Bearer ${token}` : '',
                }
              });
              if (presignedResponse.ok) {
                const presignedData = await presignedResponse.json();
                displayUrl = presignedData.presignedUrl;
                console.log('✅ Generated presigned URL for display:', queuedFile.file.name);
              }
            } catch (presignedError) {
              console.warn('⚠️ Could not get presigned URL, using object path:', presignedError);
            }
          }
          
          setFiles(prev => prev.map(f => 
            f.id === queuedFile.id 
              ? { ...f, status: 'success' as const, progress: 100, url: result.url, displayUrl }
              : f
          ));
        } else {
          setFiles(prev => prev.map(f => 
            f.id === queuedFile.id 
              ? { ...f, status: 'error' as const, error: result.error }
              : f
          ));
        }

        completedCount++;

        // Calculate estimated time remaining
        const elapsedTime = Date.now() - (uploadStartTime || Date.now());
        const avgTimePerFile = elapsedTime / completedCount;
        const remainingFiles = files.length - completedCount;
        const estimatedTimeRemaining = avgTimePerFile * remainingFiles;

        onUploadProgress({
          totalFiles: files.length,
          completedFiles: completedCount,
          currentFile: queuedFile.file.name,
          overallProgress: (completedCount / files.length) * 100,
          estimatedTimeRemaining
        });

      } catch (error) {
        const errorResult: UploadResult = {
          file: queuedFile.file,
          url: '',
          filename: queuedFile.file.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
        results.push(errorResult);

        setFiles(prev => prev.map(f => 
          f.id === queuedFile.id 
            ? { ...f, status: 'error' as const, error: errorResult.error }
            : f
        ));
      }
    }

    setIsUploading(false);
    onUploadComplete(results);
  };

  const formatTimeRemaining = (ms: number): string => {
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds}s remaining`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes}m remaining`;
  };

  const totalFileSize = files.reduce((sum, f) => sum + f.file.size, 0);
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card 
        className={cn(
          "border-2 border-dashed transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25",
          isUploading && "opacity-50 pointer-events-none"
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <CardContent className="p-8 text-center">
          <div className="cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                if (e.target.files) {
                  addFiles(Array.from(e.target.files));
                }
              }}
              className="hidden"
            />
            <CloudUpload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {files.length === 0 ? 'Drop photos here' : 'Add more photos'}
            </h3>
            <p className="text-muted-foreground mb-4">
              Drag and drop up to {maxFiles} photos, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Supported: JPEG, PNG, GIF, WebP, HEIC • Max {(maxFileSize / 1024 / 1024).toFixed(0)}MB per file
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Files Queue */}
      {files.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Upload Queue</h3>
                <p className="text-sm text-muted-foreground">
                  {files.length} files • {formatFileSize(totalFileSize)}
                </p>
              </div>
              <div className="flex gap-2">
                {!isUploading && (
                  <Button variant="outline" size="sm" onClick={() => setFiles([])}>
                    Clear All
                  </Button>
                )}
                <Button 
                  onClick={uploadFiles}
                  disabled={isUploading || files.length === 0}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <CloudUpload className="mr-2 h-4 w-4" />
                      Upload {files.length} Files
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Files Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {files.map((file) => (
                <div key={file.id} className="relative group">
                  <Card className={cn(
                    "overflow-hidden transition-all",
                    file.status === 'error' && "border-destructive",
                    file.status === 'success' && "border-green-500"
                  )}>
                    <div className="aspect-square relative bg-muted">
                      <img 
                        src={file.displayUrl || file.url || file.preview} 
                        alt={file.file.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Fallback chain: displayUrl -> url -> preview -> placeholder
                          const target = e.currentTarget;
                          if (file.url && target.src !== file.url) {
                            // Try object path if presigned URL failed
                            target.src = file.url;
                          } else if (file.preview && target.src !== file.preview) {
                            // Try preview if both URLs failed
                            target.src = file.preview;
                          } else {
                            // Last resort: placeholder
                            target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2U1ZTdlYiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5Y2EzYWYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgYXZhaWxhYmxlPC90ZXh0Pjwvc3ZnPg==';
                          }
                        }}
                      />
                      
                      {/* Status Overlay */}
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        {file.status === 'pending' && (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                        {file.status === 'uploading' && (
                          <div className="text-white text-center">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-1" />
                            <span className="text-xs">{Math.round(file.progress)}%</span>
                          </div>
                        )}
                        {file.status === 'success' && (
                          <Check className="h-8 w-8 text-green-500" />
                        )}
                        {file.status === 'error' && (
                          <AlertCircle className="h-8 w-8 text-destructive" />
                        )}
                      </div>

                      {/* Progress Bar */}
                      {file.status === 'uploading' && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                          <div 
                            className="h-full bg-primary transition-all"
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                    
                    <div className="p-2">
                      <p className="text-xs truncate font-medium" title={file.file.name}>
                        {file.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.file.size)}
                      </p>
                      {file.error && (
                        <p className="text-xs text-destructive mt-1" title={file.error}>
                          {file.error.length > 30 ? `${file.error.substring(0, 30)}...` : file.error}
                        </p>
                      )}
                    </div>
                  </Card>

                  {/* Remove Button */}
                  {!isUploading && (
                    <button
                      onClick={() => removeFile(file.id)}
                      className="absolute -top-2 -right-2 h-6 w-6 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add More Files Button */}
            {!isUploading && (
              <div className="mt-4">
                <Button 
                  variant="outline" 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                >
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Add More Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) {
                      addFiles(Array.from(e.target.files));
                    }
                  }}
                  className="hidden"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
