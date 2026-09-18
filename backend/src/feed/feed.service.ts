import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { News } from "src/types/news";
import "dotenv/config";
import { CacheService } from 'src/services/cache.service';
import { AiService } from 'src/services/ai.service';
import { PreferencesService } from 'src/preferences/preferences.service';
import { FeedRole } from 'src/types/request-with-user';
import { FeedResponse } from 'src/types/feed-response';
import { NewsService } from 'src/services/news.service';

@Injectable()
export class FeedService {
    private readonly logger = new Logger(FeedService.name);

    constructor(
        private cacheService: CacheService,
        private newsService: NewsService,
        private aiService: AiService,
        private preferenceService: PreferencesService
    ) { }

    async refreshFeed(id: number, role: FeedRole): Promise<FeedResponse> {
        try {
            const generatedAt = new Date();
            const filteredNews = await this.getFilteredNews(id, role);
            const preferences = await this.preferenceService.getPreferencesById(id, role);

            return { generatedAt, interests: preferences, items: filteredNews };
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Infortúnio ao reciclar feed [ID: ${id}]: ${err.message}`, err.stack);
            throw new InternalServerErrorException("Não foi possível atualizar o feed no momento.");
        }
    }

    async getFeed(id: number, role: FeedRole): Promise<FeedResponse> {
        try {
            const cache = await this.cacheService.getCache(id, role);
            let filteredNews: News[];
            let generatedAt: Date;

            if (cache?.content_json) {
                generatedAt = cache.generatedAt;
                filteredNews = JSON.parse(JSON.stringify(cache.content_json));
            } else {
                generatedAt = new Date();
                filteredNews = await this.getFilteredNews(id, role);
            }

            const preferences = await this.preferenceService.getPreferencesById(id, role);
            return { generatedAt, interests: preferences, items: filteredNews };
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Falha ao resgatar feed [ID: ${id}, FeedRole: ${role}]: ${err.message}`, err.stack);
            throw new InternalServerErrorException("Inviável carregar o feed de notícias.");
        }
    }

    async getFilteredNews(id: number, role: FeedRole): Promise<News[]> {
        try {
            const news = await this.newsService.getParsedNews();
            const preferences = await this.preferenceService.getPreferencesById(id, role);

            const filteredNews = await this.aiService.aiFilter({ news, preferences });
            await this.cacheService.updateCache(id, role, filteredNews, null);

            return filteredNews;
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Erro no filtramento de notícias da IA [ID: ${id}]: ${err.message}\n`, err.stack);
            throw new InternalServerErrorException("Falha ao filtrar notícias mediante Inteligência Artificial.");
        }
    }

    async getAISummary(client_id: number): Promise<string> {
        try {
            const cache = await this.cacheService.getCache(client_id, 'client');
            if (cache?.summary) {
                return cache.summary;
            }
            const news = await this.getFeed(client_id, 'client')
            const summary = await this.aiService.aiSummary(news.items)
            await this.cacheService.updateCache(client_id, 'client', undefined, summary);
            return summary
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Erro no processamento do resumo pela IA [ID: ${client_id}]: ${err.message}\n`, err.stack);
            throw new InternalServerErrorException("Falha ao obter resumo das notícias filtradas mediante Inteligência Artificial.");
        }
    }

    async getClientCacheFeed(client_id: number): Promise<{ items: News[] }> {
        try {
            const cache = await this.cacheService.getCache(client_id, 'client');
            if (!cache) {
                return { items: [] }
            }
            return { items: JSON.parse(JSON.stringify(cache.content_json)) }
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Falha ao resgatar feed [ID: ${client_id}]: ${err.message}`, err.stack);
            throw new InternalServerErrorException("Inviável carregar o feed de notícias.");
        }
    }
}