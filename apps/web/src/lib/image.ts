/**
 * Downscale a photo to max 1600px and re-encode as JPEG.
 * Keeps uploads ~200-400 KB; receipt text stays readable.
 */
export async function fileToDataUrl(file: File, maxSide = 1600, quality = 0.85): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('File không phải ảnh');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}
