export interface LyricLine {
  id: string;
  time: number | null;
  text: string;
}

export interface ParsedLyrics {
  lines: LyricLine[];
  isSynced: boolean;
}

const TIMESTAMP_TAG_RE = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const META_TAG_RE = /^\[(ti|ar|al|au|lr|by|re|ve|length|offset):(.*)\]$/i;

function parseTimestampMatch(minStr: string, secStr: string, fracStr?: string): number {
  const mins = parseInt(minStr, 10);
  const secs = parseInt(secStr, 10);
  let frac = 0;
  if (fracStr) {
    if (fracStr.length === 1) frac = parseInt(fracStr, 10) / 10;
    else if (fracStr.length === 2) frac = parseInt(fracStr, 10) / 100;
    else frac = parseInt(fracStr.slice(0, 3), 10) / 1000;
  }
  return mins * 60 + secs + frac;
}

export function formatLrcTimestamp(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const centis = Math.floor((safe - Math.floor(safe)) * 100);
  return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}]`;
}

export function parseLyrics(raw?: string): ParsedLyrics {
  if (!raw || !raw.trim()) {
    return { lines: [], isSynced: false };
  }

  const rawLines = raw.replace(/\r\n?/g, '\n').split('\n');
  const timedLines: Array<{ time: number; text: string }> = [];
  let offsetSeconds = 0;

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const metaMatch = trimmed.match(META_TAG_RE);
    if (metaMatch) {
      if (metaMatch[1].toLowerCase() === 'offset') {
        const ms = parseFloat(metaMatch[2].trim());
        if (Number.isFinite(ms)) {
          offsetSeconds = ms / 1000;
        }
      }
      continue;
    }

    TIMESTAMP_TAG_RE.lastIndex = 0;
    const matches = Array.from(trimmed.matchAll(TIMESTAMP_TAG_RE));
    if (matches.length > 0) {
      const cleanText = trimmed.replace(TIMESTAMP_TAG_RE, '').trim();
      for (const m of matches) {
        const t = Math.max(0, parseTimestampMatch(m[1], m[2], m[3]) + offsetSeconds);
        timedLines.push({
          time: t,
          text: cleanText || '•••',
        });
      }
    }
  }

  if (timedLines.length > 0) {
    timedLines.sort((a, b) => a.time - b.time);
    return {
      isSynced: true,
      lines: timedLines.map((item, idx) => ({
        id: `sync-${idx}-${item.time.toFixed(2)}`,
        time: item.time,
        text: item.text,
      })),
    };
  }

  // Fallback for plain / unsynced embedded lyrics (USLT, M4A ©lyr, plain text)
  const plainLines: LyricLine[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (!trimmed) {
      // Collapse consecutive blank lines
      if (plainLines.length > 0 && plainLines[plainLines.length - 1].text !== '') {
        plainLines.push({ id: `gap-${i}`, time: null, text: '' });
      }
      continue;
    }
    plainLines.push({
      id: `plain-${i}`,
      time: null,
      text: trimmed,
    });
  }

  // Trim trailing spacer
  while (plainLines.length > 0 && plainLines[plainLines.length - 1].text === '') {
    plainLines.pop();
  }

  return {
    isSynced: false,
    lines: plainLines,
  };
}

export function getActiveLyricIndex(
  parsed: ParsedLyrics,
  currentTime: number,
  totalDuration: number
): number {
  const { lines, isSynced } = parsed;
  if (lines.length === 0) return -1;

  if (isSynced) {
    // Slight 0.12s look-ahead so line transition feels tight with the beat
    const target = currentTime + 0.12;
    let active = -1;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].time;
      if (t !== null && t <= target) {
        active = i;
      } else if (t !== null && t > target) {
        break;
      }
    }
    return active;
  }

  // Unsynced embedded lyrics: map playback progress smoothly across lyric lines
  const nonEmptyIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].text.trim().length > 0) {
      nonEmptyIndices.push(i);
    }
  }
  if (nonEmptyIndices.length === 0 || totalDuration <= 0) return -1;

  // Weight lines slightly by length with gentle intro/outro margins
  const introOffset = Math.min(4, totalDuration * 0.04);
  const outroMargin = Math.min(5, totalDuration * 0.05);
  const span = Math.max(1, totalDuration - introOffset - outroMargin);
  if (currentTime < introOffset) return -1;

  const progress = Math.min(0.9999, Math.max(0, (currentTime - introOffset) / span));
  const stepIdx = Math.floor(progress * nonEmptyIndices.length);
  return nonEmptyIndices[Math.min(nonEmptyIndices.length - 1, stepIdx)];
}
