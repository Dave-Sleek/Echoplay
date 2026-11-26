export type HapticPattern =
  | 'playPause'
  | 'skip'
  | 'longPress'
  | 'favorite'
  | 'tap'
  | 'selection'
  | 'dismiss';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  playPause: 12,
  skip: 15,
  longPress: [18, 28, 12],
  favorite: [10, 20, 14],
  tap: 8,
  selection: 6,
  dismiss: [14, 18],
};

let hapticsEnabled = true;
let iosSwitchLabel: HTMLLabelElement | null = null;
let iosSwitchInput: HTMLInputElement | null = null;

export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
}

function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function triggerIOSSafariTaptic(): void {
  if (typeof document === 'undefined' || !document.body) return;
  try {
    if (!iosSwitchLabel || !iosSwitchInput || !document.body.contains(iosSwitchLabel)) {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.position = 'fixed';
      label.style.top = '0';
      label.style.left = '0';
      label.style.width = '1px';
      label.style.height = '1px';
      label.style.opacity = '0';
      label.style.pointerEvents = 'none';
      label.style.overflow = 'hidden';
      label.style.margin = '0';
      label.style.padding = '0';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.tabIndex = -1;
      input.setAttribute('switch', '');
      input.setAttribute('aria-hidden', 'true');
      input.style.fontSize = '16px';

      label.appendChild(input);
      document.body.appendChild(label);
      iosSwitchLabel = label;
      iosSwitchInput = input;
    }

    iosSwitchLabel.click();
  } catch {
    // Ignore on unsupported browsers
  }
}

export function isHapticsSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return typeof navigator.vibrate === 'function' || isAppleTouchDevice();
}

export function triggerHaptic(pattern: HapticPattern = 'tap'): void {
  if (!hapticsEnabled) return;
  if (typeof navigator === 'undefined') return;

  try {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERNS[pattern]);
      return;
    }

    // Fallback for iOS 17.4+/18+ Safari Taptic Engine via native switch control
    if (isAppleTouchDevice()) {
      triggerIOSSafariTaptic();
    }
  } catch {
    // Ignore haptic errors in restricted contexts or before user gesture
  }
}
