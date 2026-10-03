import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

/**
 * SubscriptionGuard — aplique junto ao JwtAuthGuard nas rotas que exigem assinatura ativa.
 *
 * Retorna 402 Payment Required se:
 *  - O usuário não tiver registro de assinatura
 *  - O status da assinatura for CANCELLED, EXPIRED ou PAST_DUE
 *
 * Usuários com role 'admin' são isentos da verificação de assinatura.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Admins não precisam de assinatura
    if (!user || user.role === 'admin') {
      return true;
    }

    const subscription = await this.db.subscription.findUnique({
      where: { userId: user.id },
    });

    // PAST_DUE continua com acesso liberado enquanto a AbacatePay processa as tentativas de cobrança
    const isAllowed =
      subscription &&
      (subscription.status === 'ACTIVE' || subscription.status === 'PAST_DUE');

    if (!isAllowed) {
      throw new HttpException(
        'Sua assinatura está inativa. Regularize seu pagamento para continuar.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    if (subscription.status === 'PAST_DUE') {
      request.isPastDue = true;
    }

    return true;
  }
}
