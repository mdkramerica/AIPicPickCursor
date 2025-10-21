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
      autoProceed: true, // Auto-upload when files are added!
      meta: {
        type: 'photo'
      },
    });

    uppyInstance.use(XHRUpload, {
      endpoint: '/api/objects/upload',
      fieldName: 'file',
      formData: true,
      headers: (file) => {
        // Get the access token from Kinde (synchronously via ref)
        console.log("🔑 Getting token for upload...");
        return getTokenRef.current().then(token => {
          console.log("🔑 Token retrieved:", token ? `${token.substring(0, 20)}...` : 'NO TOKEN');
          return {
            'Authorization': token ? `Bearer ${token}` : '',
          };
        });
      },
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
