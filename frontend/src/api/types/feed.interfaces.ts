export interface News {
    title: string;
    source: string;
    url: string;
    summary: string;
    imageUrl: string;
}

export interface FeedResponse {
    generatedAt: string;
    interests: string[];
    items: News[];
}

export interface SummaryResponse {
    summary: string
}

export interface UseFeedResult {
    feed: FeedResponse | null;
    loading: boolean;
    refreshing: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

export interface ClientNewsProps {
    items?: News[];
    loading: boolean;
    sentMap?: Record<string, string>;
    onSendSingle?: (item: any) => void
}

export interface NewProps {
    item: News;
    idx: number;
    sentAt?: string;
    onSendSingle?: (item: any) => void;
}

export interface ClientFeedRefreshItem {
    client_id: number;
    client_name: string;
    status: "fulfilled" | "rejected";
    feed?: FeedResponse;
    error?: string;
}

