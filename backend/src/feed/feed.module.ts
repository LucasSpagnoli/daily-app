import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { HttpModule } from '@nestjs/axios'
import { AuthModule } from 'src/auth/auth.module';
import { CacheService } from 'src/services/cache.service';
import { AiService } from 'src/services/ai.service';
import { DatabaseModule } from 'src/database/database.module';
import { DatabaseService } from 'src/database/database.service';
import { ClientsService } from 'src/clients/clients.service';
import { PreferencesService } from 'src/preferences/preferences.service';
import { NewsService } from 'src/services/news.service';

@Module({
  imports: [HttpModule, AuthModule, DatabaseModule],
  controllers: [FeedController],
  providers: [FeedService, CacheService, NewsService, AiService, DatabaseService, ClientsService, PreferencesService]
})
export class FeedModule {

}
