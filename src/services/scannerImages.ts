/** Match a centered card guide to a cover-scaled camera preview, including a small surround for local detection. */
export function scannerGuide(width: number, height: number) {
  const cardWidth = Math.min(width * 0.68, height * 0.72 * 64 / 88);
  return { width: cardWidth, height: cardWidth * 88 / 64 };
}

export function scannerCrop(photo: { width: number; height: number }, preview: { width: number; height: number }) {
  if ([photo.width, photo.height, preview.width, preview.height].some(value => !Number.isFinite(value) || value <= 0)) throw new Error('Camera dimensions are unavailable.');
  const guide = scannerGuide(preview.width, preview.height);
  const scale = Math.max(preview.width / photo.width, preview.height / photo.height);
  const width = Math.min(photo.width, Math.round(guide.width * 1.2 / scale));
  const height = Math.min(photo.height, Math.round(guide.height * 1.2 / scale));
  return { originX: Math.max(0, Math.floor((photo.width - width) / 2)), originY: Math.max(0, Math.floor((photo.height - height) / 2)), width: Math.max(1, width), height: Math.max(1, height) };
}

/** Small thumbnail decoder; no Buffer polyfill or JPEG-byte fingerprinting on the mobile client. */
export function thumbnailBytes(base64: string): Uint8Array {
  if (base64.length > 100_000 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('Invalid camera thumbnail.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const length = base64.length / 4 * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (let index = 0; index < base64.length; index += 4) {
    const value = alphabet.indexOf(base64[index]) << 18 | alphabet.indexOf(base64[index + 1]) << 12
      | Math.max(0, alphabet.indexOf(base64[index + 2])) << 6 | Math.max(0, alphabet.indexOf(base64[index + 3]));
    if (offset < length) bytes[offset++] = value >> 16 & 255;
    if (offset < length) bytes[offset++] = value >> 8 & 255;
    if (offset < length) bytes[offset++] = value & 255;
  }
  return bytes;
}
