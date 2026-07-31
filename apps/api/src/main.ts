import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix("api/v1");
  app.use(helmet());
  app.enableCors({
    origin: [
      process.env.CUSTOMER_WEB_ORIGIN ?? "http://127.0.0.1:5175",
      "http://127.0.0.1:5173",
      process.env.ADMIN_WEB_ORIGIN ?? "http://127.0.0.1:5174",
    ],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const swagger = new DocumentBuilder()
    .setTitle("MonetizeLab API")
    .setDescription("商业化交易闭环的可执行接口契约")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swagger));

  await app.listen(Number(process.env.API_PORT ?? 3000), "127.0.0.1");
}

void bootstrap();
