import { useState, useCallback } from "react";

export interface UseCarouselReturn {
  currentIndex: number;
  goTo: (idx: number) => void;
  goPrev: () => void;
  goNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function useCarousel(total: number): UseCarouselReturn {
  const [currentIndex, setCurrentIndex] = useState(0);

  const goTo = useCallback(
    (idx: number) => setCurrentIndex(Math.max(0, Math.min(idx, total - 1))),
    [total]
  );

  const goPrev = useCallback(() => goTo(currentIndex - 1), [goTo, currentIndex]);
  const goNext = useCallback(() => goTo(currentIndex + 1), [goTo, currentIndex]);

  return {
    currentIndex,
    goTo,
    goPrev,
    goNext,
    hasPrev: currentIndex > 0,
    hasNext: currentIndex < total - 1,
  };
}
