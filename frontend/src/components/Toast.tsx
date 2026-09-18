import React, { createContext, useCallback, useContext, useRef, useState } from "react";

interface ToastItem {
  id: number;
  message: string;
  tone?: "success" | "error";
}

interface ToastContextValue {
  showToast: (message: string, tone?: "success" | "error") => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const AUTO_DISMISS_MS = 3500;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, tone: "success" | "error" = "success") => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs w-[calc(100%-2rem)] sm:w-auto">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="opacity-0 animate-[fadeInUp_0.25s_ease-out_forwards] flex items-start gap-2 bg-white border border-black/10 shadow-lg px-3 py-2.5"
            style={{ borderLeft: `3px solid ${t.tone === "error" ? "#B91C1C" : "#D4AF37"}` }}
          >
            {t.tone !== "error" && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            <p className="text-xs font-sans text-black/80 leading-snug flex-1">{t.message}</p>
            <button onClick={() => dismiss(t.id)} aria-label="Fechar" className="cursor-pointer text-black/30 hover:text-black/60 shrink-0 leading-none text-sm">
              ×
            </button>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast deve ser usado dentro de um <ToastProvider>");
  return ctx;
}