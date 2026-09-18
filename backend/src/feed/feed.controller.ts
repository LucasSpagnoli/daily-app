import { Controller, Get, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/Guards/jwt.guard';
import { RolesGuard } from 'src/auth/Guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { FeedService } from './feed.service';
import { ClientsService } from 'src/clients/clients.service';
import type { RequestWithUser } from 'src/types/request-with-user';
import { NewsService } from 'src/services/news.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('user')
@Controller('feed')
export class FeedController {
    constructor(
        private readonly feedService: FeedService,
        private readonly newsService: NewsService,
        private readonly clientsService: ClientsService,
    ) { }

    @Get('news')
    async getNews() {
        return this.newsService.getParsedNews();
    }

    @Get('refresh')
    async refreshAllClientFeeds(@Req() req: RequestWithUser) {
        const clients = await this.clientsService.findAll(req.user.id);
        const results = await Promise.allSettled(
            clients.map(c => this.feedService.refreshFeed(c.id, 'client'))
        );
        return clients.map((client, i) => {
            const result = results[i];
            return {
                client_id: client.id,
                client_name: client.name,
                status: result.status,
                ...(result.status === 'fulfilled'
                    ? { feed: result.value }
                    : { error: (result.reason as Error)?.message ?? 'Erro desconhecido' }),
            };
        });
    }

    @Get('refresh/:client_id')
    async refreshClientFeed(@Req() req: RequestWithUser, @Param('client_id', ParseIntPipe) client_id: number) {
        await this.clientsService.findOne(client_id, req.user.id);
        return await this.feedService.refreshFeed(client_id, 'client');
    }

    @Get('summary/:client_id')
    async getFeedSummary(@Req() req: RequestWithUser, @Param('client_id', ParseIntPipe) client_id: number) {
        await this.clientsService.findOne(client_id, req.user.id);
        const summary = await this.feedService.getAISummary(client_id);
        return { summary }
    }

    @Get('/cache/:client_id')
    async getClientCacheFeed(@Req() req: RequestWithUser, @Param('client_id', ParseIntPipe) client_id: number) {
        return await this.feedService.getClientCacheFeed(client_id);
    }

    @Get()
    async getAllClientFeeds(@Req() req: RequestWithUser) {
        const clients = await this.clientsService.findAll(req.user.id);
        const results = await Promise.allSettled(
            clients.map(c => this.feedService.getFeed(c.id, 'client'))
        );
        return clients.map((client, i) => {
            const result = results[i];
            return {
                client_id: client.id,
                client_name: client.name,
                status: result.status,
                ...(result.status === 'fulfilled'
                    ? { feed: result.value }
                    : { error: (result.reason as Error)?.message ?? 'Erro desconhecido' }),
            };
        });
    }

    @Get(':client_id')
    async getClientFeed(@Req() req: RequestWithUser, @Param('client_id', ParseIntPipe) client_id: number) {
        await this.clientsService.findOne(client_id, req.user.id);
        return await this.feedService.getFeed(client_id, 'client');
    }


}