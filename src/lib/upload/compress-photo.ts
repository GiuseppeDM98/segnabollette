'use client';

/** The longest side Claude reads at full resolution; a larger photo costs more and reads no better. */
const MAX_SIDE = 2576;
const JPEG_QUALITY = 0.85;

export class UnsupportedPhotoError extends Error {
  constructor() {
    super('Formato immagine non supportato: usa JPEG o PNG.');
    this.name = 'UnsupportedPhotoError';
  }
}

/** Any photo the browser can decode, upright and as a JPEG of at most 2,576 px on its long side. */
export async function compressPhoto(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new UnsupportedPhotoError();
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new UnsupportedPhotoError();
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new UnsupportedPhotoError())),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}
