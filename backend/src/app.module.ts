import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { PreferencesModule } from './preferences/preferences.module';
import { FeedModule } from './feed/feed.module';
import { ClientsModule } from './clients/clients.module';
import { UsersModule } from './users/users.module';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [DatabaseModule, AuthModule, PreferencesModule, FeedModule, ClientsModule, UsersModule, BillingModule],
  controllers: [AppController],
  providers: [AppService],
})

export class AppModule {}


