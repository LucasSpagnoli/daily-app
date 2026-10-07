import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import { DatabaseService } from 'src/database/database.service';
import { NotificationsService } from 'src/notifications/notifications.service';

// ──────────────────────────────────────────────────────────────
// Tipos do payload AbacatePay (ajuste os nomes de evento conforme sua conta)
// ──────────────────────────────────────────────────────────────
interface AbacatepayWebhookPayload {
  id: string;              // 👈 ID do evento fica aqui agora
  event: string;
  apiVersion?: number;
  devMode?: boolean;
  data: {
    subscription?: {
      id?: string;
      status?: string;       // ACTIVE, etc.
      frequency?: string;    // MONTHLY
      amount?: number;
      createdAt?: string;
      updatedAt?: string;
      canceledAt?: string | null;
    };
    customer?: {
      id?: string;
      name?: string;
      email?: string;
    };
    checkout?: {
      id?: string;
      externalId?: string | null;
      status?: string;
    };
    payment?: {
      id?: string;
      status?: string;
    };
  };
}

// Eventos esperados — ajuste os strings exatos depois de testar no Dev Mode
const EVENTS = {
  SUBSCRIPTION_FIRST_PAYMENT: 'subscription.completed',   // primeiro ciclo pago → ativa
  SUBSCRIPTION_RENEWED: 'subscription.renewed',     // renovação paga
  SUBSCRIPTION_PAYMENT_FAILED: 'subscription.payment_failed',
  SUBSCRIPTION_CANCELLED: 'subscription.cancelled',
  SUBSCRIPTION_EXPIRED: 'subscription.expired',
} as const;

