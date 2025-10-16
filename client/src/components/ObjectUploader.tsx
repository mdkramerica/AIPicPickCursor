// Reference: blueprint:javascript_object_storage
import { useState, useRef } from "react";
import type { ReactNode, ChangeEvent } from "react";
import Uppy from "@uppy/core";
import { DashboardModal } from "@uppy/react";
import AwsS3 from "@uppy/aws-s3";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: (file: any) => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>
  ) => void;
  buttonClassName?: string;
  children: ReactNode;
}

export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760, // 10MB default
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uppy] = useState(() =>
    new Uppy({
      restrictions: {
        maxNumberOfFiles,
        maxFileSize,
        allowedFileTypes: ['image/*'],
      },
      autoProceed: false,
      meta: {
        type: 'photo'
      },
    })
      .use(AwsS3, {
        shouldUseMultipart: false,
        getUploadParameters: onGetUploadParameters,
      })
      .on("complete", (result) => {
        onComplete?.(result);
        setShowModal(false);
        uppy.cancelAll();
      })
  );

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

  // For Safari iOS: use label to trigger native file input
  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div>
      {/* Native file input for Safari iOS compatibility */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={maxNumberOfFiles > 1}
        onChange={handleNativeFileInput}
        style={{ display: 'none' }}
        data-testid="input-file-native"
      />
      
      <Button 
        onClick={handleButtonClick} 
        className={buttonClassName} 
        data-testid="button-upload-photos"
      >
        {children}
      </Button>

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
