import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { parseTrustProxySetting } from "./modules/auth/auth-client-ip";
import { AUTH_CONTEXT_SWITCH_ROTATION_HEADER } from "./modules/auth/auth.service";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const trustProxy = parseTrustProxySetting(process.env.APP_TRUST_PROXY);
  if (trustProxy !== undefined) {
    app.set("trust proxy", trustProxy);
  }
  app.setGlobalPrefix(process.env.API_PREFIX?.replace(/^\//, "") ?? "api/v1");
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
    exposedHeaders: [AUTH_CONTEXT_SWITCH_ROTATION_HEADER]
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );

  const port = Number(process.env.APP_PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
