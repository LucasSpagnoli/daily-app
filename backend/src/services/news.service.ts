import { firstValueFrom } from "rxjs";
import { XMLParser } from 'fast-xml-parser';
import { summaryFormatter } from '../utils/summaryFormatter';
import { News } from "src/types/news";
import "dotenv/config";
import { HttpService } from "@nestjs/axios";
import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";

@Injectable()
export class NewsService {
    private readonly logger = new Logger(NewsService.name);
    private extractImageUrl(html: string): string | null {
        const match = html.match(/<img[^>]+src="([^"]+)"/i);
        return match ? match[1].replace(/&amp;/g, "&") : null;
    }
    constructor(
        private httpService: HttpService,
    ) { }

    private infomoneyurl = 'https://www.infomoney.com.br/feed/';
    private g1url = 'https://g1.globo.com/rss/g1/economia/';

    async getRssNews(url: string, source: string): Promise<News[]> {
        try {
            const { data } = await firstValueFrom(this.httpService.get<string>(url));
            const parser = new XMLParser();
            const json = parser.parse(data)
            const items = json.rss.channel.item
            return items.map((item: any) => ({
                title: item.title,
                source,
                url: item.link,
                summary: summaryFormatter(item.description),
                imageUrl: this.extractImageUrl(item.description),
            }));
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Falha ao interceptar feed RSS do G1: ${err.message}\n`, err.stack);
            throw new InternalServerErrorException("Serviço de notícias indisponível no momento.");
        }
    }

    async getParsedNews(): Promise<News[]> {
        try {
            const infomoneyNews = await this.getRssNews(this.infomoneyurl, "InfoMoney");
            // const g1News = await this.getRssNews(this.g1url, "G1");
            // return [...infomoneyNews, ...g1News];
            return [...infomoneyNews];
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Erro ao analisar (parse) o XML das notícias: ${err.message}\n`, err.stack);
            throw new InternalServerErrorException("Inviável processar as notícias recebidas.");
        }
    }
}