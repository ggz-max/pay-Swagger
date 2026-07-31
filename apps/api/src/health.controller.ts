import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("system")
@Controller("health")
export class HealthController {
  @Get()
  getHealth(): { status: string; service: string } {
    return { status: "ok", service: "monetizelab-api" };
  }
}
