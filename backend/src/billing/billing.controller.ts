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
  HttpCode,
  Logger,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from 'src/auth/Guards/jwt.guard';
import { RolesGuard } from 'src/auth/Guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import type { RequestWithUser } from 'src/types/request-with-user';

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
  @HttpCode(200)
  async handleWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-webhook-secret') webhookSecret?: string,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    // O body raw (string) é necessário para validação HMAC — configurado no main.ts
    const rawBody: string = (req as any).rawBody ?? JSON.stringify(req.body);
    const resolvedSecret =
      webhookSecret ||
      (req.query?.webhookSecret as string) ||
      (req.headers['x-secret'] as string);
    const resolvedSignature =
      signature ||
      (req.headers['x-signature'] as string) ||
      (req.headers['abacatepay-signature'] as string);

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
}
