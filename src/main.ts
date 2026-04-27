import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";
import { PrismaService } from "./prisma/prisma.service";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  const prisma = app.get(PrismaService);

  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.log("Database connection: OK");
  } catch (error: unknown) {
    logger.error("Database connection: FAILED", error instanceof Error ? error.stack : undefined);
  }

  await app.listen(port);
  logger.log(`Server running at http://localhost:${port}/api`);
}

void bootstrap();
