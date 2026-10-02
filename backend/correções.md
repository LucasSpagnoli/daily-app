# Correções — Billing & Notifications

Revisão do `BillingController` (+ `BillingService`) e do `NotificationsService`.

---

## 1. `BillingController` / `BillingService`

### 🔴 Bug crítico: usuário nunca sai de `role: 'pending'`

No `handleFirstPayment`, o novo usuário é criado com `role: 'pending'`. Isso é correto — bloqueia acesso até a senha ser definida. **Mas em nenhum lugar do código esse `role` volta pra `'user'`.**

O service `/auth/set-password` (ainda não implementado) precisa, além de salvar o hash da senha e marcar o token como usado, **promover o `role` de `'pending'` para `'user'`**. Senão o fluxo fica assim:

```
assessor paga → cria conta (pending) → define senha → tenta logar
   → RolesGuard barra porque role ainda é 'pending' → acesso nunca libera
```

### 🟡 Role duplicando responsabilidade com `Subscription.status`

Hoje há **dois sinais** controlando acesso: `User.role` (`pending`/`user`/`admin`) e `Subscription.status` (`ACTIVE`/`PAST_DUE`/...). Funciona, mas cria risco de dessincronia — ex: um admin chama `updateSubscriptionStatus` manualmente e esquece de revisar se o `role` bateu certo (o código atual trata isso corretamente, mas é fácil esquecer num patch futuro).

Alternativa mais simples: deixar `role` representar só a *função* do usuário (`user`/`admin`, sem `pending`) e o `SubscriptionGuard` checar `Subscription.status === 'ACTIVE'` diretamente — fonte única de verdade. O "bloqueio" de quem ainda não definiu senha já é natural, porque sem senha a pessoa não consegue nem logar. Não é obrigatório mudar, só fica mais à prova de bug.

### 🟡 `webhookSecret`: AbacatePay manda por query string, não header

Confirmado na doc deles: o secret vai **sempre como parâmetro na URL do webhook** (`?webhookSecret=...`), não como header. No controller, `req.query?.webhookSecret` está como *fallback* — na prática deveria ser a fonte **primária**, e o `@Headers('x-webhook-secret')` provavelmente nunca vem preenchido (não é erro, só código morto).

```typescript
const resolvedSecret = (req.query?.webhookSecret as string) || webhookSecret;
```

### 🟡 Assinatura HMAC: nome do header ainda não confirmado

A doc da AbacatePay confirma que existe validação HMAC, mas o nome exato do header não foi localizado nas páginas consultadas. O código atual tenta três nomes diferentes (`x-webhook-signature`, `x-signature`, `abacatepay-signature`) — funciona como tentativa, mas vale confirmar o nome real no dashboard/doc da conta antes de confiar nisso em produção. Um header errado = a validação HMAC nunca roda e isso passa despercebido.

### 🟡 `rawBody` precisa ser configurado no `main.ts`

```typescript
const rawBody: string = (req as any).rawBody ?? JSON.stringify(req.body);
```

O fallback `JSON.stringify(req.body)` **não é confiável** pra HMAC — a ordem das chaves e espaçamento do JSON reserializado pode não bater byte a byte com o que a AbacatePay assinou, e a validação falha silenciosamente pra sempre. É preciso capturar o body raw de verdade, configurando algo como:

```typescript
// main.ts
app.use(
  json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf.toString();
    },
  }),
);
```

Sem isso, remover o fallback silencioso ou pelo menos logar um warning quando cair nele.

### 🟢 Pequeno: `abacatepayCustomerId: customerId ?? ''`

```typescript
OR: [
  { abacatepaySubscriptionId: subscriptionId },
  { abacatepayCustomerId: customerId ?? '' },
],
```

Se `customerId` vier `undefined`, isso busca por `abacatepayCustomerId: ''` — tecnicamente inofensivo (ninguém deveria ter esse campo vazio), mas mais seguro montar o array de condições filtrando os `undefined` antes, em vez de forçar string vazia.

### 🟢 Pequeno: `@HttpCode(200)` é redundante

Como a resposta é controlada manualmente via `@Res()` (`res.status(200).json(...)`), o `@HttpCode(200)` nunca entra em ação — não quebra nada, só é código morto que pode confundir quem ler depois.

---

## 2. `NotificationsService`

### 🔴 Risco: `name` interpolado sem escapar no HTML

```typescript
<h1 ...>Bem-vindo, ${name}.</h1>
```

O `name` vem do `customer.name` que o **próprio pagador preenche no checkout da AbacatePay** — dado não confiável. Se alguém colocar algo como `<img src=x onerror=alert(1)>` como nome, isso vai parar cru dentro do HTML do e-mail enviado via Resend.

Na prática o risco é baixo (o e-mail malicioso só seria visto pelo próprio remetente, já que vai pro e-mail que ele mesmo informou), **mas** se esse `name` também for salvo no `User.name` e exibido em algum lugar do admin panel ou da UI sem sanitização, vira um XSS armazenado de verdade. Vale adicionar uma função simples de escape:

