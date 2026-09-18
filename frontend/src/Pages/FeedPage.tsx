import React, { useRef, useState } from "react";
import Header from "../components/Header";
import { ClientSection } from "../components/ClientSection";
import { GetAllFeedButton } from "../components/GetAllFeedButton";
import { useClient } from "../api/lib/useClient";
import { useCarousel } from "../utils/Carousel";
import { useScreenControl } from "../utils/ScreenControl";

const DOTS_THRESHOLD = 8; // acima disso, some com os dots e mantém só o seletor com busca

export const FeedPage: React.FC = () => {
  const { clients, loading } = useClient();
  const { currentIndex, goTo, goPrev, goNext, hasPrev, hasNext } = useCarousel(clients.length);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const switcherRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const currentClient = clients[currentIndex];
  const { handleTouchStart, handleTouchEnd } = useScreenControl({ switcherRef, setSwitcherOpen, hasPrev, hasNext, goPrev, goNext, });

  // Foca o input de busca ao abrir o switcher e limpa ao fechar
  React.useEffect(() => {
    if (switcherOpen) {
      searchInputRef.current?.focus();
    } else {
      setSearch("");
    }
  }, [switcherOpen]);

  const filteredClients = clients
    .map((c, idx) => ({ ...c, _idx: idx }))
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen w-full bg-white flex flex-col font-sans relative md:pt-10 pt-15">
      <Header />

      <main className="flex-1 pt-6">
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
              {/* ── Barra Superior de Ações (Seletor & Gerar Feed) ── componentizar */}
              <div className="w-full flex items-center justify-between gap-3 mb-3">
                {clients.length > 1 ? (
                  <div ref={switcherRef} className="relative flex-1">
                    <button
                      onClick={() => setSwitcherOpen((o) => !o)}
                      className="cursor-pointer w-full flex items-center justify-between gap-2 px-3 py-2 border border-black/10 bg-black/[0.02] hover:border-[#D4AF37] transition-colors duration-200 text-left"
                    >
                      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-black/40 shrink-0">
                        {String(currentIndex + 1).padStart(2, "0")}/{String(clients.length).padStart(2, "0")}
                      </span>
                      <span className="text-sm font-serif text-black truncate flex-1 text-right">
                        {currentClient?.name}
                      </span>
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        className={`shrink-0 text-black/30 transition-transform duration-200 ${switcherOpen ? "rotate-180" : ""
                          }`}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>

                    {switcherOpen && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 border border-black/10 bg-white shadow-lg max-h-72 flex flex-col">
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Buscar cliente..."
                          className="w-full px-3 py-2 text-sm border-b border-black/10 outline-none font-sans placeholder:text-black/30"
                        />
                        <div className="overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-black/10">
                          {filteredClients.length > 0 ? (
                            filteredClients.map((c) => (
                              <button
                                key={c.client_id}
                                onClick={() => {
                                  goTo(c._idx);
                                  setSwitcherOpen(false);
                                }}
                                className={`cursor-pointer w-full text-left px-3 py-2 text-sm font-serif hover:bg-[#D4AF37]/10 transition-colors duration-150 ${c._idx === currentIndex ? "bg-black/5 text-[#D4AF37]" : "text-black"
                                  }`}
                              >
                                {c.name}
                              </button>
                            ))
                          ) : (
                            <p className="px-3 py-4 text-xs text-black/40 italic font-serif text-center">
                              Nenhum cliente encontrado.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1">
                    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-black/40">
                      Cliente: <span className="font-serif text-sm text-black">{currentClient?.name}</span>
                    </span>
                  </div>
                )}

                <GetAllFeedButton onFeedGenerated={() => setRefreshKey((k) => k + 1)} />
              </div>

              {/* ── Card ── */}
              <div
                key={`${clients[currentIndex].client_id}-${refreshKey}`}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                className="w-full opacity-0 animate-[fadeInUp_0.35s_ease-out_forwards]">
                <ClientSection
                  client={clients[currentIndex]}
                  index={currentIndex}
                  total={clients.length}
                />
              </div>

              {/* ── Navigation + Dots ── */}
              {clients.length > 1 && (
                <div className="flex items-center justify-center gap-5 mt-2">
                  {/* Prev */}
                  <button
                    onClick={goPrev}
                    disabled={!hasPrev}
                    aria-label="Cliente anterior"
                    className="cursor-pointer w-5 h-5 flex items-center justify-center border border-black/15 text-black/40 hover:border-[#D4AF37] hover:text-[#D4AF37] transition-colors duration-200 disabled:opacity-20 disabled:cursor-not-allowed">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>

                  {/* Dots — só para poucos clientes; acima disso o seletor de busca já resolve */}
                  {clients.length <= DOTS_THRESHOLD && (
                    <div className="flex items-center gap-2">
                      {clients.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => goTo(idx)}
                          aria-label={`Ir para cliente ${idx + 1}`}
                          className={`cursor-pointer rounded-full transition-all duration-300 ${idx === currentIndex
                            ? "w-2 h-1 bg-[#D4AF37]"
                            : "w-1 h-1 bg-black/15 hover:bg-black/30"
                            }`}
                        />
                      ))}
                    </div>
                  )}

                  {/* Next */}
                  <button
                    onClick={goNext}
                    disabled={!hasNext}
                    aria-label="Próximo cliente"
                    className="cursor-pointer w-5 h-5 flex items-center justify-center border border-black/15 text-black/40 hover:border-[#D4AF37] hover:text-[#D4AF37] transition-colors duration-200 disabled:opacity-20 disabled:cursor-not-allowed">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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