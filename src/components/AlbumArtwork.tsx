import React, { useEffect, useState } from 'react';
import { Disc3 } from 'lucide-react';
import { getArtworkRecord } from '../db/indexedDb';
import { getCachedArtworkUrl, getPaletteForKey, registerArtworkUrl } from '../utils/artwork';

interface AlbumArtworkProps {
  artworkId?: string;
  customUrl?: string;
  fallbackKey: string;
  alt: string;
  sizeClass?: string;
  radiusClass?: string;
  className?: string;
  showEqualizer?: boolean;
  isPlaying?: boolean;
}

export const AlbumArtwork: React.FC<AlbumArtworkProps> = ({
  artworkId,
  customUrl,
  fallbackKey,
  alt,
  sizeClass = 'w-12 h-12',
  radiusClass = 'rounded-xl',
  className = '',
  showEqualizer = false,
  isPlaying = false,
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(
    () => customUrl || getCachedArtworkUrl(artworkId)
  );
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    if (customUrl) {
      setResolvedUrl(customUrl);
      return;
    }
    if (!artworkId) {
      setResolvedUrl(undefined);
      return;
    }
    const cached = getCachedArtworkUrl(artworkId);
    if (cached) {
      setResolvedUrl(cached);
      return;
    }
    let active = true;
    getArtworkRecord(artworkId)
      .then((rec) => {
        if (!active) return;
        if (rec?.blob) {
          setResolvedUrl(registerArtworkUrl(artworkId, rec.blob));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [artworkId, customUrl]);

  const palette = getPaletteForKey(fallbackKey);

  return (
    <div
      className={`relative shrink-0 overflow-hidden select-none ${sizeClass} ${radiusClass} ${className}`}
      style={{
        background: `linear-gradient(135deg, ${palette.bg1} 0%, ${palette.bg2} 100%)`,
      }}
    >
      {resolvedUrl && !hasError ? (
        <img
          src={resolvedUrl}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center relative">
          <svg
            viewBox="0 0 100 100"
            className="w-[72%] h-[72%] opacity-30"
            aria-hidden="true"
          >
            <circle cx="50" cy="50" r="44" fill="none" stroke="white" strokeWidth="1.5" />
            <circle cx="50" cy="50" r="30" fill="none" stroke="white" strokeWidth="1.5" />
          </svg>
          <Disc3
            className="w-[42%] h-[42%] absolute text-white/80"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </div>
      )}

      {showEqualizer && (
        <div
          className="absolute inset-0 bg-black/45 flex items-center justify-center gap-[3px]"
          aria-hidden="true"
        >
          <span
            className={`w-[3px] h-3.5 rounded-full bg-white ${
              isPlaying ? 'animate-eq-1' : 'scale-y-50'
            }`}
          />
          <span
            className={`w-[3px] h-4 rounded-full bg-white ${
              isPlaying ? 'animate-eq-2' : 'scale-y-75'
            }`}
          />
          <span
            className={`w-[3px] h-3 rounded-full bg-white ${
              isPlaying ? 'animate-eq-3' : 'scale-y-40'
            }`}
          />
        </div>
      )}
    </div>
  );
};
