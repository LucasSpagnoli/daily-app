import { HttpService } from '@nestjs/axios';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { AiChat } from "src/types/ai-chat";
import { firstValueFrom } from "rxjs";
import "dotenv/config";
import { filterPrompt, summaryPrompt } from 'src/utils/Prompts';
import { News } from 'src/types/news';

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private readonly model = 'gemini-2.5-flash';
    private readonly apiKey = process.env.GEMINI_API_KEY;
    private readonly url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`

    constructor(
        private httpService: HttpService,
    ) { }

    async aiFilter({ news, preferences }: AiChat): Promise<News[]> {
        const numberedTitles = news.map((n, i) => `${i + 1}. ${n.title}`).join('\n');

        const body = {
            contents: [{ parts: [{ text: `[INSTRUÇÕES] ${filterPrompt} [INTERESSES] ${JSON.stringify(preferences)} [NOTÍCIAS] ${numberedTitles}` }] }]
        };

        try {
            const data = await this.postWithRetry(this.url, body);
            const raw: string = data.candidates[0].content.parts[0].text.trim();

            this.logger.debug(`Resposta bruta do LLM de filter: ${raw}`);
            if (raw === '-1') return [];

            const indices = raw.split(' ').map(n => parseInt(n) - 1);
            return indices.map(i => news[i]);
        } catch (error: any) {
            const mensagem = error.response?.data?.error?.message ?? error.message;
            const status = error.response?.status;

            this.logger.error(`Status: ${status} \n Falha no filtro de notícias com Gemini: ${mensagem}\n`, error.stack);
            throw new InternalServerErrorException(`Inviável processar dados via IA no momento.`);
        }
    }

    async aiSummary(news: News[]) {
        const formattedNews = news.map(n => `Título: ${n.title} | Descrição: ${n.summary} | Fonte: ${n.url}`).join('\n');

        const body = {
            contents: [{ parts: [{ text: `[INSTRUÇÕES] ${summaryPrompt}\n[NOTÍCIAS]${formattedNews}\n[DATA DE HOJE]${new Date().toLocaleString()}` }] }]
        };

        try {
            const data = await this.postWithRetry(this.url, body)
            const raw: string = data.candidates[0].content.parts[0].text.trim();
            this.logger.debug(`Resposta bruta do LLM de summary: ${raw}`);
            return raw

        } catch (error: any) {
            const mensagem = error.response?.data?.error?.message ?? error.message;
            const status = error.response?.status;

            this.logger.error(`Status: ${status} \n Falha no resumo de notícias com Gemini: ${mensagem}\n`, error.stack);
            throw new InternalServerErrorException(`Inviável processar dados via IA no momento.`);
        }
    }

    private async postWithRetry(url: string, body: any, retries = 3) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const { data } = await firstValueFrom(
                    this.httpService.post(url, body, {
                        headers: { 'Content-Type': 'application/json' }
                    })
                );
                return data;
            } catch (error: any) {
                const status = error.response?.status;
                const isRateLimit = status === 429;

                if (!isRateLimit || attempt === retries) {
                    throw error;
                }

                const delay = Math.pow(2, attempt) * 1000;
                this.logger.warn(`Limitação de taxa (Rate Limit) atingida. Tentativa ${attempt + 1}/${retries}. Retardando execução em ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}