export type HapticPattern =
  | 'playPause'
  | 'skip'
  | 'longPress'
  | 'favorite'
  | 'tap'
  | 'selection'
  | 'dismiss';

// Tuned for physical ERM/LRA vibration motors on mobile devices (<=12ms often goes unfelt)
const PATTERNS: Record<HapticPattern, number | number[]> = {
  playPause: 28,
  skip: 24,
  longPress: [30, 40, 22],
  favorite: [18, 35, 24],
  tap: 18,
  selection: 14,
  dismiss: [24, 30],
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

export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

function ensureIOSSwitchElement(): boolean {
  if (typeof document === 'undefined') return false;
  if (!isAppleTouchDevice()) return false;
  if (!document.body) return false;

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
    // Keep non-zero opacity (>= 0.01) and non-clipped layout box so iOS 17.4+/18+
    // WebKit lays out the native switch control and fires Taptic Engine feedback.
    label.style.cssText =
      'position:fixed;bottom:0;right:0;width:4px;height:4px;opacity:0.01;overflow:hidden;margin:0;padding:0;user-select:none;-webkit-user-select:none;';

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

function triggerIOSSafariTaptic(): boolean {
  if (!ensureIOSSwitchElement() || !iosSwitchLabel || !iosSwitchInput) return false;
  try {
    iosSwitchLabel.click();
    if (document.activeElement === iosSwitchInput) {
      iosSwitchInput.blur();
    }
    return true;
  } catch {
    return false;
  }
}

export function isHapticsSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return typeof navigator.vibrate === 'function' || isAppleTouchDevice();
}

export interface HapticDiagnosticResult {
  triggered: boolean;
  platform: 'android-vibrate' | 'ios-taptic' | 'vibrate-api' | 'unsupported';
  reason?: string;
}

export function triggerHaptic(pattern: HapticPattern = 'tap'): boolean {
  if (!hapticsEnabled) return false;
  if (typeof navigator === 'undefined') return false;

  try {
    if (typeof navigator.vibrate === 'function') {
      const ok = navigator.vibrate(PATTERNS[pattern]);
      if (ok) return true;
    }

    // iOS Safari & Home Screen PWAs block navigator.vibrate; use native Taptic switch (iOS 17.4+/18+)
    if (isAppleTouchDevice()) {
      return triggerIOSSafariTaptic();
    }
  } catch {
    // Ignore haptic errors in restricted contexts or before user gesture
  }
  return false;
}

export function testHapticFeedback(): HapticDiagnosticResult {
  if (typeof navigator === 'undefined') {
    return { triggered: false, platform: 'unsupported', reason: 'Browser environment unavailable' };
  }

  if (typeof navigator.vibrate === 'function') {
    try {
      const ok = navigator.vibrate([30, 45, 30]);
      if (ok) {
        return {
          triggered: true,
          platform: isAndroidDevice() ? 'android-vibrate' : 'vibrate-api',
        };
      }
      return {
        triggered: false,
        platform: isAndroidDevice() ? 'android-vibrate' : 'vibrate-api',
        reason:
          'Browser or OS blocked vibration (check Android Touch Vibration, Battery Saver, or desktop hardware).',
      };
    } catch {
      return {
        triggered: false,
        platform: 'vibrate-api',
        reason: 'Vibration API blocked in this browser context.',
      };
    }
  }

  if (isAppleTouchDevice()) {
    const fired = triggerIOSSafariTaptic();
    return {
      triggered: fired,
      platform: 'ios-taptic',
      reason: fired
        ? undefined
        : 'iOS requires iOS 17.4+ with System Haptics enabled in iPhone Settings.',
    };
  }

  return {
    triggered: false,
    platform: 'unsupported',
    reason: 'This device/browser does not expose vibration hardware to web apps.',
  };
}
