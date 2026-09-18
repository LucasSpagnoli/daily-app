import React from "react";
import type { ClientSectionProps } from "../api/types/client.interfaces";
import { useFeed } from "../api/lib/useFeed";
import useClientSummary from "../api/lib/useClientSummary";
import { ClientNews } from "./ClientNews";
import { decodeHtml } from "../utils/decodeHtml";
import { useSentItems } from "../api/lib/useSentItem";
import { useToast } from "./Toast";

export const ClientSection: React.FC<ClientSectionProps> = ({ client, index, total }) => {
    const { feed, loading: feedLoading, refreshing: feedRefreshing, refresh } = useFeed(client.client_id);
    const { summaryLoading, sendSummary, sendSummaryLoading, error } = useClientSummary(client, feed, refresh);
    const { sentMap, markSent, markManySent } = useSentItems(client.client_id);
    const { showToast } = useToast()
    const busy = sendSummaryLoading || summaryLoading || feedLoading || feedRefreshing;

    const handleSendSingle = (item: any) => {
        const alreadySentAt = sentMap[item.url];
        if (alreadySentAt) {
            const time = new Date(alreadySentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
            const confirmResend = window.confirm(
                `Esta notícia já foi enviada para ${client.name} às ${time}. Deseja enviar novamente?`
            );
            if (!confirmResend) return;
        }

        const phone = client.number.replace(/\D/g, "");
        const prefix = phone.startsWith("55") ? phone : `55${phone}`;

        const message = encodeURIComponent(`*${decodeHtml(item.title)}*\n\nLeia mais na íntegra: ${item.url}`);
        window.open(`https://wa.me/${prefix}?text=${message}`, "_blank", "noopener,noreferrer");

        markSent(item.url);
        showToast(`Notícia enviada para ${client.name}`);
    };

    const handleSendSummary = async () => {
        try {
            await sendSummary();
            if (feed?.items?.length) {
                markManySent(feed.items.map((i: any) => i.url));
            }
            showToast(`Resumo enviado para ${client.name}`);
        } catch {
            // erro já é exposto via `error` abaixo
        }
    };

    return (
        <section className="flex-1 w-full border border-black/10 bg-white p-4 flex flex-col hover:border-[#D4AF37] transition-colors duration-300">

            {typeof index === "number" && typeof total === "number" && (
                <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-black/30 mb-2 block">
                    Registro {String(index + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}
                </span>
            )}

            <div className="flex flex-col flex-1 gap-2">
                <header className="flex items-center justify-between gap-3 sm:gap-4 border-b border-black/5 pb-2">
                    <h2 className="text-lg sm:text-xl font-serif font-light text-black tracking-tight truncate flex-1">
                        {client.name}
                    </h2>

                    <button
                        onClick={refresh}
                        disabled={busy}
                        className="shrink-0 cursor-pointer px-1 py-1 text-black/35 text-[9px] font-medium uppercase tracking-[0.15em] hover:text-[#D4AF37] transition-colors duration-300 disabled:opacity-40 disabled:cursor-not-allowed">
                        {feedRefreshing ? "Gerando..." : "Gerar Feed"}
                    </button>
                </header>

                {error && (
                    <p role="alert" className="text-xs text-red-700 border-l-2 border-red-700 pl-3">
                        {error}
                    </p>
                )}

                <div className="relative w-full flex-1 flex flex-col mb-4">
                    <ClientNews items={feed?.items} loading={feedLoading} onSendSingle={handleSendSingle} sentMap={sentMap} />
                </div>
            </div>

            <button
                onClick={handleSendSummary}
                disabled={busy}
                className="mt-auto pt-4 w-full cursor-pointer px-4 sm:px-5 py-2.5 sm:py-2 bg-black text-white text-[10px] font-medium uppercase tracking-[0.15em] hover:border-[#D4AF37] hover:text-[#D4AF37] hover:scale-98 transition-all duration-300 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed">
                {sendSummaryLoading || summaryLoading ? "Processando..." : "Enviar Resumo"}
            </button>
        </section>
    );
};