# Assinatura Recorrente & Liberação de Acesso — Daily.News

Plano de implementação para o fluxo: assessor paga → assinatura recorrente ativa na AbacatePay → conta de `user` é criada/liberada → assessor define senha → acessa a plataforma normalmente.

Este documento assume o stack já existente (NestJS 11 + Prisma 7 + PostgreSQL no backend, React 19 + TS no frontend) e detalha o que precisa ser criado ou ajustado.

---

## 0. Decisões já tomadas

- **Quem paga:** o assessor — a conta `user` que já existe no sistema (papéis `user`/`admin`).
- **Modelo de cobrança:** assinatura recorrente via AbacatePay (Checkout de assinatura, produto com `cycle` definido).
- **E-mail transacional:** Resend.

## 0.1 Pontos a confirmar com a AbacatePay antes de codar

A AbacatePay v2 tem eventos específicos para assinatura (além do `billing.paid` do pagamento avulso). Antes de implementar o webhook, confirme no dashboard/documentação da sua conta os nomes exatos de:
- Evento de **primeira cobrança paga** (ativação da assinatura).
- Evento de **cobrança recorrente paga** (renovação de ciclo).
- Evento de **falha de pagamento** (`subscription.payment_failed` ou equivalente) — a AbacatePay tenta recobrar automaticamente (configurável: até 10 tentativas, 1–30 dias de intervalo) antes de marcar como `FAILED`.
- Evento de **cancelamento** (`subscription.cancelled` ou equivalente).

Esses nomes podem variar entre v1/v2 — vale um teste manual no **Dev Mode** disparando os eventos e inspecionando o payload real antes de fixar os nomes no código.

---

## 1. Banco de Dados (Prisma)

### 1.1 Ajuste no model `User` existente

- Tornar o campo de senha **opcional/nullable** — hoje o `User` provavelmente exige senha na criação (admin cria manualmente). No novo fluxo, o registro é criado pelo webhook **antes** de o assessor definir senha.
- Adicionar campo de **status da assinatura** no próprio `User` (redundância proposital, para facilitar checagem rápida no guard de autenticação) ou relacionar 1:1 com uma tabela `Subscription` separada (recomendado, mais limpo).

### 1.2 Novo model: `Subscription`

Guarda o estado da assinatura de cada assessor:
- `id`, `userId` (relação 1:1 com `User`)
- `abacatepaySubscriptionId` (ou `customerId`, conforme o que a API retornar)
- `status`: `ACTIVE`, `PAST_DUE` (pagamento falhou mas ainda em tentativa), `CANCELLED`, `EXPIRED`
- `currentPeriodEnd` (data até quando o acesso vale)
- `plan` (se houver mais de um plano no futuro)
- `createdAt`, `updatedAt`

### 1.3 Novo model: `PasswordSetupToken`

- `id`, `userId`, `token` (único, indexado), `expiresAt`, `usedAt` (nullable — null = ainda não usado)

### 1.4 Novo model: `ProcessedWebhookEvent`

Para idempotência — a AbacatePay pode reenviar o mesmo evento em caso de falha de rede/timeout.
- `id`, `eventId` (único, vindo do payload), `eventType`, `receivedAt`, `payload` (jsonb, útil para debug/auditoria)

### 1.5 Migration

Depois de ajustar o `schema.prisma`, gerar e aplicar a migration (`npx prisma migrate dev` local, `migrate deploy` em produção), seguindo o padrão já usado no projeto.

---

## 2. Backend — Novo módulo `billing/`

Seguindo a arquitetura modular do NestJS já usada no projeto (`auth/`, `clients/`, `feed/`, etc.), criar `backend/src/billing/` com:

### 2.1 `billing.controller.ts`

- `POST /billing/webhook/abacatepay` — rota pública (sem `JwtAuthGuard`), protegida apenas pela validação do `webhookSecret` na query string.
- Endpoints administrativos opcionais (ver seção 6): cancelar/consultar assinatura de um assessor específico.

### 2.2 `billing.service.ts` — lógica do webhook, em ordem:

