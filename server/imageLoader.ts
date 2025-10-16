import { createCanvas, loadImage, Canvas, Image } from 'canvas';
import { ObjectStorageService } from './objectStorage.js';

/**
 * Load image from URL (object storage path) and return canvas image
 */
export async function loadImageFromUrl(url: string): Promise<Image> {
  try {
    let buffer: Buffer;

    // If it's an /objects/ path, get it from object storage
    if (url.startsWith('/objects/')) {
      const objectStorageService = new ObjectStorageService();
      const objectPath = url.replace('/objects/', '');
      buffer = await objectStorageService.getObject(objectPath);
    } else {
      // For external URLs, use fetch
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    const image = await loadImage(buffer);
    return image;
  } catch (error) {
    console.error('Error loading image:', error);
    throw new Error(`Failed to load image from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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
