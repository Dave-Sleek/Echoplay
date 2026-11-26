const ARTWORK_PALETTES = [
  { bg1: '#23192D', bg2: '#5B2333', accent: '#FA3C52' },
  { bg1: '#111D2E', bg2: '#1E3A5F', accent: '#38BDF8' },
  { bg1: '#18241C', bg2: '#254D38', accent: '#34D399' },
  { bg1: '#281E14', bg2: '#5A3818', accent: '#FBBF24' },
  { bg1: '#1E1B2E', bg2: '#3B326B', accent: '#818CF8' },
  { bg1: '#261820', bg2: '#4E2438', accent: '#FB7185' },
  { bg1: '#162024', bg2: '#23424D', accent: '#2DD4BF' },
  { bg1: '#221E1A', bg2: '#443B32', accent: '#F97316' },
];

function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function getPaletteForKey(key: string) {
  const idx = hashString(key || 'echoplay') % ARTWORK_PALETTES.length;
  return ARTWORK_PALETTES[idx];
}

// Memory cache for IndexedDB artwork Blob URLs so components don't flicker or leak memory
const urlCache = new Map<string, string>();
const dataUrlCache = new Map<string, string>();

export function registerArtworkUrl(artworkId: string, blob: Blob): string {
  const existing = urlCache.get(artworkId);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  urlCache.set(artworkId, url);
  return url;
}

export function getCachedArtworkUrl(artworkId?: string): string | undefined {
  if (!artworkId) return undefined;
  return urlCache.get(artworkId);
}

export function revokeAllArtworkUrls(): void {
  for (const url of urlCache.values()) {
    URL.revokeObjectURL(url);
  }
  urlCache.clear();
  dataUrlCache.clear();
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function getMediaSessionArtworkDataUrl(
  artworkId: string | undefined,
  artworkBlob: Blob | undefined,
  fallbackKey: string
): Promise<string> {
  if (artworkId && dataUrlCache.has(artworkId)) {
    return dataUrlCache.get(artworkId)!;
  }
  if (artworkBlob) {
    try {
      const dataUrl = await blobToDataUrl(artworkBlob);
      if (artworkId) dataUrlCache.set(artworkId, dataUrl);
      return dataUrl;
    } catch {
      // Fall through to generated SVG data URL
    }
  }
  const pal = getPaletteForKey(fallbackKey);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${pal.bg1}"/><stop offset="100%" stop-color="${pal.bg2}"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/><circle cx="256" cy="256" r="140" fill="none" stroke="${pal.accent}" stroke-opacity="0.3" stroke-width="18"/><circle cx="256" cy="256" r="64" fill="${pal.accent}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function compressImageFileToDataUrl(file: File, maxSize = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      const size = Math.min(maxSize, Math.max(img.width, img.height));
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    img.src = objectUrl;
  });
}
