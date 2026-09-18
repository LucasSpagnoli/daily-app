import React from "react";
import Header from "../components/Header";
import { ClientSection } from "../components/ClientSection";
import { useClient } from "../api/lib/useClient";
import { useCarousel } from "../utils/Carousel";

export const FeedPage: React.FC = () => {
  const { clients, loading } = useClient();
  const { currentIndex, goTo, goPrev, goNext, hasPrev, hasNext } = useCarousel(clients.length);

  return (
    <div className="min-h-screen w-full bg-white flex flex-col font-sans relative md:pt-10 pt-15">
      <Header />

      <main className="flex-1 pt-7 pb-12">
        <div className="max-w-2xl w-full mx-auto px-4 sm:px-6 flex flex-col items-center">

          {loading ? (
            /* ── Skeleton ── */
            <div className="w-full border border-black/10 p-6 sm:p-8 flex flex-col gap-6 animate-pulse min-h-[520px]">
              <div className="flex justify-between items-end border-b border-black/5 pb-4">
                <div className="h-6 w-2/3 bg-black/10 rounded-sm" />
                <div className="h-4 w-16 bg-black/6 rounded-sm" />
              </div>
              <div className="flex-1 w-full bg-black/5 rounded-sm" />
            </div>

          ) : clients.length > 0 ? (
            <>
              {/* ── Card ── */}
              <div
                key={clients[currentIndex].client_id}
                className="w-full opacity-0 animate-[fadeInUp_0.35s_ease-out_forwards]"
              >
                <ClientSection
                  client={clients[currentIndex]}
                  index={currentIndex}
                  total={clients.length}
                />
              </div>

              {/* ── Navigation + Dots ── */}
              {clients.length > 1 && (
                <div className="flex items-center justify-center gap-5 mt-6">
                  {/* Prev */}
                  <button
                    onClick={goPrev}
                    disabled={!hasPrev}
                    aria-label="Cliente anterior"
                    className="cursor-pointer w-8 h-8 flex items-center justify-center border border-black/15 text-black/40 hover:border-[#D4AF37] hover:text-[#D4AF37] transition-colors duration-200 disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>

                  {/* Dots */}
                  <div className="flex items-center gap-2">
                    {clients.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => goTo(idx)}
                        aria-label={`Ir para cliente ${idx + 1}`}
                        className={`cursor-pointer rounded-full transition-all duration-300 ${
                          idx === currentIndex
                            ? "w-4 h-2 bg-[#D4AF37]"
                            : "w-2 h-2 bg-black/15 hover:bg-black/30"
                        }`}
                      />
                    ))}
                  </div>

                  {/* Next */}
                  <button
                    onClick={goNext}
                    disabled={!hasNext}
                    aria-label="Próximo cliente"
                    className="cursor-pointer w-8 h-8 flex items-center justify-center border border-black/15 text-black/40 hover:border-[#D4AF37] hover:text-[#D4AF37] transition-colors duration-200 disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                </div>
              )}
            </>

          ) : (
            /* ── Empty state ── */
            <div className="w-full border-y border-black/10 py-16 sm:py-24 flex flex-col items-center gap-4">
              <div className="w-8 h-px bg-[#D4AF37]" />
              <p className="text-sm sm:text-base text-black/50 italic font-serif text-center px-4 max-w-sm">
                Nenhum cliente cadastrado ainda. Assim que você adicionar um, o feed de notícias aparece aqui.
              </p>
            </div>
          )}

        </div>
      </main>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>
    </div>
  );
};