import type { AudioFormat } from '../types/music';

export interface ParsedAudioMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number;
  trackNumber?: number;
  year?: string;
  lyrics?: string;
  replayGainDb?: number;
  artworkBlob?: Blob;
  artworkMimeType?: string;
  format: AudioFormat;
}

const SUPPORTED_EXTENSIONS: Record<string, AudioFormat> = {
  mp3: 'MP3',
  m4a: 'M4A',
  mp4: 'M4A',
  aac: 'AAC',
  wav: 'WAV',
  wave: 'WAV',
  flac: 'FLAC',
  ogg: 'OGG',
  oga: 'OGG',
  opus: 'OGG',
  webm: 'OGG',
  weba: 'OGG',
  aif: 'WAV',
  aiff: 'WAV',
};

export function detectAudioFormat(file: File): AudioFormat | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext in SUPPORTED_EXTENSIONS) {
    return SUPPORTED_EXTENSIONS[ext];
  }
  const mime = (file.type || '').toLowerCase();
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'MP3';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'M4A';
  if (mime.includes('aac')) return 'AAC';
  if (mime.includes('wav')) return 'WAV';
  if (mime.includes('flac')) return 'FLAC';
  if (mime.includes('ogg') || mime.includes('opus') || mime.includes('webm')) return 'OGG';
  if (mime.startsWith('audio/')) return 'AUDIO';
  return null;
}

