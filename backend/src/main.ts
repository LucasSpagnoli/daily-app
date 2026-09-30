import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import express, { type Request, type Response } from 'express';
import cors from 'cors';

const expressApp = express();

const allowedOrigins = [
  'http://localhost:5173',
  'https://challenge-fullstack-manchester.vercel.app',
  'https://manchester-news-filter.vercel.app',
  'https://daily-news-challenge.vercel.app'
];

// Captura o rawBody antes do JSON parser — necessário para validação HMAC do webhook AbacatePay
expressApp.use((req, res, next) => {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', (chunk: string) => { data += chunk; });
  req.on('end', () => {
    (req as any).rawBody = data;
    next();
  });
});

expressApp.use(express.json());

expressApp.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origem não permitida'));
      }
    },
  }),
);


let cachedApp: express.Express | undefined;

async function bootstrap() {
  if (!cachedApp) {
    const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
    await app.init();
    cachedApp = expressApp;
  }
  return cachedApp;
}

if (!process.env.VERCEL) {
  bootstrap().then(() => {
    const port = process.env.PORT || 3000;
    expressApp.listen(port, () => {
      console.log(`Application is running on: http://localhost:${port}`);
    });
  });
}

export default async (req: Request, res: Response) => {
  const app = await bootstrap();
  app(req, res);
};

module.exports = exports.default;