import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthorizeDto, RevokeTokenDto, TokenDto } from "./auth.dto";
import { AuthService } from "./auth.service";

@ApiTags("open-platform-auth")
@Controller("oauth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("demo-context")
  context(): Promise<unknown> { return this.auth.demoContext(); }

  @Post("authorize")
  authorize(@Body() dto: AuthorizeDto): Promise<unknown> { return this.auth.authorize(dto); }

  @Post("token")
  token(@Body() dto: TokenDto): Promise<unknown> { return this.auth.token(dto); }

  @Get("userinfo")
  userInfo(@Headers("authorization") authorization?: string): Promise<unknown> { return this.auth.userInfo(authorization); }

  @Post("revoke")
  revoke(@Body() dto: RevokeTokenDto): Promise<unknown> { return this.auth.revoke(dto.token); }
}