const SETUP_TOKEN_TTL_HOURS = 48;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) { }

  // ────────────────────────────────────────────────────────────
  // Entry point chamado pelo controller
  // ────────────────────────────────────────────────────────────

  async handleWebhookEvent(
    body: AbacatepayWebhookPayload,
    rawBody: string,
    webhookSecret: string,
    signature: string,
  ): Promise<void> {
    // 1. Validar webhook secret na query/header
    this.validateWebhookSecret(webhookSecret);

    // 2. Validar assinatura HMAC (se disponível)
    if (signature) {
      this.validateHmacSignature(rawBody, signature);
    }

    // 3. Ignorar eventos de devMode em produção
    if (body.devMode && process.env.NODE_ENV === 'production') {
      this.logger.debug(`Evento devMode ignorado em produção: ${body.event}`);
      return;
    }

    // 4. Idempotência — verificar se o evento já foi processado
    const eventId = body.id;
    if (!eventId) {
      this.logger.warn('Webhook sem data.id — ignorando.');
      return;
    }

    const alreadyProcessed = await this.db.processedWebhookEvent.findUnique({
      where: { eventId: `${body.event}:${eventId}` },
    });
    if (alreadyProcessed) {
      this.logger.debug(`Evento já processado: ${body.event}:${eventId}`);
      return;
    }

    // 5. Roteamento por tipo de evento
    this.logger.log(`Processando evento: ${body.event} | ID: ${eventId}`);
    switch (body.event) {
      case EVENTS.SUBSCRIPTION_FIRST_PAYMENT:
        await this.handleFirstPayment(body);
        break;
      case EVENTS.SUBSCRIPTION_RENEWED:
        await this.handleRenewal(body);
        break;
      case EVENTS.SUBSCRIPTION_PAYMENT_FAILED:
        await this.handlePaymentFailed(body);
        break;
      case EVENTS.SUBSCRIPTION_CANCELLED:
      case EVENTS.SUBSCRIPTION_EXPIRED:
        await this.handleCancellation(body);
        break;
      default:
        this.logger.warn(`Evento desconhecido recebido: ${body.event}`);
    }

    // 6. Registrar evento como processado (idempotência)
    await this.db.processedWebhookEvent.create({
      data: {
        eventId: `${body.event}:${eventId}`,
        eventType: body.event,
        payload: body as object,
      },
    });
  }

  // ────────────────────────────────────────────────────────────
  // Handlers por evento
  // ────────────────────────────────────────────────────────────

  /** Calcula a data de fim do período atual, já que a AbacatePay não envia isso direto */
  private calculatePeriodEnd(createdAt: string, frequency?: string): Date {
    const date = new Date(createdAt);
    if (frequency === 'ANNUAL') {
      date.setFullYear(date.getFullYear() + 1);
    } else {
      // padrão: MONTHLY (e fallback pra qualquer frequência não mapeada)
      date.setMonth(date.getMonth() + 1);
    }
    return date;
  }

  /** Primeira cobrança paga → criar/ativar usuário + enviar e-mail de boas-vindas */
  private async handleFirstPayment(payload: AbacatepayWebhookPayload): Promise<void> {
    const email = payload.data.customer?.email;
    const name  = payload.data.customer?.name ?? 'Assessor';

    if (!email) {
      this.logger.error('Evento de primeiro pagamento sem e-mail do customer.');
      return;
    }

    const subscriptionId = payload.data.subscription?.id;
    const customerId     = payload.data.customer?.id;
    const createdAt      = payload.data.subscription?.createdAt;
    const frequency      = payload.data.subscription?.frequency;
    const currentPeriodEnd = createdAt
      ? this.calculatePeriodEnd(createdAt, frequency)
      : null;

    if (!subscriptionId) {
      this.logger.error('Evento de primeiro pagamento sem subscription.id.');
      return;
    }

    // Verificar se usuário já existe (reativação)
    const existingUser = await this.db.user.findUnique({ where: { email } });

    if (existingUser) {
      // Reativação — apenas atualiza assinatura, não recria senha, reseta retenção
      await this.db.subscription.upsert({
        where: { userId: existingUser.id },
        update: {
          status: 'ACTIVE',
          abacatepaySubscriptionId: subscriptionId,
          abacatepayCustomerId: customerId,
          dataRetentionChoice: null,
          scheduledDataDeletionAt: null,
          deletionWarningSentAt: null,
          ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
          updatedAt: new Date(),
        },
        create: {
          userId: existingUser.id,
          status: 'ACTIVE',
          abacatepaySubscriptionId: subscriptionId,
          abacatepayCustomerId: customerId,
          dataRetentionChoice: null,
          scheduledDataDeletionAt: null,
          deletionWarningSentAt: null,
          ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
        },
      });

      if (existingUser.role !== 'admin') {
        await this.db.user.update({
          where: { id: existingUser.id },
          data: { role: 'user' },
        });
      }

      await this.notifications.sendReactivationEmail(existingUser.email, existingUser.name);
      this.logger.log(`Assinatura reativada para: ${email}`);
      return;
    }

    // Novo usuário — criar sem senha (senha será definida via token)
    const newUser = await this.db.user.create({
      data: {
        name,
        email,
        password: null,
        role: 'pending',
        preferences: [],
      },
    });

    await this.db.subscription.create({
      data: {
        userId: newUser.id,
        status: 'ACTIVE',
        abacatepaySubscriptionId: subscriptionId,
        abacatepayCustomerId: customerId,
        ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
      },
    });

    const setupToken = await this.generatePasswordSetupToken(newUser.id);
    await this.notifications.sendWelcomeEmail(newUser.email, newUser.name, setupToken);

    this.logger.log(`Novo usuário criado e e-mail enviado: ${email}`);
  }


  /** Renovação mensal paga → atualizar período */
  private async handleRenewal(payload: AbacatepayWebhookPayload): Promise<void> {
    const customerId     = payload.data.customer?.id;
    const subscriptionId = payload.data.subscription?.id;
    const createdAt      = payload.data.subscription?.createdAt;
    const frequency      = payload.data.subscription?.frequency;
    const currentPeriodEnd = createdAt
      ? this.calculatePeriodEnd(createdAt, frequency)
      : null;

    const orConditions: Array<{ abacatepaySubscriptionId?: string; abacatepayCustomerId?: string }> = [];
    if (subscriptionId) orConditions.push({ abacatepaySubscriptionId: subscriptionId });
    if (customerId) orConditions.push({ abacatepayCustomerId: customerId });

    if (orConditions.length === 0) {
      this.logger.warn('Renovação: nenhum identificador de assinatura fornecido.');
      return;
    }

    const subscription = await this.db.subscription.findFirst({ where: { OR: orConditions } });

    if (!subscription) {
      this.logger.warn(`Renovação: assinatura não encontrada para ID: ${subscriptionId}`);
      return;
    }

    await this.db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'ACTIVE',
        ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Assinatura renovada: ${subscriptionId}`);
  }


  /** Falha de pagamento → marcar PAST_DUE e notificar assessor */
  private async handlePaymentFailed(payload: AbacatepayWebhookPayload): Promise<void> {
    const subscriptionId = payload.data.subscription?.id;

    const subscription = await this.db.subscription.findFirst({
      where: { abacatepaySubscriptionId: subscriptionId },
      include: { user: true },
    });

    if (!subscription) {
      this.logger.warn(`Falha de pagamento: assinatura não encontrada para ID: ${subscriptionId}`);
      return;
    }

    await this.db.subscription.update({
      where: { id: subscription.id },
      data: { status: 'PAST_DUE', updatedAt: new Date() },
    });

    await this.notifications.sendPaymentFailedEmail(subscription.user.email, subscription.user.name);

    this.logger.log(`Assinatura marcada como PAST_DUE: ${subscriptionId}`);
  }

  /** Cancelamento ou expiração via webhook → suspender acesso com retenção padrão de 60 dias */
  private async handleCancellation(payload: AbacatepayWebhookPayload): Promise<void> {
    const subscriptionId = payload.data.subscription?.id;
    const isCancelled    = payload.event === EVENTS.SUBSCRIPTION_CANCELLED;

    const subscription = await this.db.subscription.findFirst({
      where: { abacatepaySubscriptionId: subscriptionId },
    });

    if (!subscription) {
      this.logger.warn(`Cancelamento: assinatura não encontrada para ID: ${subscriptionId}`);
      return;
    }

    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + 60);

    await this.db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: isCancelled ? 'CANCELLED' : 'EXPIRED',
        dataRetentionChoice: subscription.dataRetentionChoice ?? 'retain_60_days',
        scheduledDataDeletionAt: subscription.scheduledDataDeletionAt ?? scheduledDate,
        updatedAt: new Date(),
      },
    });

    const user = await this.db.user.findUnique({ where: { id: subscription.userId } });
    if (user && user.role !== 'admin') {
      await this.db.user.update({
        where: { id: subscription.userId },
        data: { role: 'pending' },
      });
    }

    this.logger.log(`Assinatura ${isCancelled ? 'cancelada' : 'expirada'}: ${subscriptionId} (dados retidos até ${scheduledDate.toISOString()})`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────────

  private validateWebhookSecret(provided: string): void {
    const expected = process.env.ABACATEPAY_WEBHOOK_SECRET;
    if (!expected || provided !== expected) {
      this.logger.warn('Webhook secret inválido ou ausente.');
      throw new ForbiddenException('Webhook secret inválido.');
    }
  }

  private validateHmacSignature(rawBody: string, signature: string): void {
    const secret = process.env.ABACATEPAY_PUBLIC_SECRET!;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');

    const sigBuffer = Buffer.from(signature);
    const expBuffer = Buffer.from(expected);

    const isValid =
      sigBuffer.length === expBuffer.length &&
      crypto.timingSafeEqual(sigBuffer, expBuffer);

    if (!isValid) {
      this.logger.warn(`HMAC inválido. Recebido: ${signature} | Esperado: ${expected}`);
      throw new ForbiddenException('Assinatura HMAC inválida.');
    }
  }

  async generatePasswordSetupToken(userId: number): Promise<string> {
    // Invalidar tokens anteriores não utilizados
    await this.db.passwordSetupToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() }, // marca como "usado" para invalidar
    });

    const token = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + SETUP_TOKEN_TTL_HOURS);

    await this.db.passwordSetupToken.create({
      data: { userId, token, expiresAt },
    });

    return token;
  }

  /** Consulta o status da assinatura do usuário autenticado */
  async getUserSubscription(userId: number) {
    const subscription = await this.db.subscription.findUnique({
      where: { userId },
    });

    return {
      status: subscription?.status ?? 'NO_SUBSCRIPTION',
      plan: subscription?.plan ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      dataRetentionChoice: subscription?.dataRetentionChoice ?? null,
      scheduledDataDeletionAt: subscription?.scheduledDataDeletionAt ?? null,
      createdAt: subscription?.createdAt ?? null,
    };
  }

  /**
   * Cancelamento de assinatura solicitado pelo próprio assessor na plataforma.
   * Permite escolher entre excluir dados imediatamente ou mantê-los por 60 dias.
   */
  async cancelSubscription(userId: number, deleteDataImmediately: boolean) {
    const subscription = await this.db.subscription.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada.');
    }

    if (subscription.status === 'CANCELLED') {
      throw new BadRequestException('Esta assinatura já se encontra cancelada.');
    }

    // 1. Tentar cancelar no gateway da AbacatePay (se ID e chave existirem)
    if (subscription.abacatepaySubscriptionId && process.env.ABACATEPAY_API_KEY) {
      try {
        await axios.post(
          `https://api.abacatepay.com/v1/subscription/cancel`,
          { id: subscription.abacatepaySubscriptionId },
          {
            headers: {
              Authorization: `Bearer ${process.env.ABACATEPAY_API_KEY}`,
            },
          },
        );
        this.logger.log(`Assinatura cancelada na AbacatePay: ${subscription.abacatepaySubscriptionId}`);
      } catch (err) {
        this.logger.warn(`Tentativa de cancelamento na AbacatePay: ${(err as Error).message}`);
      }
    }

    // 2. Tratar opção de exclusão imediata vs retenção de 60 dias
    if (deleteDataImmediately) {
      await this.purgeUserData(userId);

      await this.db.subscription.update({
        where: { userId },
        data: {
          status: 'CANCELLED',
          dataRetentionChoice: 'immediate_delete',
          scheduledDataDeletionAt: null,
          deletionWarningSentAt: null,
          updatedAt: new Date(),
        },
      });

      if (subscription.user.role !== 'admin') {
        await this.db.user.update({
          where: { id: userId },
          data: { role: 'pending' },
        });
      }

      await this.notifications.sendCancellationImmediateEmail(
        subscription.user.email,
        subscription.user.name,
      );

      this.logger.log(`Assinatura cancelada com exclusão imediata de dados para usuário ID: ${userId}`);
      return {
        message: 'Assinatura cancelada e dados excluídos imediatamente.',
        dataRetentionChoice: 'immediate_delete',
      };
    } else {
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + 60);

      await this.db.subscription.update({
        where: { userId },
        data: {
          status: 'CANCELLED',
          dataRetentionChoice: 'retain_60_days',
          scheduledDataDeletionAt: scheduledDate,
          deletionWarningSentAt: null,
          updatedAt: new Date(),
        },
      });

      if (subscription.user.role !== 'admin') {
        await this.db.user.update({
          where: { id: userId },
          data: { role: 'pending' },
        });
      }

      await this.notifications.sendCancellationRetainEmail(
        subscription.user.email,
        subscription.user.name,
        scheduledDate,
      );

      this.logger.log(`Assinatura cancelada com retenção de 60 dias para usuário ID: ${userId} (exclusão agendada para ${scheduledDate.toISOString()})`);
      return {
        message: 'Assinatura cancelada com sucesso. Seus dados ficarão preservados por 60 dias.',
        dataRetentionChoice: 'retain_60_days',
        scheduledDataDeletionAt: scheduledDate,
      };
    }
  }

  /**
   * Remove todos os dados operacionais do assessor (clientes, caches e preferências),
   * mantendo o registro da conta e o histórico financeiro intactos.
   */
  async purgeUserData(userId: number): Promise<void> {
    try {
      // 1. Deletar cache de clientes associados
      await this.db.client_cache.deleteMany({
        where: { owner_id: userId },
      });

      // 2. Deletar cache do assessor
      await this.db.user_cache.deleteMany({
        where: { owner_id: userId },
      });

      // 3. Deletar clientes cadastrados pelo assessor
      await this.db.clients.deleteMany({
        where: { user_id: userId },
      });

      // 4. Limpar preferências de leitura
      await this.db.user.update({
        where: { id: userId },
        data: { preferences: [] },
      });

      this.logger.log(`Dados operacionais excluídos para o usuário ID: ${userId}`);
    } catch (err) {
      this.logger.error(`Erro ao excluir dados operacionais do usuário ID ${userId}: ${(err as Error).message}`);
    }
  }

  /**
   * Rotina de limpeza e alerta de retenção de dados:
   * 1. Envia aviso 7 dias antes do término dos 60 dias.
   * 2. Exclui dados definitivamente ao atingir os 60 dias.
   */
  async checkAndProcessExpiredDataRetention(): Promise<{ warned: number; purged: number }> {
    const now = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    let warnedCount = 0;
    let purgedCount = 0;

    const subscriptionsInRetention = await this.db.subscription.findMany({
      where: {
        status: 'CANCELLED',
        scheduledDataDeletionAt: { not: null },
      },
      include: { user: true },
    });

    for (const sub of subscriptionsInRetention) {
      if (!sub.scheduledDataDeletionAt) continue;

      // Caso 1: Atingiu o prazo de 60 dias -> Exclusão definitiva
      if (sub.scheduledDataDeletionAt <= now) {
        await this.purgeUserData(sub.userId);

        await this.db.subscription.update({
          where: { id: sub.id },
          data: {
            scheduledDataDeletionAt: null,
            updatedAt: new Date(),
          },
        });

        await this.notifications.sendDataDeletedEmail(sub.user.email, sub.user.name);
        this.logger.log(`[RETENÇÃO 60 DIAS] Dados excluídos definitivamente para ${sub.user.email}`);
        purgedCount++;
        continue;
      }

      // Caso 2: 7 dias antes -> Enviar aviso prévio
      if (!sub.deletionWarningSentAt && sub.scheduledDataDeletionAt <= sevenDaysFromNow) {
        await this.notifications.sendDataDeletionWarningEmail(
          sub.user.email,
          sub.user.name,
          sub.scheduledDataDeletionAt,
        );

        await this.db.subscription.update({
          where: { id: sub.id },
          data: {
            deletionWarningSentAt: new Date(),
            updatedAt: new Date(),
          },
        });

        this.logger.log(`[AVISO 7 DIAS] E-mail de aviso prévio enviado para ${sub.user.email}`);
        warnedCount++;
      }
    }

    return { warned: warnedCount, purged: purgedCount };
  }

  /** Listagem administrativa de assinantes */
  async listAllSubscriptions() {
    return this.db.subscription.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Alteração administrativa manual do status da assinatura */
  async updateSubscriptionStatus(userId: number, status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED') {
    const updated = await this.db.subscription.update({
      where: { userId },
      data: { status, updatedAt: new Date() },
    });

    // Se suspenso ou cancelado, atualiza role para pending; se ativo, para user (preservando admin)
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (user && user.role !== 'admin') {
      await this.db.user.update({
        where: { id: userId },
        data: { role: status === 'ACTIVE' ? 'user' : 'pending' },
      });
    }

    return updated;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Checkout — cria a assinatura e devolve a URL de pagamento
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Cria um checkout de assinatura na AbacatePay e retorna a URL de pagamento.
   * Chamado pela rota pública POST /billing/checkout (botão "Assinar" da landing page).
   * A própria tela de pagamento da AbacatePay coleta nome/e-mail do assessor.
   */
  async createSubscriptionCheckout(): Promise<string> {
    const apiKey = process.env.ABACATEPAY_API_KEY;
    const productId = process.env.ABACATEPAY_PRODUCT_ID;
    const frontendUrl = process.env.FRONTEND_URL ?? 'https://daily-news-challenge.vercel.app';

    if (!apiKey) {
      this.logger.error('ABACATEPAY_API_KEY não configurada.');
      throw new Error('Configuração de chave de API ausente.');
    }

    if (!productId) {
      this.logger.error('ABACATEPAY_PRODUCT_ID não configurado.');
      throw new Error('Configuração de produto ausente.');
    }

    try {
      const { data: response } = await axios.post(
        'https://api.abacatepay.com/v2/subscriptions/create',
        {
          items: [{ id: productId, quantity: 1 }],
          returnUrl: `${frontendUrl}/voltar`,
          completionUrl: `${frontendUrl}/pagamento-confirmado`,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const checkoutUrl: string = response?.data?.url;
      if (!checkoutUrl) {
        this.logger.error(`Resposta da AbacatePay sem URL: ${JSON.stringify(response)}`);
        throw new Error('AbacatePay não retornou uma URL de checkout válida.');
      }

      this.logger.log(`Checkout de assinatura criado: ${checkoutUrl}`);
      return checkoutUrl;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `Falha ao criar checkout na AbacatePay: ${err.response?.status} | ${JSON.stringify(err.response?.data)}`,
        );
      } else {
        this.logger.error(`Erro inesperado ao criar checkout: ${(err as Error).message}`);
      }
      throw err;
    }
  }
}
