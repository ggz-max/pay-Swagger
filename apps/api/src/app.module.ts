import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { PrismaService } from "./prisma.service";
import { BusinessController } from "./business.controller";
import { BusinessService } from "./business.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  controllers: [HealthController, BusinessController, AuthController],
  providers: [PrismaService, BusinessService, AuthService],
  exports: [PrismaService],
})
export class AppModule {}
