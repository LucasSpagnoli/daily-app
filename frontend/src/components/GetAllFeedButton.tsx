import React, { useState } from "react";
import { refreshAllClientFeeds } from "../api/feed";
import { useToast } from "./Toast";

interface GenerateFeedButtonProps {
    onFeedGenerated?: () => void;
    disabled?: boolean;
    className?: string;
}

export const GetAllFeedButton: React.FC<GenerateFeedButtonProps> = ({
    onFeedGenerated,
    disabled = false,
    className = "",
}) => {
    const [generating, setGenerating] = useState(false);
    const { showToast } = useToast();

    const handleGenerate = async () => {
        if (generating || disabled) return;

        setGenerating(true);
        try {
            const results = await refreshAllClientFeeds();
            const failures = results.filter((r) => r.status === "rejected");

            if (failures.length === 0) {
                showToast("Feed de todos os clientes gerado com sucesso!");
            } else if (failures.length < results.length) {
                showToast(`Feeds gerados com ${failures.length} aviso(s).`, "success");
            } else {
                showToast("Falha ao gerar os feeds dos clientes.", "error");
            }

            onFeedGenerated?.();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Erro ao gerar feeds.";
            showToast(message, "error");
        } finally {
            setGenerating(false);
        }
    };

    return (
        <button
            onClick={handleGenerate}
            disabled={generating || disabled}
            aria-label="Gerar feed de notícias"
            className={`cursor-pointer px-4 py-2 border border-black/15 bg-black text-white text-[10px] font-medium uppercase tracking-[0.15em] hover:bg-[#D4AF37] hover:text-black hover:border-[#D4AF37] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0 ${className}`}
        >
            {generating ? (
                <>
                    <svg
                        className="animate-spin h-3 w-3 text-current"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v8H4z"
                        />
                    </svg>
                    <span>Gerando...</span>
                </>
            ) : (
                <>
                    <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                    </svg>
                    <span>Gerar Feed</span>
                </>
            )}
        </button>
    );
};

export default GetAllFeedButton;
