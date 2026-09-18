import React from "react";
import type { ClientNewsProps } from "../api/types/feed.interfaces";
import { New } from "./New";

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
            <div className="flex flex-col max-h-60 md:max-h-75 h-67 gap-3 overflow-y-auto pt-1 pb-4 snap-y snap-mandatory pr-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-black/10 hover:[&::-webkit-scrollbar-thumb]:bg-[#D4AF37]">
                {items?.map((item, idx) => (
                    <New
                        key={item.url || idx}
                        item={item}
                        idx={idx}
                        sentAt={sentMap?.[item.url]}
                        onSendSingle={onSendSingle}
                    />
                ))}
            </div>

            {itemCount > 2 && (
                <div className="pointer-events-none absolute bottom-0 left-0 right-2 h-10 bg-linear-to-t from-white to-transparent" />
            )}
        </div>
    );
};