export async function computeFileFingerprint(file: File): Promise<string> {
  // Fast deterministic fingerprint using file size, name, and boundary bytes
  const headSlice = await file.slice(0, Math.min(8192, file.size)).arrayBuffer();
  const tailStart = Math.max(0, file.size - 8192);
  const tailSlice = await file.slice(tailStart, file.size).arrayBuffer();
  const headBytes = new Uint8Array(headSlice);
  const tailBytes = new Uint8Array(tailSlice);

  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < headBytes.length; i++) {
    h1 ^= headBytes[i];
    h1 = Math.imul(h1, 0x01000193);
  }
  for (let i = 0; i < tailBytes.length; i++) {
    h2 ^= tailBytes[i];
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${file.size}-${(h1 >>> 0).toString(16)}-${(h2 >>> 0).toString(16)}`;
}

function cleanFileNameFallback(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').trim();
  const withoutTrackNum = base.replace(/^\d{1,3}[\s.\-_]+/, '').trim();
  const dashSplit = withoutTrackNum.split(/\s+[-–—]\s+/);
  if (dashSplit.length >= 2) {
    return {
      artist: dashSplit[0].trim() || 'Unknown Artist',
      title: dashSplit.slice(1).join(' - ').trim() || withoutTrackNum || base,
    };
  }
  return {
    title: withoutTrackNum || base || 'Untitled Track',
    artist: 'Unknown Artist',
  };
}

function decodeTextBytes(bytes: Uint8Array, encodingByte: number): string {
  if (bytes.length === 0) return '';
  try {
    if (encodingByte === 0) {
      return new TextDecoder('iso-8859-1').decode(bytes).replace(/\0/g, '').trim();
    }
    if (encodingByte === 1) {
      if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder('utf-16le').decode(bytes.subarray(2)).replace(/\0/g, '').trim();
      }
      if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return new TextDecoder('utf-16be').decode(bytes.subarray(2)).replace(/\0/g, '').trim();
      }
      return new TextDecoder('utf-16le').decode(bytes).replace(/\0/g, '').trim();
    }
    if (encodingByte === 2) {
      return new TextDecoder('utf-16be').decode(bytes).replace(/\0/g, '').trim();
    }
    return new TextDecoder('utf-8').decode(bytes).replace(/\0/g, '').trim();
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\0/g, '').trim();
  }
}

function readSynchsafeInt(view: DataView, offset: number): number {
  return (
    ((view.getUint8(offset) & 0x7f) << 21) |
    ((view.getUint8(offset + 1) & 0x7f) << 14) |
    ((view.getUint8(offset + 2) & 0x7f) << 7) |
    (view.getUint8(offset + 3) & 0x7f)
  );
}

function removeUnsynchronisation(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    out.push(bytes[i]);
    if (bytes[i] === 0xff && i + 1 < bytes.length && bytes[i + 1] === 0x00) {
      i++;
    }
  }
  return new Uint8Array(out);
}

function parseID3v2(buffer: ArrayBuffer): Partial<ParsedAudioMetadata> {
  const result: Partial<ParsedAudioMetadata> = {};
  if (buffer.byteLength < 10) return result;
  const view = new DataView(buffer);
  if (
    view.getUint8(0) !== 0x49 ||
    view.getUint8(1) !== 0x44 ||
    view.getUint8(2) !== 0x33
  ) {
    return result;
  }

  const majorVersion = view.getUint8(3);
  const flags = view.getUint8(5);
  const tagSize = readSynchsafeInt(view, 6);
  const tagEnd = Math.min(buffer.byteLength, 10 + tagSize);

  let offset = 10;
  // Extended header in v2.3 / v2.4
  if ((flags & 0x40) !== 0 && offset + 4 <= tagEnd) {
    const extSize =
      majorVersion === 4
        ? readSynchsafeInt(view, offset)
        : view.getUint32(offset, false) + 4;
    offset += extSize;
  }

  const rawBytes = new Uint8Array(buffer);

  while (offset < tagEnd) {
    if (rawBytes[offset] === 0) break;

    if (majorVersion === 2) {
      if (offset + 6 > tagEnd) break;
      const frameId = String.fromCharCode(
        rawBytes[offset],
        rawBytes[offset + 1],
        rawBytes[offset + 2]
      );
      const frameSize =
        (rawBytes[offset + 3] << 16) |
        (rawBytes[offset + 4] << 8) |
        rawBytes[offset + 5];
      offset += 6;
      if (frameSize <= 0 || offset + frameSize > tagEnd) break;
      const frameData = rawBytes.subarray(offset, offset + frameSize);
      offset += frameSize;

      if (frameId === 'TT2') result.title = decodeTextBytes(frameData.subarray(1), frameData[0]);
      else if (frameId === 'TP1') result.artist = decodeTextBytes(frameData.subarray(1), frameData[0]);
      else if (frameId === 'TAL') result.album = decodeTextBytes(frameData.subarray(1), frameData[0]);
      else if (frameId === 'TYE') result.year = decodeTextBytes(frameData.subarray(1), frameData[0]);
      else if (frameId === 'PIC' && frameData.length > 6 && !result.artworkBlob) {
        const format = String.fromCharCode(frameData[1], frameData[2], frameData[3]).toLowerCase();
        const mime = format === 'png' ? 'image/png' : 'image/jpeg';
        let pos = 5;
        while (pos < frameData.length && frameData[pos] !== 0) pos++;
        pos++;
        if (pos < frameData.length) {
          const imgBytes = new Uint8Array(frameData.subarray(pos));
          result.artworkMimeType = mime;
          result.artworkBlob = new Blob([imgBytes], { type: mime });
        }
      }
    } else {
      if (offset + 10 > tagEnd) break;
      const frameId = String.fromCharCode(
        rawBytes[offset],
        rawBytes[offset + 1],
        rawBytes[offset + 2],
        rawBytes[offset + 3]
      );
      const frameSize =
        majorVersion === 4
          ? readSynchsafeInt(view, offset + 4)
          : view.getUint32(offset + 4, false);
      const frameFlags2 = rawBytes[offset + 9];
      offset += 10;
      if (frameSize <= 0 || offset + frameSize > tagEnd) break;

      let frameData: Uint8Array = rawBytes.subarray(offset, offset + frameSize);
      offset += frameSize;

      if ((flags & 0x80) !== 0 || (frameFlags2 & 0x02) !== 0) {
        frameData = removeUnsynchronisation(frameData);
      }
      if (frameData.length === 0) continue;

      if (frameId === 'TIT2') {
        result.title = decodeTextBytes(frameData.subarray(1), frameData[0]);
      } else if (frameId === 'TPE1') {
        result.artist = decodeTextBytes(frameData.subarray(1), frameData[0]);
      } else if (frameId === 'TALB') {
        result.album = decodeTextBytes(frameData.subarray(1), frameData[0]);
      } else if (frameId === 'TRCK') {
        const trk = decodeTextBytes(frameData.subarray(1), frameData[0]);
        const num = parseInt(trk.split('/')[0], 10);
        if (!Number.isNaN(num)) result.trackNumber = num;
      } else if (frameId === 'TYER' || frameId === 'TDRC') {
        const yr = decodeTextBytes(frameData.subarray(1), frameData[0]);
        if (yr) result.year = yr.slice(0, 4);
      } else if (frameId === 'TXXX' && frameData.length > 2) {
        const enc = frameData[0];
        let pos = 1;
        if (enc === 1 || enc === 2) {
          while (pos + 1 < frameData.length && !(frameData[pos] === 0 && frameData[pos + 1] === 0)) {
            pos += 2;
          }
          const desc = decodeTextBytes(frameData.subarray(1, pos), enc).toLowerCase();
          pos += 2;
          if (desc === 'replaygain_track_gain' && pos < frameData.length) {
            const valStr = decodeTextBytes(frameData.subarray(pos), enc);
            const parsedGain = parseFloat(valStr.replace(/[^0-9+\-.]/g, ''));
            if (Number.isFinite(parsedGain)) result.replayGainDb = parsedGain;
          }
        } else {
          while (pos < frameData.length && frameData[pos] !== 0) pos++;
          const desc = decodeTextBytes(frameData.subarray(1, pos), enc).toLowerCase();
          pos += 1;
          if (desc === 'replaygain_track_gain' && pos < frameData.length) {
            const valStr = decodeTextBytes(frameData.subarray(pos), enc);
            const parsedGain = parseFloat(valStr.replace(/[^0-9+\-.]/g, ''));
            if (Number.isFinite(parsedGain)) result.replayGainDb = parsedGain;
          }
        }
      } else if (frameId === 'USLT' && frameData.length > 5 && !result.lyrics) {
        const enc = frameData[0];
        let pos = 4; // skip encoding (1) + lang (3)
        if (enc === 1 || enc === 2) {
          while (pos + 1 < frameData.length && !(frameData[pos] === 0 && frameData[pos + 1] === 0)) {
            pos += 2;
          }
          pos += 2;
        } else {
          while (pos < frameData.length && frameData[pos] !== 0) pos++;
          pos += 1;
        }
        if (pos < frameData.length) {
          result.lyrics = decodeTextBytes(frameData.subarray(pos), enc);
        }
      } else if (frameId === 'APIC' && frameData.length > 4 && !result.artworkBlob) {
        const enc = frameData[0];
        let pos = 1;
        while (pos < frameData.length && frameData[pos] !== 0) pos++;
        let mime = new TextDecoder('iso-8859-1').decode(frameData.subarray(1, pos)).toLowerCase().trim();
        if (!mime || mime === 'jpg') mime = 'image/jpeg';
        if (mime === 'png') mime = 'image/png';
        if (!mime.startsWith('image/')) mime = 'image/jpeg';
        pos++; // null terminator after mime
        pos++; // picture type byte
        // skip description (null-terminated)
        if (enc === 1 || enc === 2) {
          while (pos + 1 < frameData.length && !(frameData[pos] === 0 && frameData[pos + 1] === 0)) {
            pos += 2;
          }
          pos += 2;
        } else {
          while (pos < frameData.length && frameData[pos] !== 0) pos++;
          pos += 1;
        }
        if (pos < frameData.length) {
          const imgBytes = new Uint8Array(frameData.subarray(pos));
          if (imgBytes.length > 16) {
            result.artworkMimeType = mime;
            result.artworkBlob = new Blob([imgBytes], { type: mime });
          }
        }
      }
    }
  }
  return result;
}

function parseID3v1(buffer: ArrayBuffer): Partial<ParsedAudioMetadata> {
  if (buffer.byteLength < 128) return {};
  const tail = new Uint8Array(buffer, buffer.byteLength - 128, 128);
  const tag = String.fromCharCode(tail[0], tail[1], tail[2]);
  if (tag !== 'TAG') return {};
  const dec = new TextDecoder('iso-8859-1');
  const clean = (s: Uint8Array) => dec.decode(s).replace(/\0/g, '').trim();
  return {
    title: clean(tail.subarray(3, 33)) || undefined,
    artist: clean(tail.subarray(33, 63)) || undefined,
    album: clean(tail.subarray(63, 93)) || undefined,
    year: clean(tail.subarray(93, 97)) || undefined,
  };
}

function parseMP4Atoms(buffer: ArrayBuffer): Partial<ParsedAudioMetadata> {
  const result: Partial<ParsedAudioMetadata> = {};
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  function readAtomName(offset: number): string {
    return String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
  }

  function walk(start: number, end: number) {
    let offset = start;
    while (offset + 8 <= end) {
      let size = view.getUint32(offset, false);
      const name = readAtomName(offset + 4);
      let headerSize = 8;
      if (size === 1 && offset + 16 <= end) {
        // 64-bit extended size
        const hi = view.getUint32(offset + 8, false);
        const lo = view.getUint32(offset + 12, false);
        size = hi * 4294967296 + lo;
        headerSize = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < headerSize || offset + size > end) break;

      const bodyStart = offset + headerSize;
      const bodyEnd = offset + size;

      if (name === 'moov' || name === 'udta' || name === 'ilst') {
        walk(bodyStart, bodyEnd);
      } else if (name === 'meta') {
        // meta atom has 4-byte version/flags header before child atoms
        walk(bodyStart + 4, bodyEnd);
      } else if (
        name === '\xa9nam' ||
        name === '\xa9ART' ||
        name === '\xa9alb' ||
        name === '\xa9day' ||
        name === '\xa9lyr' ||
        name === 'trkn' ||
        name === 'covr'
      ) {
        let sub = bodyStart;
        while (sub + 16 <= bodyEnd) {
          const dataSize = view.getUint32(sub, false);
          const dataName = readAtomName(sub + 4);
          if (dataSize < 16 || sub + dataSize > bodyEnd) break;
          if (dataName === 'data') {
            const typeFlag = view.getUint32(sub + 8, false) & 0x00ffffff;
            const payload = bytes.subarray(sub + 16, sub + dataSize);
            if (name === '\xa9nam') {
              result.title = new TextDecoder('utf-8').decode(payload).trim();
            } else if (name === '\xa9ART') {
              result.artist = new TextDecoder('utf-8').decode(payload).trim();
            } else if (name === '\xa9alb') {
              result.album = new TextDecoder('utf-8').decode(payload).trim();
            } else if (name === '\xa9day') {
              result.year = new TextDecoder('utf-8').decode(payload).trim().slice(0, 4);
            } else if (name === '\xa9lyr') {
              result.lyrics = new TextDecoder('utf-8').decode(payload).trim();
            } else if (name === 'trkn' && payload.length >= 4) {
              result.trackNumber = (payload[2] << 8) | payload[3];
            } else if (name === 'covr' && !result.artworkBlob && payload.length > 16) {
              const mime = typeFlag === 14 ? 'image/png' : 'image/jpeg';
              result.artworkMimeType = mime;
              result.artworkBlob = new Blob([new Uint8Array(payload)], { type: mime });
            }
          }
          sub += dataSize;
        }
      }
      offset += size;
    }
  }

  walk(0, buffer.byteLength);
  return result;
}

function parseFlacMetadata(buffer: ArrayBuffer): Partial<ParsedAudioMetadata> {
  const result: Partial<ParsedAudioMetadata> = {};
  if (buffer.byteLength < 8) return result;
  const bytes = new Uint8Array(buffer);
  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (sig !== 'fLaC') return result;

  const view = new DataView(buffer);
  let offset = 4;
  let isLast = false;

  while (!isLast && offset + 4 <= buffer.byteLength) {
    const header = bytes[offset];
    isLast = (header & 0x80) !== 0;
    const blockType = header & 0x7f;
    const blockLen =
      (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    offset += 4;
    if (offset + blockLen > buffer.byteLength) break;

    if (blockType === 4) {
      // VORBIS_COMMENT
      let pos = offset;
      const vendorLen = view.getUint32(pos, true);
      pos += 4 + vendorLen;
      if (pos + 4 <= offset + blockLen) {
        const count = view.getUint32(pos, true);
        pos += 4;
        for (let i = 0; i < count && pos + 4 <= offset + blockLen; i++) {
          const len = view.getUint32(pos, true);
          pos += 4;
          if (pos + len > offset + blockLen) break;
          const comment = new TextDecoder('utf-8').decode(bytes.subarray(pos, pos + len));
          pos += len;
          const eq = comment.indexOf('=');
          if (eq > 0) {
            const key = comment.slice(0, eq).toUpperCase();
            const val = comment.slice(eq + 1).trim();
            if (key === 'TITLE') result.title = val;
            else if (key === 'ARTIST') result.artist = val;
            else if (key === 'ALBUM') result.album = val;
            else if (key === 'DATE' || key === 'YEAR') result.year = val.slice(0, 4);
            else if (key === 'TRACKNUMBER') {
              const n = parseInt(val, 10);
              if (!Number.isNaN(n)) result.trackNumber = n;
            } else if (key === 'LYRICS' || key === 'UNSYNCEDLYRICS') {
              result.lyrics = val;
            } else if (key === 'REPLAYGAIN_TRACK_GAIN') {
              const parsedGain = parseFloat(val.replace(/[^0-9+\-.]/g, ''));
              if (Number.isFinite(parsedGain)) result.replayGainDb = parsedGain;
            }
          }
        }
      }
    } else if (blockType === 6 && !result.artworkBlob) {
      // PICTURE
      let pos = offset + 4; // skip picture type
      const mimeLen = view.getUint32(pos, false);
      pos += 4;
      const mime = new TextDecoder('utf-8').decode(bytes.subarray(pos, pos + mimeLen)) || 'image/jpeg';
      pos += mimeLen;
      const descLen = view.getUint32(pos, false);
      pos += 4 + descLen + 16; // skip width/height/depth/colors
      if (pos + 4 <= offset + blockLen) {
        const picLen = view.getUint32(pos, false);
        pos += 4;
        if (pos + picLen <= offset + blockLen && picLen > 16) {
          result.artworkMimeType = mime;
          result.artworkBlob = new Blob([new Uint8Array(bytes.subarray(pos, pos + picLen))], {
            type: mime,
          });
        }
      }
    }

    offset += blockLen;
  }
  return result;
}

const activeMetadataProbes = new Set<HTMLAudioElement>();

function measureAudioDuration(file: File): Promise<{ duration: number; playable: boolean }> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    activeMetadataProbes.add(audio);
    const url = URL.createObjectURL(file);
    let settled = false;

    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('error', onError);
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      activeMetadataProbes.delete(audio);
    };

    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve({ duration: 0, playable: true });
      }
    }, 3500);

    const onLoaded = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
      cleanup();
      resolve({ duration: dur, playable: true });
    };

    const onError = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      resolve({ duration: 0, playable: false });
    };

    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('error', onError);
    audio.src = url;
    audio.load();
  });
}

export async function extractAudioMetadata(file: File): Promise<{
  metadata: ParsedAudioMetadata;
  playable: boolean;
}> {
  const format = detectAudioFormat(file) ?? 'AUDIO';
  const fallback = cleanFileNameFallback(file.name);

  let parsed: Partial<ParsedAudioMetadata> = {};
  try {
    // Read header chunk up to 4MB (for embedded high-res album art) or full file if smaller
    const headBytes = Math.min(file.size, 4 * 1024 * 1024);
    const headBuffer = await file.slice(0, headBytes).arrayBuffer();

    if (format === 'MP3' || format === 'AAC') {
      parsed = parseID3v2(headBuffer);
      if (!parsed.title && file.size >= 128) {
        const tailBuffer = await file.slice(file.size - 128, file.size).arrayBuffer();
        const v1 = parseID3v1(tailBuffer);
        parsed = { ...v1, ...parsed };
      }
    } else if (format === 'M4A') {
      // M4A moov atom can sit at beginning or end of file; read full file if <= 25MB
      const m4aBuf =
        file.size <= 25 * 1024 * 1024 ? await file.arrayBuffer() : headBuffer;
      parsed = parseMP4Atoms(m4aBuf);
    } else if (format === 'FLAC') {
      parsed = parseFlacMetadata(headBuffer);
    }
  } catch {
    // Gracefully fallback to filename metadata
  }

  const { duration, playable } = await measureAudioDuration(file);

  return {
    playable,
    metadata: {
      title: parsed.title || fallback.title,
      artist: parsed.artist || fallback.artist,
      album: parsed.album || 'Single / Unknown Album',
      duration,
      trackNumber: parsed.trackNumber,
      year: parsed.year,
      lyrics: parsed.lyrics,
      replayGainDb: parsed.replayGainDb,
      artworkBlob: parsed.artworkBlob,
      artworkMimeType: parsed.artworkMimeType,
      format,
    },
  };
}

export function canonicalizeAudioMimeType(mime?: string): string | undefined {
  if (!mime) return undefined;
  const base = mime.split(';')[0].trim().toLowerCase();
  if (!base || base === 'application/octet-stream' || base === 'audio/octet-stream') {
    return undefined;
  }
  switch (base) {
    case 'audio/mp3':
    case 'audio/x-mp3':
    case 'audio/mpeg3':
    case 'audio/x-mpeg-3':
    case 'audio/x-mpeg':
      return 'audio/mpeg';
    case 'audio/x-m4a':
    case 'audio/m4a':
    case 'audio/mp4a-latm':
    case 'video/mp4':
      return 'audio/mp4';
    case 'audio/x-aac':
      return 'audio/aac';
    case 'audio/x-wav':
    case 'audio/wave':
    case 'audio/vnd.wave':
      return 'audio/wav';
    case 'audio/x-flac':
      return 'audio/flac';
    case 'application/ogg':
    case 'audio/x-ogg':
      return 'audio/ogg';
    case 'video/webm':
      return 'audio/webm';
    default:
      return base.startsWith('audio/') ? base : undefined;
  }
}

function isValidMpegOrAdtsSync(bytes: Uint8Array, offset: number): string | undefined {
  if (offset + 3 >= bytes.length) return undefined;
  const b0 = bytes[offset];
  const b1 = bytes[offset + 1];
  const b2 = bytes[offset + 2];
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return undefined;

  const version = (b1 >> 3) & 0x03;
  const layer = (b1 >> 1) & 0x03;
  // Layer 00 in MPEG sync is ADTS AAC (valid version 0 or 1 in ADTS, sampleRateIdx != 15)
  if (layer === 0) {
    const sampleRateIdx = (b2 >> 2) & 0x0f;
    if (sampleRateIdx < 13) return 'audio/aac';
    return undefined;
  }
  // Valid MPEG Audio (MP1/MP2/MP3): version != 1 (reserved), bitrateIdx != 0x0F, sampleRateIdx != 0x03
  if (version === 1) return undefined;
  const bitrateIdx = (b2 >> 4) & 0x0f;
  const sampleRateIdx = (b2 >> 2) & 0x03;
  if (bitrateIdx === 0x0f || sampleRateIdx === 0x03) return undefined;
  return 'audio/mpeg';
}

export function sniffAudioMimeFromBytes(bytes: Uint8Array): string | undefined {
  if (bytes.length < 4) return undefined;

  // RIFF....WAVE -> WAV
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    return 'audio/wav';
  }
  // FORM....AIFF / AIFC -> AIFF
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x46 &&
    bytes[1] === 0x4f &&
    bytes[2] === 0x52 &&
    bytes[3] === 0x4d &&
    bytes[8] === 0x41 &&
    bytes[9] === 0x49 &&
    bytes[10] === 0x46 &&
    (bytes[11] === 0x46 || bytes[11] === 0x43)
  ) {
    return 'audio/aiff';
  }
  // fLaC -> FLAC
  if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) {
    return 'audio/flac';
  }
  // OggS -> OGG / Opus
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return 'audio/ogg';
  }
  // EBML / WebM / Matroska (0x1A 0x45 0xDF 0xA3)
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'audio/webm';
  }
  // ISO BMFF ....ftyp -> M4A / MP4
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return 'audio/mp4';
  }
  // ADIF -> AAC
  if (bytes[0] === 0x41 && bytes[1] === 0x44 && bytes[2] === 0x49 && bytes[3] === 0x46) {
    return 'audio/aac';
  }
  // ID3v2 header -> inspect audio frame right after tag if available
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const tagSize =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);
    const audioStart = 10 + tagSize;
    if (audioStart + 4 <= bytes.length) {
      const scanLimit = Math.min(bytes.length - 4, audioStart + 512);
      for (let i = audioStart; i <= scanLimit; i++) {
        const synced = isValidMpegOrAdtsSync(bytes, i);
        if (synced) return synced;
      }
    }
    return undefined;
  }

  // Scan first 512 bytes for valid MPEG or ADTS frame sync (handles leading null padding)
  const scanLimit = Math.min(bytes.length - 4, 512);
  for (let i = 0; i <= scanLimit; i++) {
    if (bytes[i] === 0x00 || i === 0) {
      const synced = isValidMpegOrAdtsSync(bytes, i);
      if (synced) return synced;
    } else if (i > 0 && bytes[i - 1] !== 0x00) {
      break;
    }
  }
  return undefined;
}

export function resolveAudioMimeType(
  format: AudioFormat,
  fileName: string,
  currentMime?: string,
  headerBytes?: Uint8Array
): string {
  if (headerBytes) {
    const sniffed = sniffAudioMimeFromBytes(headerBytes);
    if (sniffed) return sniffed;
  }

  const canonical = canonicalizeAudioMimeType(currentMime);
  if (canonical) return canonical;

  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (format === 'MP3' || ext === 'mp3') return 'audio/mpeg';
  if (format === 'M4A' || ext === 'm4a' || ext === 'mp4') return 'audio/mp4';
  if (format === 'AAC' || ext === 'aac') return 'audio/aac';
  if (format === 'WAV' || ext === 'wav' || ext === 'wave') return 'audio/wav';
  if (format === 'FLAC' || ext === 'flac') return 'audio/flac';
  if (format === 'OGG' || ext === 'ogg' || ext === 'oga' || ext === 'opus') return 'audio/ogg';

  return 'audio/mpeg';
}

// Target -16 dBFS perceptual RMS reference (consistent with ReplayGain 89 dB SPL / -18 to -14 LUFS)
const TARGET_RMS_DB = -16;

async function decodeBufferForLoudness(arrayBuf: ArrayBuffer): Promise<AudioBuffer | null> {
  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  if (OfflineCtx) {
    const offline = new OfflineCtx(1, 1, 44100);
    return await offline.decodeAudioData(arrayBuf.slice(0));
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  const ctx = new AudioCtx();
  try {
    return await ctx.decodeAudioData(arrayBuf.slice(0));
  } finally {
    ctx.close().catch(() => {});
  }
}

export async function analyzeTrackReplayGainDb(blob: Blob): Promise<number | undefined> {
  if (typeof window === 'undefined') return undefined;

  try {
    // Limit decode buffer to first 12MB for fast low-memory analysis on mobile devices
    const slice = blob.size > 12 * 1024 * 1024 ? blob.slice(0, 12 * 1024 * 1024) : blob;
    const arrayBuf = await slice.arrayBuffer();
    const audioBuffer = await decodeBufferForLoudness(arrayBuf);
    if (!audioBuffer) return undefined;

    const channels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    if (channels === 0 || length === 0) return 0;

    // Sample across the decoded track in chunks to compute RMS loudness
    const step = Math.max(1, Math.floor(length / 60000));
    let sumSq = 0;
    let count = 0;

    for (let ch = 0; ch < channels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i += step) {
        const s = data[i];
        sumSq += s * s;
        count++;
      }
    }

    const rms = Math.sqrt(sumSq / Math.max(1, count));
    if (rms < 1e-5) return 0;

    const rmsDb = 20 * Math.log10(rms);
    const gainDb = TARGET_RMS_DB - rmsDb;
    // Clamp adjustment to safe range [-12 dB, +8 dB] to avoid distortion on quiet tracks
    return Math.round(Math.max(-12, Math.min(8, gainDb)) * 10) / 10;
  } catch {
    return undefined;
  }
}
