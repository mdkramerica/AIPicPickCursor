// Cloudflare R2 / S3-compatible object storage service
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Response } from "express";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
} from "./objectAcl";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// Initialize S3 client for R2
function getS3Client(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials not configured. Please set R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY environment variables."
    );
  }

  return new S3Client({
    region: "auto", // R2 uses 'auto' for region
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export class R2StorageService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    this.s3Client = getS3Client();

    const bucketName = process.env.R2_BUCKET_NAME;
    if (!bucketName) {
      throw new Error(
        "R2_BUCKET_NAME not set. Please set R2_BUCKET_NAME environment variable."
      );
    }
    this.bucketName = bucketName;
  }

  /**
   * Upload a file directly to R2 (bypasses CORS issues)
   */
  async uploadFile(fileBuffer: Buffer, contentType: string): Promise<{ objectKey: string }> {
    const objectKey = `uploads/${randomUUID()}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await this.s3Client.send(command);

    return { objectKey };
  }

  /**
   * Generate a presigned URL for uploading a file
   * Note: This requires CORS configuration on R2 bucket
   */
  async getUploadURL(): Promise<{ uploadURL: string; objectKey: string }> {
    const objectKey = `uploads/${randomUUID()}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      // ContentType will be set by the client during upload
    });

    const uploadURL = await getSignedUrl(this.s3Client, command, {
      expiresIn: 900, // 15 minutes
    });

    return { uploadURL, objectKey };
  }

  /**
   * Generate a presigned URL for downloading a file
   */
  async getDownloadURL(objectKey: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Check if an object exists
   */
  async objectExists(objectKey: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      });
      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Delete an object
   */
  async deleteObject(objectKey: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
    });
    await this.s3Client.send(command);
  }

  /**
   * Stream an object to an Express response
   * For public access, you can use R2's public URL if bucket is public
   * For private access, redirect to presigned URL
   */
  async downloadObject(objectKey: string, res: Response): Promise<void> {
    try {
      // Check if object exists
      const exists = await this.objectExists(objectKey);
      if (!exists) {
        throw new ObjectNotFoundError();
      }

      // For simplicity, redirect to a presigned URL
      // Alternative: stream the object directly using GetObjectCommand
      const downloadURL = await this.getDownloadURL(objectKey, 3600);
      res.redirect(downloadURL);
    } catch (error) {
      console.error("Error downloading object:", error);
      if (error instanceof ObjectNotFoundError) {
        throw error;
      }
      throw new Error("Error downloading object");
    }
  }

  /**
   * Normalize object path (convert full URL to key)
   * Supports both R2 public URLs and relative paths
   */
  normalizeObjectPath(rawPath: string): string {
    // If it's already a relative path, return as-is
    if (rawPath.startsWith("/objects/")) {
      return rawPath;
    }

    // If it's a full R2 URL, extract the key
    if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
      try {
        const url = new URL(rawPath);
        // Extract the key from the pathname
        // R2 URLs typically look like: https://[bucket].r2.cloudflarestorage.com/[key]
        const pathParts = url.pathname.split("/").filter(p => p);
        if (pathParts.length > 0) {
          const objectKey = pathParts.join("/");
          return `/objects/${objectKey}`;
        }
      } catch (e) {
        console.error("Error parsing R2 URL:", e);
      }
    }

    return rawPath;
  }

  /**
   * Get object key from normalized path
   */
  getObjectKeyFromPath(normalizedPath: string): string {
    if (!normalizedPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    return normalizedPath.substring("/objects/".length);
  }

  /**
   * Check if user can access an object
   * Currently a simple implementation - you can enhance with ACL logic
   */
  async canAccessObject({
    userId,
    objectKey,
    requestedPermission,
  }: {
    userId?: string;
    objectKey: string;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    // For now, allow access if user is authenticated
    // You can enhance this with proper ACL checks
    if (!userId) {
      return false;
    }

    // Check if object exists
    return await this.objectExists(objectKey);
  }

  /**
   * Set object ACL policy (placeholder for future implementation)
   */
  async setObjectAclPolicy(objectKey: string, aclPolicy: ObjectAclPolicy): Promise<void> {
    // R2 doesn't support custom metadata for ACL in the same way as Google Cloud
    // You would need to implement this using object tags or a separate database
    console.log(`ACL policy setting not yet implemented for R2. Object: ${objectKey}, Policy:`, aclPolicy);
  }
}
