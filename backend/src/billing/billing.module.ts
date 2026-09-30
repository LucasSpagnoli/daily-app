import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { DatabaseModule } from 'src/database/database.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
