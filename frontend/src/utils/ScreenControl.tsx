import { useEffect, useRef } from "react";

const SWIPE_THRESHOLD = 50; // px mínimos para considerar um swipe

interface UseScreenControlParams {
  switcherRef: React.RefObject<HTMLDivElement | null>;
  setSwitcherOpen: React.Dispatch<React.SetStateAction<boolean>>;
  hasPrev: boolean;
  hasNext: boolean;
  goPrev: () => void;
  goNext: () => void;
}

export interface UseScreenControlReturn {
  touchStartX: React.RefObject<number | null>;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
}

export function useScreenControl({
  switcherRef,
  setSwitcherOpen,
  hasPrev,
  hasNext,
  goPrev,
  goNext,
}: UseScreenControlParams): UseScreenControlReturn {
  const touchStartX = useRef<number | null>(null);

  // Fecha o switcher ao clicar fora dele
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [switcherRef, setSwitcherOpen]);

  // Navegação por teclado (← →), ignorando inputs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (isTyping) return;

      if (e.key === "ArrowLeft" && hasPrev) goPrev();
      if (e.key === "ArrowRight" && hasNext) goNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasPrev, hasNext, goPrev, goNext]);

  // Handlers de swipe (touch)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;

    if (deltaX > SWIPE_THRESHOLD && hasPrev) goPrev();
    else if (deltaX < -SWIPE_THRESHOLD && hasNext) goNext();

    touchStartX.current = null;
  };

  return { touchStartX, handleTouchStart, handleTouchEnd };
}
