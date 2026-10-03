import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Req,
  Res,
  Headers,
  Logger,
  UseGuards,
  ParseIntPipe,
  ValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from 'src/auth/Guards/jwt.guard';
import { RolesGuard } from 'src/auth/Guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import type { RequestWithUser } from 'src/types/request-with-user';
import { CancelSubscriptionDTO } from 'src/types/cancel-subscription.dto';

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(private readonly billingService: BillingService) {}

  /**
   * POST /billing/webhook/abacatepay
   *
   * Rota pública (sem JwtAuthGuard).
   * A AbacatePay envia eventos de assinatura aqui.
   * Responde sempre 200 para evitar reenvios desnecessários;
   * erros reais são tratados internamente.
   */
  
  @Post('webhook/abacatepay')
  async handleWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-webhook-secret') webhookSecret?: string,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    // O body raw (string) é necessário para validação HMAC confiável
    let rawBody: string = (req as any).rawBody;
    if (!rawBody) {
      this.logger.warn(
        'req.rawBody não foi capturado no middleware; usando fallback JSON.stringify (não recomendado para HMAC).',
      );
      rawBody = JSON.stringify(req.body);
    }

    // AbacatePay envia o secret primariamente via query param (?webhookSecret=...)
    const resolvedSecret =
      (req.query?.webhookSecret as string) ||
      webhookSecret ||
      (req.headers['x-secret'] as string);

    // Tentativas de resolução da assinatura HMAC por diferentes cabeçalhos/query
    const resolvedSignature =
      signature ||
      (req.query?.signature as string) ||
      (req.headers['x-signature'] as string) ||
      (req.headers['abacatepay-signature'] as string) ||
      (req.headers['x-abacatepay-signature'] as string);

    try {
      await this.billingService.handleWebhookEvent(
        req.body,
        rawBody,
        resolvedSecret,
        resolvedSignature,
      );
      return res.status(200).json({ received: true });
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Webhook error: ${error.message}`, error.stack);
      // Retornar 200 mesmo em erro de processamento para evitar flood de reenvios.
      // Registrar o erro internamente é suficiente.
      return res.status(200).json({ received: true, warning: 'processing_error' });
    }
  }

  /**
   * GET /billing/me
   * Retorna os dados da assinatura do assessor logado (status, período, plano).
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMySubscription(@Req() req: RequestWithUser) {
    return this.billingService.getUserSubscription(req.user.id);
  }

  /**
   * GET /billing/admin/subscriptions
   * Lista todas as assinaturas do sistema com dados dos assessores.
   */
  @Get('admin/subscriptions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async listSubscriptions() {
    return this.billingService.listAllSubscriptions();
  }

  /**
   * PATCH /billing/admin/subscriptions/:userId/status
   * Permite que um administrador altere manualmente o status de uma assinatura.
   */
  @Patch('admin/subscriptions/:userId/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateSubscriptionStatus(
    @Param('userId', ParseIntPipe) userId: number,
    @Body('status') status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED',
  ) {
    return this.billingService.updateSubscriptionStatus(userId, status);
  }

  /**
   * POST /billing/cancel
   * Permite que o assessor cancele sua própria assinatura dentro do site.
   * Permite escolher entre:
   * - deleteDataImmediately = true: exclui dados de clientes/preferências na hora.
   * - deleteDataImmediately = false: mantém os dados preservados por 60 dias.
   */
  @Post('cancel')
  @UseGuards(JwtAuthGuard)
  async cancelSubscription(
    @Req() req: RequestWithUser,
    @Body(ValidationPipe) dto: CancelSubscriptionDTO,
  ) {
    return this.billingService.cancelSubscription(req.user.id, dto.deleteDataImmediately);
  }

  /**
   * POST /billing/cron/cleanup-data
   * Endpoint de manutenção (executado via cron job, ex: Vercel Cron):
   * 1. Envia e-mail de aviso 7 dias antes do término do prazo de 60 dias.
   * 2. Exclui definitivamente dados de contas com mais de 60 dias de cancelamento.
   */
  @Post('cron/cleanup-data')
  async runDataCleanupCron(@Headers('x-cron-secret') cronSecret?: string) {
    const expectedSecret = process.env.CRON_SECRET;
    if (expectedSecret && cronSecret !== expectedSecret) {
      throw new UnauthorizedException('Token de cron inválido.');
    }
    return this.billingService.checkAndProcessExpiredDataRetention();
  }
}
