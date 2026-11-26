import { useCallback, useRef } from 'react';
import { triggerHaptic } from '../utils/haptics';

interface UseLongPressOptions {
  delay?: number;
  moveThreshold?: number;
  onLongPress: () => void;
  onClick?: () => void;
}

export function useLongPress({
  delay = 450,
  moveThreshold = 10,
  onLongPress,
  onClick,
}: UseLongPressOptions) {
  const timerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      longPressedRef.current = false;
      startPosRef.current = { x: e.clientX, y: e.clientY };
      clearTimer();

      timerRef.current = window.setTimeout(() => {
        longPressedRef.current = true;
        triggerHaptic('longPress');
        onLongPress();
      }, delay);
    },
    [clearTimer, delay, onLongPress]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startPosRef.current || timerRef.current === null) return;
      const dx = Math.abs(e.clientX - startPosRef.current.x);
      const dy = Math.abs(e.clientY - startPosRef.current.y);
      if (dx > moveThreshold || dy > moveThreshold) {
        clearTimer();
      }
    },
    [clearTimer, moveThreshold]
  );

  const onPointerUp = useCallback(() => {
    clearTimer();
    if (longPressedRef.current) {
      window.setTimeout(() => {
        longPressedRef.current = false;
      }, 120);
    }
  }, [clearTimer]);

  const onPointerCancel = useCallback(() => {
    clearTimer();
    longPressedRef.current = false;
  }, [clearTimer]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (longPressedRef.current) {
        e.preventDefault();
        e.stopPropagation();
        longPressedRef.current = false;
        return;
      }
      onClick?.();
    },
    [onClick]
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Prevent native context menu on touch long-press and open app action sheet
      if (e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType !== 'mouse') {
        e.preventDefault();
      }
    },
    []
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave: onPointerCancel,
    onClick: handleClick,
    onContextMenu,
  };
}
