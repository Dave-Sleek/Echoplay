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

const SWITCH_ID = 'echoplay-taptic-switch';

let hapticsEnabled = true;
let iosSwitchLabel: HTMLLabelElement | null = null;
let iosSwitchInput: HTMLInputElement | null = null;

export function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function ensureIOSSwitchElement(): boolean {
  if (typeof document === 'undefined') return false;
  if (!isAppleTouchDevice()) return false;

  if (!document.body) {
    return false;
  }

  if (iosSwitchLabel && iosSwitchInput && document.body.contains(iosSwitchLabel)) {
    return true;
  }

  const existingInput = document.getElementById(SWITCH_ID) as HTMLInputElement | null;
  if (existingInput && existingInput.parentElement instanceof HTMLLabelElement) {
    iosSwitchInput = existingInput;
    iosSwitchLabel = existingInput.parentElement;
    return true;
  }

  try {
    const label = document.createElement('label');
    label.htmlFor = SWITCH_ID;
    label.setAttribute('aria-hidden', 'true');
    // Must stay mounted in the viewport with non-zero opacity & size and without
    // pointer-events: none so iOS WebKit lays out the native switch and fires Taptic feedback.
    label.style.cssText =
      'position:fixed;top:0;left:0;width:2px;height:2px;opacity:0.001;overflow:hidden;z-index:-1;margin:0;padding:0;user-select:none;-webkit-user-select:none;';

    const input = document.createElement('input');
    input.id = SWITCH_ID;
    input.type = 'checkbox';
    input.tabIndex = -1;
    input.setAttribute('switch', '');
    input.setAttribute('aria-hidden', 'true');
    input.style.cssText = 'font-size:16px;margin:0;';

    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitchLabel = label;
    iosSwitchInput = input;
    return true;
  } catch {
    return false;
  }
}

// Pre-mount the native iOS switch element early so WebKit has it in the layout tree
// BEFORE the user's first tap (dynamically inserting on the same tick often skips haptics).
if (typeof document !== 'undefined' && isAppleTouchDevice()) {
  if (document.body) {
    ensureIOSSwitchElement();
  } else {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        ensureIOSSwitchElement();
      },
      { once: true }
    );
  }
}

export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
  if (enabled) {
    ensureIOSSwitchElement();
  }
}

function triggerIOSSafariTaptic(): void {
  if (!ensureIOSSwitchElement() || !iosSwitchLabel || !iosSwitchInput) return;
  try {
    iosSwitchLabel.click();
    if (document.activeElement === iosSwitchInput) {
      iosSwitchInput.blur();
    }
  } catch {
    // Ignore on unsupported iOS WebKit versions
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
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERNS[pattern]);
      return;
    }

    // iOS Safari & Home Screen PWAs block navigator.vibrate; use native Taptic switch (iOS 17.4+/18+)
    if (isAppleTouchDevice()) {
      triggerIOSSafariTaptic();
    }
  } catch {
    // Ignore haptic errors in restricted contexts or before user gesture
  }
}
