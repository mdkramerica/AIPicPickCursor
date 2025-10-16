import { createCanvas, loadImage, Canvas, Image } from 'canvas';
import { ObjectStorageService } from './objectStorage.js';
import { objectStorageClient } from './objectStorage.js';
import path from 'path';

/**
 * Load image from URL (object storage path) and return canvas image
 */
export async function loadImageFromUrl(url: string): Promise<Image> {
  try {
    let buffer: Buffer;
    let contentType: string | undefined;

    // If it's an /objects/ path, get it from object storage
    if (url.startsWith('/objects/')) {
      const objectStorageService = new ObjectStorageService();
      const file = await objectStorageService.getObjectEntityFile(url);
      
      // Get metadata for content type
      const [metadata] = await file.getMetadata();
      contentType = metadata.contentType;
      
      // Download the file content
      const [bufferData] = await file.download();
      buffer = bufferData;
      
      console.log(`Image loaded: ${url}, size: ${buffer.length} bytes, type: ${contentType}`);
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

    // Load image with canvas
    const image = await loadImage(buffer);
    return image;
  } catch (error) {
    console.error('Error loading image from', url, ':', error);
    throw new Error(`Failed to load image from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if buffer contains a valid image format
 */
function isValidImageFormat(buffer: Buffer, contentType?: string): boolean {
  // Check by content type
  if (contentType) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
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
