import { createCanvas, loadImage, Canvas, Image } from 'canvas';
import { R2StorageService } from './r2Storage.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import heicConvert from 'heic-convert';

/**
 * Load image from URL (object storage path) and return canvas image
 */
export async function loadImageFromUrl(url: string): Promise<Image> {
  try {
    let buffer: Buffer;
    let contentType: string | undefined;

    // If it's an /objects/ path, get it from R2 storage
    if (url.startsWith('/objects/')) {
      const r2Storage = new R2StorageService();
      const objectKey = r2Storage.getObjectKeyFromPath(url);

      console.log(`Loading image from R2: ${objectKey}`);

      // Get object from R2
      const command = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: objectKey,
      });

      const response = await (r2Storage as any).s3Client.send(command);
      contentType = response.ContentType;

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      buffer = Buffer.concat(chunks);

      console.log(`Image loaded from R2: ${objectKey}, size: ${buffer.length} bytes, type: ${contentType}`);
    } else {
      // For external URLs, use fetch
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      contentType = response.headers.get('content-type') || undefined;
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    // Validate image format
    const isValid = isValidImageFormat(buffer, contentType);
    if (!isValid) {
      console.error(`Invalid image format for ${url}. Content-Type: ${contentType}, Buffer length: ${buffer.length}, First bytes: ${buffer.slice(0, 8).toString('hex')}`);
      throw new Error(`Unsupported image format. Content-Type: ${contentType || 'unknown'}, detected as non-image`);
    }

    // Convert HEIC/HEIF to JPEG if necessary
    if (contentType?.includes('heic') || contentType?.includes('heif') || isHEICFormat(buffer)) {
      console.log(`Converting HEIC/HEIF image to JPEG: ${url}`);
      try {
        const outputBuffer = await heicConvert({
          buffer: buffer,
          format: 'JPEG',
          quality: 0.92
        });
        buffer = Buffer.from(outputBuffer);
        console.log(`HEIC conversion successful, new size: ${buffer.length} bytes`);
      } catch (conversionError) {
        console.error(`HEIC conversion failed for ${url}:`, conversionError);
        throw new Error(`Failed to convert HEIC image: ${conversionError instanceof Error ? conversionError.message : 'Unknown error'}`);
      }
    }

    // Load image with canvas
    const image = await loadImage(buffer);
    
    // Validate minimum image dimensions for face detection
    // SSD MobileNet v1 requires faces to be at least 80x80 pixels
    const MIN_IMAGE_SIZE = 100; // Minimum 100x100 pixels for reliable detection
    if (image.width < MIN_IMAGE_SIZE || image.height < MIN_IMAGE_SIZE) {
      throw new Error(`Image too small for face detection. Minimum size: ${MIN_IMAGE_SIZE}x${MIN_IMAGE_SIZE} pixels. Actual: ${image.width}x${image.height}`);
    }
    
    return image;
  } catch (error) {
    console.error('Error loading image from', url, ':', error);
    throw new Error(`Failed to load image from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if buffer is HEIC/HEIF format
 */
function isHEICFormat(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;

  // HEIC files start with: 00 00 00 XX 66 74 79 70 (where XX is size, ftyp is the box type)
  const ftypSignature = buffer.toString('ascii', 4, 8);
  if (ftypSignature === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    return brand.startsWith('heic') || brand.startsWith('heix') ||
           brand.startsWith('hevc') || brand.startsWith('hevx') ||
           brand.startsWith('mif1') || brand.startsWith('msf1');
  }

  return false;
}

/**
 * Check if buffer contains a valid image format
 */
function isValidImageFormat(buffer: Buffer, contentType?: string): boolean {
  // Check by content type
  if (contentType) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/heic', 'image/heif'];
    if (validTypes.some(type => contentType.includes(type))) {
      return true;
    }
  }

  // Check by file signature (magic numbers)
  if (buffer.length < 4) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return true;
  }

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return true;
  }

  // GIF: 47 49 46
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return true;
  }

  // BMP: 42 4D
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
    return true;
  }

  // WEBP: 52 49 46 46 ... 57 45 42 50
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    if (buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return true;
    }
  }

  // HEIC/HEIF: Check for ftyp box at offset 4-8
  // HEIC files start with: 00 00 00 XX 66 74 79 70 (where XX is size, ftyp is the box type)
  if (buffer.length >= 12) {
    const ftypSignature = buffer.toString('ascii', 4, 8);
    if (ftypSignature === 'ftyp') {
      // Check for HEIC/HEIF brand
      const brand = buffer.toString('ascii', 8, 12);
      if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('hevc') ||
          brand.startsWith('hevx') || brand.startsWith('mif1') || brand.startsWith('msf1')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Create a canvas from an image for face detection
 */
export function createCanvasFromImage(image: Image): Canvas {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return canvas;
}
