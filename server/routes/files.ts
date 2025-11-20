import { Router } from "express";
import multer from "multer";
import heicConvert from 'heic-convert';
import { R2StorageService, ObjectNotFoundError } from "../services/r2Storage";
import { ObjectPermission } from "../services/objectAcl";
import { isAuthenticated } from "../kindeAuth";
import { asyncHandler, AppError } from "../middleware/errorHandler";
import { apiLimiter, uploadLimiter } from "../middleware/rateLimiter";

const router = Router();

// Configure multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Helper function to check if buffer is HEIC/HEIF format
function isHEICFormat(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const ftypSignature = buffer.toString('ascii', 4, 8);
  if (ftypSignature === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    return brand.startsWith('heic') || brand.startsWith('heix') ||
           brand.startsWith('hevc') || brand.startsWith('hevx') ||
           brand.startsWith('mif1') || brand.startsWith('msf1');
  }
  return false;
}

// Object Storage routes - Download
router.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
  const userId = req.userId;
  const r2Storage = new R2StorageService();
  try {
    console.log(`📥 Object download request: ${req.path} from user ${userId}`);
    // Note: req.params.objectPath will be captured by the router if mounted correctly,
    // but if mounted at root, we need to ensure we get the parameter.
    // If mounted at "/", the path matches "/objects/...".
    
    const normalizedPath = r2Storage.normalizeObjectPath(req.params.objectPath || req.path);
    console.log(`🔄 Normalized path: ${normalizedPath}`);
    const objectKey = r2Storage.getObjectKeyFromPath(normalizedPath);
    console.log(`🔑 Object key: ${objectKey}`);

    const canAccess = await r2Storage.canAccessObject({
      userId: userId,
      objectKey: objectKey,
      requestedPermission: ObjectPermission.READ,
    });

    if (!canAccess) {
      console.error(`❌ Access denied for user ${userId} to object ${objectKey}`);
      return res.sendStatus(403);
    }

    console.log(`✅ Access granted, downloading object ${objectKey}`);
    await r2Storage.downloadObject(objectKey, res);
  } catch (error) {
    console.error("❌ Error in object download route:", error);
    if (error instanceof ObjectNotFoundError) {
      console.error(`❌ Object not found: ${req.path}`);
      return res.sendStatus(404);
    }
    return res.sendStatus(500);
  }
});

// Direct file upload to R2 (no CORS issues)
router.post("/api/objects/upload", uploadLimiter, isAuthenticated, upload.single('file'), asyncHandler(async (req: any, res) => {
  if (!req.file) {
    throw new AppError(400, "No file uploaded");
  }

  let fileBuffer = req.file.buffer;
  let fileMimetype = req.file.mimetype;

  // Convert HEIC/HEIF to JPEG for browser compatibility
  const isHeic = fileMimetype.includes('heic') || fileMimetype.includes('heif') || isHEICFormat(fileBuffer);

  if (isHeic) {
    console.log(`🔄 Converting HEIC/HEIF image to JPEG for browser compatibility`);
    try {
      const outputBuffer = await heicConvert({
        buffer: fileBuffer,
        format: 'JPEG',
        quality: 0.92
      }) as unknown as Buffer;
      fileBuffer = outputBuffer;
      fileMimetype = 'image/jpeg';
      console.log(`✅ HEIC conversion successful, new size: ${fileBuffer.length} bytes`);
    } catch (conversionError) {
      console.error(`❌ HEIC conversion failed:`, conversionError);
      throw new AppError(500, `Failed to convert HEIC image: ${conversionError instanceof Error ? conversionError.message : 'Unknown error'}`);
    }
  }

  const r2Storage = new R2StorageService();
  const { objectKey } = await r2Storage.uploadFile(fileBuffer, fileMimetype);

  // Return the object path that can be used to access the file
  res.json({
    objectKey,
    fileUrl: `/objects/${objectKey}`
  });
}));

// Get presigned URL for an uploaded object (for immediate display after upload)
router.get("/api/objects/presigned-url", apiLimiter, isAuthenticated, asyncHandler(async (req: any, res) => {
  const { path } = req.query;
  
  if (!path || typeof path !== 'string') {
    throw new AppError(400, "Path parameter is required");
  }
  
  if (!path.startsWith('/objects/')) {
    throw new AppError(400, "Path must start with /objects/");
  }
  
  const r2Storage = new R2StorageService();
  const objectKey = r2Storage.getObjectKeyFromPath(path);
  
  // Generate presigned URL (valid for 1 hour)
  // Note: In production, you might want to verify user has access to this object
  // For now, we trust the authenticated user
  const presignedUrl = await r2Storage.getDownloadURL(objectKey, 3600);
  
  res.json({ presignedUrl });
}));

export default router;

