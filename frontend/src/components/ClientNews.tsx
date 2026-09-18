import React from "react";
import { decodeHtml } from "../utils/decodeHtml";
import type { ClientNewsProps } from "../api/types/feed.interfaces";
import { formatSentTime } from "../utils/formatSentTime";

export const ClientNews: React.FC<ClientNewsProps> = ({ items, loading, onSendSingle, sentMap }) => {
    const itemCount = items?.length ?? 0;

    if (loading && itemCount === 0) {
        return (
            <div className="border border-dashed border-black/15 flex items-center justify-center bg-black/5 w-full h-60 md:h-75">
                <p className="text-[10px] uppercase tracking-[0.2em] text-black/40 animate-pulse">
                    Buscando...
                </p>
            </div>
        );
    }

    if (itemCount === 0) {
        return (
            <div className="border border-dashed border-black/15 flex flex-col items-center justify-center gap-2 bg-black/5 w-full h-60 md:h-75 p-4">
                <p className="text-xs text-black/40 italic font-serif text-center">
                    Nenhuma matéria.
                </p>
            </div>
        );
    }

    return (
        <div className="relative flex-1 min-h-0">
            <div className="flex flex-col max-h-60 md:max-h-75 h-full gap-3 overflow-y-auto pt-1 pb-4 snap-y snap-mandatory pr-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-black/10 hover:[&::-webkit-scrollbar-thumb]:bg-[#D4AF37]">
                {items!.map((item, idx) => {
                    const sentAt = sentMap?.[item.url];
                    const isSent = Boolean(sentAt);
                    
                    return (
                    <div
                        key={idx}
                        className={`snap-start shrink-0 w-full min-h-20 border p-3 flex flex-col justify-between transition-all duration-200 group relative ${
                                isSent
                                    ? "border-black/5 bg-black/[0.015] opacity-60"
                                    : "border-black/10 bg-black/2 hover:border-[#D4AF37] hover:-translate-y-0.5"
                            }`}>

                        <button
                                onClick={() => onSendSingle?.(item)}
                                title={isSent ? `Já enviado às ${formatSentTime(sentAt!)} — clique para reenviar` : "Enviar apenas esta matéria"}
                                className={`absolute top-2 right-2 p-1 bg-white/90 backdrop-blur-sm border transition-all duration-200 z-10 cursor-pointer ${
                                    isSent
                                        ? "border-black/10 text-[#5B8266] opacity-100"
                                        : "border-black/10 text-black/50 opacity-100 md:opacity-70 group-hover:opacity-100 hover:text-black hover:border-[#D4AF37]"
                                }`}>
                                {isSent ? (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                ) : (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="22" y1="2" x2="11" y2="13"></line>
                                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                                    </svg>
                                )}
                            </button>

                         <div className="flex items-center justify-between gap-2 mb-2 pr-6">
                           <span className="text-[9px] uppercase tracking-[0.15em] text-[#D4AF37] block truncate">
                               {item.source}
                           </span>
                           <span className="font-mono text-[9px] text-black/25 shrink-0">
                               {String(idx + 1).padStart(2, "0")}
                           </span>
                         </div>

                        <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-serif text-black leading-snug group-hover:text-[#D4AF37] transition-colors line-clamp-3 cursor-pointer outline-none">
                            {decodeHtml(item.title)}
                        </a>
                        {isSent && (
                            <span className="mt-1.5 flex items-center gap-1 text-[9px] font-mono text-black/35">
                               <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                   <polyline points="20 6 9 17 4 12" />
                               </svg>
                               Enviado às {formatSentTime(sentAt!)}
                            </span>
                        )}
                    </div>
                )
                })}
            </div>

            {itemCount > 2 && (
                <div className="pointer-events-none absolute bottom-0 left-0 right-2 h-10 bg-linear-to-t from-white to-transparent" />
            )}
        </div>
    );
};
