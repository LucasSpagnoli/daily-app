import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly resend: Resend | null = null;
  private readonly fromEmail: string;
  private readonly frontendUrl: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn('RESEND_API_KEY não configurada. E-mails serão simulados em log.');
    }
    this.fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@dailynews.com.br';
    this.frontendUrl = process.env.FRONTEND_URL ?? 'https://daily-news-challenge.vercel.app';
  }

  private isResendConfigured(): boolean {
    return !!(this.resend && process.env.RESEND_API_KEY);
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * E-mail de boas-vindas — enviado na primeira ativação da assinatura.
   * Contém o link para o assessor definir sua senha e acessar a plataforma.
   */
  async sendWelcomeEmail(email: string, name: string, setupToken: string): Promise<void> {
    const setupUrl = `${this.frontendUrl}/definir-senha?token=${setupToken}`;

    if (!this.isResendConfigured()) {
      this.logger.warn(`[DEV SIMULATION] RESEND_API_KEY não configurada. E-mail de boas-vindas para: ${email}. Link: ${setupUrl}`);
      return;
    }

    try {
      await this.resend!.emails.send({
        from: `Daily.News <${this.fromEmail}>`,
        to: email,
        subject: 'Bem-vindo à Daily.News — Defina sua senha',
        html: this.buildWelcomeHtml(name, setupUrl),
      });
      this.logger.log(`E-mail de boas-vindas enviado para: ${email}`);
    } catch (err) {
      this.logger.error(`Falha ao enviar e-mail de boas-vindas para ${email}: ${(err as Error).message}`);
      // Não relançar — falha de e-mail não deve reverter a ativação do usuário
    }
  }

  /**
   * E-mail de reativação — quando uma assinatura cancelada é reativada.
   * O usuário já tem senha, portanto não inclui link de definição de senha.
   */
  async sendReactivationEmail(email: string, name: string): Promise<void> {
    if (!this.isResendConfigured()) {
      this.logger.warn(`[DEV SIMULATION] RESEND_API_KEY não configurada. E-mail de reativação para: ${email}`);
      return;
    }

    try {
      await this.resend!.emails.send({
        from: `Daily.News <${this.fromEmail}>`,
        to: email,
        subject: 'Sua assinatura Daily.News foi reativada',
        html: this.buildReactivationHtml(name),
      });
      this.logger.log(`E-mail de reativação enviado para: ${email}`);
    } catch (err) {
      this.logger.error(`Falha ao enviar e-mail de reativação para ${email}: ${(err as Error).message}`);
    }
  }

  /**
   * E-mail de falha de pagamento — avisa o assessor antes de perder acesso.
   */
  async sendPaymentFailedEmail(email: string, name: string): Promise<void> {
    if (!this.isResendConfigured()) {
      this.logger.warn(`[DEV SIMULATION] RESEND_API_KEY não configurada. E-mail de falha de pagamento para: ${email}`);
      return;
    }

    try {
      await this.resend!.emails.send({
        from: `Daily.News <${this.fromEmail}>`,
        to: email,
        subject: 'Daily.News — Falha no pagamento da sua assinatura',
        html: this.buildPaymentFailedHtml(name),
      });
      this.logger.log(`E-mail de falha de pagamento enviado para: ${email}`);
    } catch (err) {
      this.logger.error(`Falha ao enviar e-mail de pagamento para ${email}: ${(err as Error).message}`);
    }
  }

  /**
   * E-mail de nova senha — reutilizado para "esqueci minha senha".
   */
  async sendPasswordResetEmail(email: string, name: string, setupToken: string): Promise<void> {
    const resetUrl = `${this.frontendUrl}/definir-senha?token=${setupToken}`;

    if (!this.isResendConfigured()) {
      this.logger.warn(`[DEV SIMULATION] RESEND_API_KEY não configurada. E-mail de redefinição para: ${email}. Link: ${resetUrl}`);
      return;
    }

    try {
      await this.resend!.emails.send({
        from: `Daily.News <${this.fromEmail}>`,
        to: email,
        subject: 'Daily.News — Redefina sua senha',
        html: this.buildPasswordResetHtml(name, resetUrl),
      });
      this.logger.log(`E-mail de redefinição de senha enviado para: ${email}`);
    } catch (err) {
      this.logger.error(`Falha ao enviar e-mail de redefinição para ${email}: ${(err as Error).message}`);
    }
  }

  // ────────────────────────────────────────────────────────────
  // Templates HTML — paleta Daily.News (preto/dourado, tipografia serifada)
  // ────────────────────────────────────────────────────────────

  private baseLayout(content: string): string {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Daily.News</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f0;font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f0;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-top:3px solid #000000;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 0;">
              <div style="border-top:1px solid #D4AF37;margin-top:2px;"></div>
              <p style="margin:24px 0 0;font-family:Georgia,serif;font-size:22px;font-weight:300;letter-spacing:0.15em;color:#000000;">
                Daily<span style="color:#D4AF37;">.News</span>
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px 40px 40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e0e0e0;">
              <p style="margin:0;font-family:Arial,sans-serif;font-size:10px;color:#999999;letter-spacing:0.1em;text-transform:uppercase;">
                Daily.News — Curadoria precisa em tempo real para seus clientes.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private buildWelcomeHtml(name: string, setupUrl: string): string {
    const safeName = this.escapeHtml(name);
    return this.baseLayout(`
      <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.25em;">Registro confirmado</p>
      <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:28px;font-weight:300;color:#000000;line-height:1.3;">
        Bem-vindo, ${safeName}.
      </h1>
      <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:14px;color:#555555;line-height:1.7;">
        Sua assinatura Daily.News foi ativada com sucesso. Para acessar a plataforma, você precisa definir sua senha clicando no botão abaixo.
      </p>
      <p style="margin:0 0 32px;font-family:Arial,sans-serif;font-size:14px;color:#555555;line-height:1.7;">
        Este link é válido por <strong>48 horas</strong>. Se expirar, você pode solicitar um novo link na tela de login.
      </p>
      <a href="${setupUrl}" style="display:inline-block;background-color:#000000;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;padding:14px 32px;">
        Definir minha senha
      </a>
      <p style="margin:32px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#999999;">
        Não consegue clicar no botão? Copie e cole este link no navegador:<br/>
        <a href="${setupUrl}" style="color:#D4AF37;word-break:break-all;">${setupUrl}</a>
      </p>
    `);
  }

  private buildReactivationHtml(name: string): string {
    const safeName = this.escapeHtml(name);
    const loginUrl = `${this.frontendUrl}/`;
    return this.baseLayout(`
      <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.25em;">Assinatura reativada</p>
      <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:28px;font-weight:300;color:#000000;line-height:1.3;">
        Que bom ter você de volta, ${safeName}.
      </h1>
      <p style="margin:0 0 32px;font-family:Arial,sans-serif;font-size:14px;color:#555555;line-height:1.7;">
        Sua assinatura Daily.News foi reativada com sucesso. Você já pode acessar a plataforma normalmente com suas credenciais anteriores.
      </p>
      <a href="${loginUrl}" style="display:inline-block;background-color:#000000;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;padding:14px 32px;">
        Acessar a plataforma
      </a>
    `);
  }

  private buildPaymentFailedHtml(name: string): string {
    const safeName = this.escapeHtml(name);
    return this.baseLayout(`
      <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.25em;">Atenção</p>
      <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:28px;font-weight:300;color:#000000;line-height:1.3;">
        Problema no pagamento, ${safeName}.
      </h1>
      <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:14px;color:#555555;line-height:1.7;">
        Identificamos uma falha na cobrança da sua assinatura Daily.News. Estamos tentando processar o pagamento novamente de forma automática.
      </p>
      <p style="margin:0 0 32px;font-family:Arial,sans-serif;font-size:14px;color:#555555;line-height:1.7;">
        Para evitar a suspensão do seu acesso, verifique os dados do seu método de pagamento junto à AbacatePay o quanto antes.
      </p>
    `);
  }

  private buildPasswordResetHtml(name: string, resetUrl: string): string {
    const safeName = this.escapeHtml(name);
    return this.baseLayout(`
      <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.25em;">Redefinição de senha</p>
      <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:28px;font-weight:300;color:#000000;line-height:1.3;">
        Redefina sua senha, ${safeName}.
      </h1>
      <p style="margin:0 0 32px;font-family:Arial,sans-serif;font-size:14px;color:#555555;line-height:1.7;">
        Você solicitou a redefinição da sua senha. Clique no botão abaixo para criar uma nova senha. Este link expira em 48 horas.
      </p>
      <a href="${resetUrl}" style="display:inline-block;background-color:#000000;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;padding:14px 32px;">
        Redefinir minha senha
      </a>
      <p style="margin:32px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#999999;">
        Se você não fez esta solicitação, ignore este e-mail com segurança.
      </p>
    `);
  }
}
