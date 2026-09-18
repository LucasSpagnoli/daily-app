import { apiFetch } from "./apiClient";
import type { ClientFeedRefreshItem, FeedResponse, SummaryResponse } from "./types/feed.interfaces";

export async function getUserFeed(): Promise<FeedResponse> {
    return apiFetch<FeedResponse>("/feed", {
        method: "GET",
    });
}

export async function getClientSummary(client_id: number): Promise<SummaryResponse> {
    return apiFetch<SummaryResponse>(`/feed/summary/${client_id}`, {
        method: "GET",
    });
}

// não existe getClientFeed pois o feed do cliente só é gerado manualmente, para preservar tokens
export async function getClientCacheFeed(client_id: number): Promise<FeedResponse> {
    return apiFetch<FeedResponse>(`/feed/cache/${client_id}`, {
        method: "GET"
    })
}

export async function refreshAllClientFeeds(): Promise<ClientFeedRefreshItem[]> {
    return apiFetch<ClientFeedRefreshItem[]>("/feed/refresh", {
        method: "GET",
    });
}

export async function refreshUserFeed(): Promise<FeedResponse> {
    return apiFetch<FeedResponse>("/feed/refresh", {
        method: "GET",
    });
}

export async function refreshClientFeed(client_id: number): Promise<FeedResponse> {
    return apiFetch<FeedResponse>(`/feed/refresh/${client_id}`, {
        method: "GET",
    });
}