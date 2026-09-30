import {
  Injectable,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from 'src/database/database.service';
import { NotificationsService } from 'src/notifications/notifications.service';

// ──────────────────────────────────────────────────────────────────────────────
// Tipos do payload AbacatePay (ajuste os nomes de evento conforme sua conta)
// ──────────────────────────────────────────────────────────────────────────────
interface AbacatepayWebhookPayload {
  event: string;          // ex: 'subscription.completed', 'subscription.renewed', ...
  devMode?: boolean;
  data: {
    id: string;                  // ID da cobrança/assinatura
    customer?: {
      id?: string;
      name?: string;
      email?: string;
    };
    subscription?: {
      id?: string;
      currentPeriodEnd?: string; // ISO 8601
    };
    externalId?: string;         // userId que passamos na criação do checkout
    metadata?: Record<string, string>;
    status?: string;
  };
}

// Eventos esperados — ajuste os strings exatos depois de testar no Dev Mode
const EVENTS = {
  SUBSCRIPTION_FIRST_PAYMENT: 'subscription.completed',   // primeiro ciclo pago → ativa
  SUBSCRIPTION_RENEWED:       'subscription.renewed',     // renovação paga
  SUBSCRIPTION_PAYMENT_FAILED:'subscription.payment_failed',
  SUBSCRIPTION_CANCELLED:     'subscription.cancelled',
  SUBSCRIPTION_EXPIRED:       'subscription.expired',
} as const;

const SETUP_TOKEN_TTL_HOURS = 48;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // Entry point chamado pelo controller
  // ────────────────────────────────────────────────────────────────────────────

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
    const eventId = body.data?.id;
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

  // ────────────────────────────────────────────────────────────────────────────
  // Handlers por evento
  // ────────────────────────────────────────────────────────────────────────────

  /** Primeira cobrança paga → criar/ativar usuário + enviar e-mail de boas-vindas */
  private async handleFirstPayment(payload: AbacatepayWebhookPayload): Promise<void> {
    const email = payload.data.customer?.email;
    const name  = payload.data.customer?.name ?? 'Assessor';

    if (!email) {
      this.logger.error('Evento de primeiro pagamento sem e-mail do customer.');
      return;
    }

    const subscriptionId    = payload.data.subscription?.id ?? payload.data.id;
    const customerId        = payload.data.customer?.id;
    const currentPeriodEnd  = payload.data.subscription?.currentPeriodEnd
      ? new Date(payload.data.subscription.currentPeriodEnd)
      : null;

    // Verificar se usuário já existe (reativação)
    const existingUser = await this.db.user.findUnique({ where: { email } });

    if (existingUser) {
      // Reativação — apenas atualiza assinatura, não recria senha
      await this.db.subscription.upsert({
        where: { userId: existingUser.id },
        update: {
          status: 'ACTIVE',
          abacatepaySubscriptionId: subscriptionId,
          abacatepayCustomerId: customerId,
          ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
          updatedAt: new Date(),
        },
        create: {
          userId: existingUser.id,
          status: 'ACTIVE',
          abacatepaySubscriptionId: subscriptionId,
          abacatepayCustomerId: customerId,
          ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
        },
      });

      // Garante role ativo
      await this.db.user.update({
        where: { id: existingUser.id },
        data: { role: 'user' },
      });

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

    // Criar registro de assinatura
    await this.db.subscription.create({
      data: {
        userId: newUser.id,
        status: 'ACTIVE',
        abacatepaySubscriptionId: subscriptionId,
        abacatepayCustomerId: customerId,
        ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
      },
    });

    // Gerar token de definição de senha
    const setupToken = await this.generatePasswordSetupToken(newUser.id);

    // Enviar e-mail de boas-vindas com link de definição de senha
    await this.notifications.sendWelcomeEmail(newUser.email, newUser.name, setupToken);

    this.logger.log(`Novo usuário criado e e-mail enviado: ${email}`);
  }

  /** Renovação mensal paga → atualizar período */
  private async handleRenewal(payload: AbacatepayWebhookPayload): Promise<void> {
    const customerId       = payload.data.customer?.id;
    const subscriptionId   = payload.data.subscription?.id ?? payload.data.id;
    const currentPeriodEnd = payload.data.subscription?.currentPeriodEnd
      ? new Date(payload.data.subscription.currentPeriodEnd)
      : null;

    const subscription = await this.db.subscription.findFirst({
      where: {
        OR: [
          { abacatepaySubscriptionId: subscriptionId },
          { abacatepayCustomerId: customerId ?? '' },
        ],
      },
    });

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
    const subscriptionId = payload.data.subscription?.id ?? payload.data.id;

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

    await this.notifications.sendPaymentFailedEmail(
      subscription.user.email,
      subscription.user.name,
    );

    this.logger.log(`Assinatura marcada como PAST_DUE: ${subscriptionId}`);
  }

  /** Cancelamento ou expiração → suspender acesso sem deletar dados */
  private async handleCancellation(payload: AbacatepayWebhookPayload): Promise<void> {
    const subscriptionId = payload.data.subscription?.id ?? payload.data.id;
    const isCancelled    = payload.event === EVENTS.SUBSCRIPTION_CANCELLED;

    const subscription = await this.db.subscription.findFirst({
      where: { abacatepaySubscriptionId: subscriptionId },
    });

    if (!subscription) {
      this.logger.warn(`Cancelamento: assinatura não encontrada para ID: ${subscriptionId}`);
      return;
    }

    await this.db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: isCancelled ? 'CANCELLED' : 'EXPIRED',
        updatedAt: new Date(),
      },
    });

    // Rebaixar role para 'pending' para bloquear acesso via SubscriptionGuard
    await this.db.user.update({
      where: { id: subscription.userId },
      data: { role: 'pending' },
    });

    this.logger.log(`Assinatura ${isCancelled ? 'cancelada' : 'expirada'}: ${subscriptionId}`);
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
    const secret = process.env.ABACATEPAY_WEBHOOK_SECRET!;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    try {
      const sigBuffer = Buffer.from(signature);
      const expBuffer = Buffer.from(expected);
      if (
        sigBuffer.length !== expBuffer.length ||
        !crypto.timingSafeEqual(sigBuffer, expBuffer)
      ) {
        throw new ForbiddenException('Assinatura HMAC inválida.');
      }
    } catch {
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
      createdAt: subscription?.createdAt ?? null,
    };
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

    // Se suspenso ou cancelado, atualiza role para pending; se ativo, para user
    await this.db.user.update({
      where: { id: userId },
      data: { role: status === 'ACTIVE' ? 'user' : 'pending' },
    });

    return updated;
  }
}
