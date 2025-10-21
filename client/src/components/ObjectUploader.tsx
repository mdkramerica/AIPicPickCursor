// Reference: blueprint:javascript_object_storage
import { useState, useRef } from "react";
import type { ReactNode, ChangeEvent } from "react";
import Uppy from "@uppy/core";
import { DashboardModal } from "@uppy/react";
import XHRUpload from "@uppy/xhr-upload";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";
import { useKindeAuth } from "@kinde-oss/kinde-auth-react";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onComplete?: (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>
  ) => void;
  buttonClassName?: string;
  children: ReactNode;
}

export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760, // 10MB default
  onComplete,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { getToken } = useKindeAuth();
  const getTokenRef = useRef(getToken);

  // Update ref when getToken changes
  getTokenRef.current = getToken;

  const [uppy] = useState(() => {
    const uppyInstance = new Uppy({
      restrictions: {
        maxNumberOfFiles,
        maxFileSize,
        allowedFileTypes: ['image/*'],
      },
      autoProceed: false, // DON'T auto-upload - we need to get token first!
      meta: {
        type: 'photo'
      },
    });

    uppyInstance.use(XHRUpload, {
      endpoint: '/api/objects/upload',
      fieldName: 'file',
      formData: true,
      headers: {}, // Will be set dynamically before upload
    });

    // Debounce timer for handling multiple file additions
    let uploadTimer: NodeJS.Timeout | null = null;

    // When files are added, debounce and then get token and upload
    uppyInstance.on("files-added", async (files) => {
      console.log("📁 Files added:", files.length, "- Total files in queue:", Object.keys(uppyInstance.getState().files).length);

      // Clear any existing timer
      if (uploadTimer) {
        clearTimeout(uploadTimer);
      }

      // Wait 100ms for all files to be added, then proceed with upload
      uploadTimer = setTimeout(async () => {
        const totalFiles = Object.keys(uppyInstance.getState().files).length;
        console.log("⏰ Upload timer triggered, total files to upload:", totalFiles);

        if (totalFiles === 0) {
          console.log("⚠️ No files to upload");
          return;
        }

        try {
          console.log("🔑 Getting token for upload...");
          const token = await getTokenRef.current();
          console.log("🔑 Token retrieved:", token ? `${token.substring(0, 20)}...` : 'NO TOKEN');

          // Update XHRUpload headers with fresh token
          const xhrPlugin = uppyInstance.getPlugin('XHRUpload');
          if (xhrPlugin && token) {
            xhrPlugin.setOptions({
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            console.log("✅ Authorization header set, starting upload of", totalFiles, "files...");

            // Now trigger the upload
            uppyInstance.upload();
          } else {
            console.error("❌ No token or XHR plugin not found");
            uppyInstance.info("Authentication failed - please refresh and try again", "error", 5000);
          }
        } catch (error) {
          console.error("❌ Error getting token:", error);
          uppyInstance.info("Failed to get authentication token", "error", 5000);
        }
      }, 100);
    });

    uppyInstance.on("upload", () => {
      console.log("🚀 Upload started");
    });

    uppyInstance.on("upload-success", (file, response) => {
      console.log("✅ Upload success:", file?.name, response);
      // Store the fileUrl from the response in the file's uploadURL for compatibility
      if (file && response.body) {
        file.uploadURL = (response.body as any).fileUrl;
      }
    });

    uppyInstance.on("upload-error", (file, error) => {
      console.error("❌ Upload error:", file?.name, error);
    });

    uppyInstance.on("complete", (result) => {
      console.log("🏁 Upload complete:", result.successful?.length || 0, "files");
      onComplete?.(result);
      setShowModal(false);
      uppyInstance.cancelAll();
    });

    return uppyInstance;
  });

  const handleCloseModal = () => {
    setShowModal(false);
    uppy.cancelAll();
  };

  // Safari iOS-compatible file selection
  const handleNativeFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Add files to Uppy
    Array.from(files).forEach((file) => {
      try {
        uppy.addFile({
          source: 'file input',
          name: file.name,
          type: file.type,
          data: file,
        });
      } catch (err) {
        console.error('Error adding file:', err);
      }
    });

    // Open Uppy modal after files are selected
    setShowModal(true);
    
    // Reset input so same files can be selected again
    event.target.value = '';
  };

  return (
    <div>
      {/* Native file input for Safari iOS compatibility */}
      <input
        ref={fileInputRef}
        id="photo-upload-input"
        type="file"
        accept="image/*"
        multiple={maxNumberOfFiles > 1}
        onChange={handleNativeFileInput}
        style={{ display: 'none' }}
        data-testid="input-file-native"
      />
      
      {/* Use label instead of programmatic click for Safari iOS */}
      <label htmlFor="photo-upload-input" style={{ cursor: 'pointer' }}>
        <Button 
          asChild
          className={buttonClassName} 
          data-testid="button-upload-photos"
        >
          <span>
            {children}
          </span>
        </Button>
      </label>

      {showModal && (
        <DashboardModal
          uppy={uppy}
          open={true}
          onRequestClose={handleCloseModal}
          proudlyDisplayPoweredByUppy={false}
          note="Review and upload your selected photos"
          browserBackButtonClose={true}
        />
      )}
    </div>
  );
}
