import { useState, useCallback, useEffect } from "react";

type SentMap = Record<string, string>; // chave: url da notícia | valor: timestamp ISO

const STORAGE_PREFIX = "sent_items_";

function loadSentMap(clientId: number): SentMap {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + clientId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSentMap(clientId: number, map: SentMap) {
  try {
    localStorage.setItem(STORAGE_PREFIX + clientId, JSON.stringify(map));
  } catch {
    // localStorage indisponível (modo privado, quota cheia etc.) — falha silenciosa,
    // o app continua funcionando, só sem persistir entre sessões
  }
}

export function useSentItems(clientId: number) {
  const [sentMap, setSentMap] = useState<SentMap>(() => loadSentMap(clientId));

  // Recarrega o mapa sempre que o cliente ativo mudar
  useEffect(() => {
    setSentMap(loadSentMap(clientId));
  }, [clientId]);

  const markSent = useCallback(
    (itemKey: string, when: Date = new Date()) => {
      setSentMap((prev) => {
        const next = { ...prev, [itemKey]: when.toISOString() };
        saveSentMap(clientId, next);
        return next;
      });
    },
    [clientId]
  );

  const markManySent = useCallback(
    (itemKeys: string[], when: Date = new Date()) => {
      setSentMap((prev) => {
        const next = { ...prev };
        itemKeys.forEach((k) => (next[k] = when.toISOString()));
        saveSentMap(clientId, next);
        return next;
      });
    },
    [clientId]
  );

  return { sentMap, markSent, markManySent };
}