1. Validar `webhookSecret` (comparar com valor em `.env`, algo como `ABACATEPAY_WEBHOOK_SECRET`).
2. (Se disponível) validar assinatura HMAC do corpo, conforme a doc da AbacatePay.
3. Checar `devMode` no payload — em produção, decidir se eventos de teste devem ser ignorados ou processados (recomendado: ignorar, ou processar apenas se `NODE_ENV !== 'production'`).
4. Checar se o `eventId` já foi processado (`ProcessedWebhookEvent`) — se sim, responder `200` e sair sem reprocessar.
5. Roteamento por `event`:
   - **Pagamento inicial confirmado** → criar/atualizar `User` (sem senha) + criar `Subscription` com `status: ACTIVE` → gerar `PasswordSetupToken` → enviar e-mail via Resend.
   - **Renovação paga** → atualizar `currentPeriodEnd` e garantir `status: ACTIVE` na `Subscription` existente (não recriar usuário nem reenviar e-mail de senha).
   - **Falha de pagamento** → `status: PAST_DUE`. Opcional: enviar e-mail avisando o assessor.
   - **Cancelamento/expiração** → `status: CANCELLED` ou `EXPIRED`. O acesso deve ser bloqueado (ver seção 3.2), mas **não** deletar o usuário nem seus dados (clientes cadastrados, histórico) — só suspender.
6. Gravar o evento em `ProcessedWebhookEvent`.
7. Responder `200 OK` sempre que o processamento (mesmo que seja "ignorar") for concluído sem erro — reservar erro `4xx/5xx` apenas para falhas reais, senão a AbacatePay vai reenviar o mesmo evento indefinidamente.

### 2.3 Reaproveitamento de conta existente

Se já existir um `User` com o e-mail recebido (ex: reativação após cancelamento), **não criar duplicado**: reativar a `Subscription` existente e pular a geração de novo token de senha (a pessoa já tem senha definida) — nesse caso, mandar um e-mail diferente ("assinatura reativada", sem link de definição de senha).

---

## 3. Backend — Ajustes no módulo `auth/`

### 3.1 Endpoint de definição de senha

`POST /auth/set-password` (fora do módulo `billing`, faz mais sentido em `auth/` por ser parte do fluxo de autenticação):
- Recebe `{ token, password }`.
- Valida: token existe, `usedAt` é `null`, `expiresAt` não passou.
- Faz hash da senha (o projeto já deve ter bcrypt/argon2 configurado para o login existente — reaproveitar a mesma lib).
- Atualiza `User.password`, marca `PasswordSetupToken.usedAt`.
- Retorna sucesso (frontend redireciona para `/login`).

Endpoint auxiliar opcional: `POST /auth/resend-setup-link` — reenvia o e-mail com novo token, caso o antigo expire (invalida o anterior).

### 3.2 Guard de assinatura ativa

Hoje, rotas protegidas usam algo como `JwtAuthGuard` (o README menciona Passport + JWT). Com assinatura recorrente, **login não deve bastar** — é preciso também checar se a assinatura está ativa, senão um assessor inadimplente continua usando o sistema normalmente.

Duas abordagens:
- **Guard adicional** (`SubscriptionGuard`) aplicado nas mesmas rotas que hoje usam `JwtAuthGuard`, que consulta o `status` da `Subscription` do usuário autenticado e bloqueia com `402 Payment Required` se não estiver `ACTIVE`.
- Ou embutir essa checagem dentro da própria estratégia JWT/`JwtAuthGuard` existente, para não precisar duplicar o guard em cada rota.

**Decisão de produto a tomar:** um assessor com pagamento em `PAST_DUE` (falha temporária, ainda em tentativas de recobrança) deve continuar com acesso até a AbacatePay desistir, ou perder acesso imediatamente na primeira falha? Isso muda a lógica do guard.

---

## 4. Backend — Envio de e-mail (Resend)

### 4.1 Configuração

- Criar conta Resend, verificar domínio de envio (SPF/DKIM) — sem isso, e-mails caem em spam ou nem chegam.
- `.env`: `RESEND_API_KEY`.
- Novo módulo `notifications/` (ou reaproveitar `services/` que já existe para Gemini/RSS, se fizer sentido arquitetural).