```typescript
private escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

E usar `this.escapeHtml(name)` em todos os templates antes de interpolar.

### 🟡 `new Resend(process.env.RESEND_API_KEY)` roda mesmo sem a key

```typescript
constructor() {
  this.resend = new Resend(process.env.RESEND_API_KEY);
  ...
}
```

Isso instancia o client do Resend **antes** de checar se a key existe (a checagem só acontece dentro de cada método `send*`). Na maioria dos SDKs isso não derruba a aplicação (falha só na hora do request), mas vale testar localmente sem a env var definida pra confirmar que o Nest sobe sem erro. Se quiser blindar, dá pra mover a checagem pro constructor e logar um warning único na inicialização, em vez de repetir `if (!process.env.RESEND_API_KEY)` em cada método.

### 🟡 Falha de envio é só logada, nunca reaparece em lugar nenhum

```typescript
} catch (err) {
  this.logger.error(...)
  // Não relançar — falha de e-mail não deve reverter a ativação do usuário
}
```

A decisão de não reverter a criação do usuário está certa. Mas, como está, se o Resend falhar (rate limit, domínio não verificado, etc.), o assessor **pagou, a conta foi criada, mas ele nunca recebe o link de senha** — e não existe fallback nenhum. Isso já está no `pagamentos-assinatura.md` como "reenvio de link" (seção 6), mas ainda não foi implementado. Não é bug, mas reforça que o endpoint `resend-setup-link` não é só "nice to have" — é bem necessário pro caso de falha silenciosa de e-mail.

### 🟢 `frontendUrl` com domínio de challenge hardcoded

```typescript
this.frontendUrl = process.env.FRONTEND_URL ?? 'https://daily-news-challenge.vercel.app';
```

Confirmar que esse fallback é intencional (parece nome de ambiente de teste/challenge) — se for, tranquilo; só não esquecer de garantir que `FRONTEND_URL` está definido no `.env` de produção, senão os links dos e-mails reais vão apontar pro domínio errado.

### 🟢 Duplicação do guard `!process.env.RESEND_API_KEY`

Repetido em 4 métodos — não é erro, mas dá pra extrair num helper privado (`private isResendConfigured()`) só pra reduzir repetição.

---

## Resumo de prioridade & Status das Correções

| Prioridade | Item | Arquivo | Status / Ação Realizada |
|---|---|---|---|
| 🔴 Bloqueante | `role` nunca promovido para `'user'` após definir senha | `AuthService` | ✅ **Corrigido**: `setPassword` já promovia para `'user'`, e foi blindado para preservar contas com `role: 'admin'`. |
| 🔴 Bloqueante | `name` não escapado nos templates de e-mail | `NotificationsService` | ✅ **Corrigido**: Adicionado método `escapeHtml()` e sanitização do `name` em todos os templates HTML. |
| 🟡 Importante | `webhookSecret` deveria vir da query, não do header | `BillingController` | ✅ **Corrigido**: `req.query?.webhookSecret` configurado como fonte primária na resolução do secret. |
| 🟡 Importante | `rawBody` precisa de configuração real no `main.ts` | `main.ts` | ✅ **Corrigido**: Substituído middleware de stream pelo `express.json({ verify: ... })` e adicionado warning no controller. |
| 🟡 Importante | Nome do header HMAC não confirmado | `BillingController` | ✅ **Tratado**: Suporte ampliado para múltiplos headers (`x-webhook-signature`, `x-signature`, `abacatepay-signature`, `x-abacatepay-signature`) e fallback query param `signature`. |
| 🟡 Importante | Falha de envio de e-mail não tem fallback (reenvio de link) | `AuthController` / `AuthService` | ✅ **Verificado e Aprimorado**: O endpoint `POST /auth/resend-setup-link` já existe e agora diferencia envio de boas-vindas (primeiro acesso) de redefinição de senha. |
| 🟢 Nice to have | Deduplicar `role` vs `Subscription.status` | `BillingService` | ✅ **Aprimorado**: Preservação estrita do `role: 'admin'` em reativações, cancelamentos e alterações manuais de status. |
| 🟢 Nice to have | Remover fallback `?? ''` no filtro de `customerId` | `BillingService` | ✅ **Corrigido**: Montagem dinâmica do array `OR` ignorando parâmetros indefinidos em vez de buscar por `''`. |
| 🟢 Nice to have | Remover `@HttpCode(200)` redundante | `BillingController` | ✅ **Corrigido**: Decorator `@HttpCode(200)` e import não utilizado removidos, pois `@Res()` gerencia a resposta manualmente. |
| 🟢 Nice to have | Extrair `isResendConfigured()` | `NotificationsService` | ✅ **Corrigido**: Instanciação segura do Resend no construtor com warning único e método `isResendConfigured()` reutilizado. |
