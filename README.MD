# Daily.News

Plataforma full-stack para assessores de investimentos enviarem resumos personalizados das notícias mais recentes do mercado para seus clientes.

## Fluxo

1. Login;
2. Registrar clientes e suas preferências;
3. Gerar e filtrar notícias de fontes RSS (G1 e InfoMoney);
4. Gerar e enviar um resumo das notícias pelo Whatsapp.

---

## Resumo

> Para quem quer saber apenas o necessário para rodar e entender o projeto.

- **Tecnologias:** NestJS 11 + React 19 + TypeScript + Prisma 7 + PostgreSQL + Tailwind CSS 4 + Gemini 2.5 Flash.
- **Rodar localmente:**
  1. Suba o banco: `docker compose up -d`
  2. Backend: `cd backend` → `npm install` → configure `.env` → `npx prisma migrate deploy` → `npm run dev` (porta 3000).
  3. Frontend: `cd frontend` → `npm install` → configure `.env` (`VITE_API_URL=http://localhost:3000`) → `npm run dev` (porta 5173).
- **Estrutura:** monorepo/projeto dividido em `backend/` (API NestJS) e `frontend/` (SPA React).
- **Autenticação:** JWT via HTTP Bearer token. Guardado em `sessionStorage` no frontend.
- **Funcionalidades:** Gestão de clientes e preferências de investimentos; coleta RSS + IA para curadoria e resumos; envio direto via WhatsApp (`wa.me`); painel administrativo.

---

## Stack

| Camada | Ferramenta | Versão | Descrição |
|---|---|---:|---|
| **Backend** | NestJS | 11.x | Framework HTTP e arquitetura modular |
| **Backend** | TypeScript | 5.x | Tipagem estática |
| **Backend** | Prisma | 7.x | ORM e migrations |
| **Backend** | PostgreSQL | — | Banco de dados relacional |
| **Backend** | Passport + JWT | 11.x | Autenticação e autorização por token |
| **Backend / IA** | Gemini 2.5 Flash | — | Filtro e resumo inteligente de notícias |
| **Frontend** | React | 19.x | Biblioteca de UI |
| **Frontend** | TypeScript | ~6.0 | Tipagem estática |
| **Frontend** | Vite | 8.x | Bundler e servidor de desenvolvimento |
| **Frontend** | React Router DOM | 7.x | Roteamento client-side (SPA) |
| **Frontend** | Tailwind CSS | 4.x | Estilização utilitária |

---

## Instalação e Execução

### Pré-requisitos

- Node.js 18+
- npm 9+
- PostgreSQL 14+ (ou Docker)
- Chave da API Gemini

### 1. Configuração do Banco de Dados e Backend

Crie o arquivo `backend/.env` a partir de `backend/.env.example`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/challenge_db"
JWT_SECRET="uma-chave-secreta-segura"
GEMINI_API_KEY="sua-chave-gemini"
ADMIN_SECRET="segredo-para-criar-administradores"

```

Suba o PostgreSQL via Docker, execute as migrations e inicie o backend:

```bash
docker compose up -d

cd backend
npm install
npx prisma migrate deploy
npx prisma generate
npm run dev

```

A API estará disponível em `http://localhost:3000`.

### 2. Configuração do Frontend

Crie o arquivo `frontend/.env`:

```env
VITE_API_URL=http://localhost:3000

```

Em outro terminal, execute o frontend:

```bash
cd frontend
npm install
npm run dev

```

A aplicação estará disponível em `http://localhost:5173`.

---

## Estrutura de Pastas

```
.
├── backend/
│   ├── src/
│   │   ├── auth/                  # Login, JWT, strategies, guards e roles
│   │   ├── clients/               # CRUD de clientes vinculados ao assessor
│   │   ├── database/              # DatabaseService e integração com Prisma
│   │   ├── feed/                  # Geração, atualização, cache e resumo de feeds
│   │   ├── preferences/           # Preferências do assessor e dos clientes
│   │   ├── services/              # Integração Gemini, RSS parser e Cache
│   │   ├── users/                 # Gestão de funcionários (admin)
│   │   ├── types/                 # DTOs e tipos compartilhados
│   │   └── utils/                 # Prompts da IA e formatadores
│   └── prisma/                    # Schema e migrations do PostgreSQL
│
└── frontend/
    └── src/
        ├── Pages/                 # Páginas (Login, Clients, Feed, Admin)
        ├── components/            # Modais, cards e layouts reutilizáveis
        ├── api/                   # Cliente HTTP (apiFetch), hooks e chamadas de API
        ├── routes/                # Route guards (RequireAuth, RequireAdmin, etc.)
        └── utils/                 # Funções utilitárias

```

---

## Autenticação e Rotas

### API / Autenticação

* `POST /auth/login` autentica usuário e retorna JWT.
* Envie o token nas rotas protegidas: `Authorization: Bearer <token>`.
* `POST /auth/admin` exige `ADMIN_SECRET` para criar administradores.
* Permissões divididas entre papéis `user` e `admin`.

### Frontend / Páginas

| Rota | Página | Acesso |
| --- | --- | --- |
| `/` | LoginPage | Pública |
| `/clients` | ClientPage | Autenticado (`user` ou `admin`) |
| `/feed` | FeedPage | Autenticado (`user`) |
| `/admin` | AdminPage | Somente `admin` |

---

## Funcionalidades Principais

* **Gestão de Clientes & Preferências:** Cadastro e edição de clientes com normalização automática do WhatsApp. Preferências de investimentos (ex.: `PETR4`, `Ibovespa`, `Taxa Selic`) editáveis inline.
* **Curadoria e Resumo com IA:** Raspagem de RSS de veículos de finanças (InfoMoney, G1 Economia). O Gemini filtra notícias por perfil e gera resumos sob demanda.
* **Cache Persistente:** Notícias e resumos gerados são salvos no PostgreSQL para acesso rápido no frontend.
* **Integração com WhatsApp:** Envio direto de resumos ou notícias individuais pré-formatadas para o cliente via `wa.me`.
* **Painel Administrativo:** Interface restrita a administradores para gerenciamento e criação de novos funcionários no sistema.

```