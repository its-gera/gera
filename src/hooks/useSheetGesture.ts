import { useState, useRef, useCallback } from 'react';

/**
 * Handles slide-in entry animation, swipe-down to dismiss, and programmatic dismiss
 * for portal-rendered bottom sheets on mobile.
 *
 * Usage:
 *   const { dismissing, dismiss, handleTouchStart, handleTouchMove, handleTouchEnd, panelStyle }
 *     = useSheetGesture(onClose, panelRef);
 *
 * - Attach touch handlers to the panel element
 * - Apply panelStyle as inline style on the panel
 * - Add --dismissing modifier class when dismissing is true (on both overlay and panel)
 * - Replace onClose calls that represent "cancel" with dismiss()
 * - Swipe is only triggered when panel.scrollTop === 0 to avoid conflicts with scrollable content
 */
export function useSheetGesture(
  onClose: () => void,
  panelRef: React.RefObject<HTMLElement | null>,
) {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const touchStartY = useRef(0);
  const dragYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const dismissingRef = useRef(false);
  // Keep onClose stable across re-renders without adding it as a dep
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const dismiss = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    setDismissing(true);
    setTimeout(() => onCloseRef.current(), 280);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Don't intercept when the panel has been scrolled — let the scroll continue
    if ((panelRef.current?.scrollTop ?? 0) > 0) return;
    touchStartY.current = e.touches[0].clientY;
    isDraggingRef.current = true;
    setIsDragging(true);
  }, [panelRef]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) {
      dragYRef.current = dy;
      setDragY(dy);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    const dy = dragYRef.current;
    dragYRef.current = 0;
    if (dy > 80) {
      dismiss();
    } else {
      setDragY(0);
    }
  }, [dismiss]);

  const panelStyle: React.CSSProperties = dismissing
    ? {
        // Transition from whatever drag position the user left off at → off-screen.
        // Using inline transition (not CSS animation) so the start value is the
        // current rendered position rather than always starting from translateY(0).
        transform: 'translateY(100%)',
        transition: 'transform 280ms cubic-bezier(0.32, 0, 0.66, 0)',
      }
    : dragY > 0
    ? {
        transform: `translateY(${dragY}px)`,
        transition: isDragging ? 'none' : 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)',
      }
    : {};

  return { dismissing, dismiss, handleTouchStart, handleTouchMove, handleTouchEnd, panelStyle };
}