### 4.2 Templates necessários

- **Boas-vindas + definição de senha** (primeira ativação).
- **Assinatura reativada** (reativação sem precisar de nova senha).
- **Falha de pagamento** (opcional, mas recomendado — avisa o assessor antes de perder acesso).
- **Assinatura cancelada/expirada** (opcional).

Manter a linguagem visual da IDV (Daily.News) nos e-mails, se possível — mesma paleta preto/dourado, tipografia serifada no cabeçalho — para consistência de marca.

---

## 5. Frontend — Mudanças

### 5.1 Novas páginas (`frontend/src/Pages/`)

- **`PaymentConfirm.tsx`** — já criado. Rota pública, ex: `/pagamento-confirmado`.
- **`SetPassword.tsx`** — nova. Lê `?token=` da URL, formulário de nova senha (+ confirmação), chama `POST /auth/set-password`, redireciona para `/login` com mensagem de sucesso.
- **`SubscriptionExpired.tsx`** (ou reaproveitar como estado dentro do `LoginPage`) — tela exibida quando o backend retorna `402` numa tentativa de acesso, com CTA para reativar/regularizar o pagamento.

### 5.2 Rotas (`frontend/src/routes/`)

- Adicionar `/pagamento-confirmado` e `/definir-senha` como rotas **públicas** (fora do `RequireAuth`).
- No `RequireAuth` (ou equivalente), tratar o caso de resposta `402` do backend: redirecionar para a tela de assinatura expirada em vez do comportamento padrão de "não autenticado".

### 5.3 `api/` (cliente HTTP)

- O `apiFetch` já existente provavelmente trata `401` (token inválido/expirado) redirecionando para `/`. Adicionar tratamento equivalente para `402` (assinatura inativa) → redirecionar para a tela de assinatura expirada, sem deslogar o usuário (o JWT continua válido, só a assinatura que não está).

### 5.4 `LoginPage`

- Pequeno ajuste de copy: se o backend recusar login por assinatura inativa (em vez de credenciais inválidas), mostrar mensagem diferenciada ("Sua assinatura está inativa" em vez de "E-mail ou senha incorretos").

---

## 6. O que seria bom ter (não bloqueante para o MVP)

- **Painel administrativo de assinantes**: dentro do `AdminPage` já existente, uma listagem de assessores com status de assinatura, data de próxima cobrança, e ação manual de suspender/reativar acesso.
- **Cron job de segurança**: uma verificação periódica (ex: diária) que confere `currentPeriodEnd` de todas as assinaturas e marca como `EXPIRED` quem passou do prazo sem webhook de renovação ter chegado — rede de segurança caso algum webhook se perca.
- **Reenvio de link de definição de senha** pelo próprio `LoginPage` ("esqueci minha senha" pode reaproveitar o mesmo mecanismo de token).
- **Página de erro dedicada** para token de definição de senha inválido/expirado, com CTA de reenvio.
- **Logs estruturados** no `billing.service.ts` (ex: com o logger nativo do Nest) para cada evento de webhook recebido — essencial para debugar problemas de pagamento sem depender só do dashboard da AbacatePay.
- **Testes automatizados** do fluxo de webhook (mock do payload da AbacatePay, checando idempotência e criação correta de `User`/`Subscription`).
- **Sandbox/Dev Mode**: testar o ciclo completo (assinatura → renovação → falha → cancelamento) usando o Dev Mode da AbacatePay antes de ir para produção.

---

## 7. Perguntas em aberto (decidir antes ou durante a implementação)

- Acesso `PAST_DUE` continua liberado ou é bloqueado na primeira falha de cobrança?
- Existe mais de um plano/preço, ou é um valor único por enquanto?
- Cancelamento pode ser feito pelo próprio assessor dentro da plataforma, ou só via suporte/dashboard da AbacatePay?
- Ao cancelar, os dados de clientes cadastrados pelo assessor são mantidos indefinidamente ou há uma política de retenção/exclusão?
