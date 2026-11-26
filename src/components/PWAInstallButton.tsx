import React, { useState } from 'react';
import { Download, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { triggerHaptic } from '../utils/haptics';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, isIOSSafari, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => {
          triggerHaptic('tap');
          void install();
        }}
        className={`min-h-[44px] rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
          compact ? 'px-3.5 text-xs' : 'px-4 py-2.5 text-sm w-full sm:w-auto'
        }`}
      >
        <Download className="w-4 h-4" />
        Install App
      </button>
    );
  }

  if (isIOS || !compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap');
            setShowIOSGuide(true);
          }}
          className={`min-h-[44px] rounded-xl border border-black/12 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] text-zinc-900 dark:text-white font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
            compact ? 'px-3 text-xs' : 'px-4 py-2.5 text-sm w-full sm:w-auto'
          }`}
        >
          <Smartphone className="w-4 h-4 text-[var(--accent)]" />
          {isIOS ? 'Add to Home Screen' : 'iPhone Install Guide'}
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm"
            onClick={() => setShowIOSGuide(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div
              className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#171920] border-t sm:border border-black/10 dark:border-white/10 p-6 pb-[calc(24px+env(safe-area-inset-bottom,0px))] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto mb-3 sm:hidden" />

              <div className="flex items-center justify-between gap-3">
                <h3 id="ios-install-title" className="text-lg font-bold text-zinc-900 dark:text-white">
                  Install EchoPlay on iPhone
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {isIOS && !isIOSSafari && (
                <div className="mt-3 p-3 rounded-2xl bg-amber-500/12 border border-amber-500/25 text-xs text-amber-700 dark:text-amber-300">
                  It looks like you’re not using Safari. On iPhone, Home Screen PWA installation works best from Safari.
                </div>
              )}

              <ol className="mt-4 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    Open <strong>EchoPlay</strong> in <strong>Safari</strong> on your iPhone.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span className="flex items-center gap-1.5 flex-wrap">
                    Tap the <strong>Share</strong> button <Share className="w-4 h-4 inline text-[var(--accent)]" /> in Safari’s toolbar.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <span className="flex items-center gap-1.5 flex-wrap">
                    Scroll down and select <strong>Add to Home Screen</strong>{' '}
                    <PlusSquare className="w-4 h-4 inline text-zinc-400" />.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    4
                  </span>
                  <span>
                    Tap <strong>Add</strong> in the top right corner to launch EchoPlay full-screen offline.
                  </span>
                </li>
              </ol>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  setShowIOSGuide(false);
                }}
                className="mt-6 w-full min-h-[44px] rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
