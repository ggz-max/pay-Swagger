import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class AuthorizeDto {
  @IsString() clientId!: string;
  @IsString() userId!: string;
  @IsString() redirectUri!: string;
  @IsString() scopes!: string;
  @IsString() @MinLength(8) state!: string;
  @IsString() @MinLength(20) codeChallenge!: string;
  @IsOptional() @IsString() nonce?: string;
}

export class TokenDto {
  @IsIn(["authorization_code", "refresh_token"])
  grantType!: "authorization_code" | "refresh_token";

  @IsString() clientId!: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() redirectUri?: string;
  @IsOptional() @IsString() codeVerifier?: string;
  @IsOptional() @IsString() refreshToken?: string;
}

export class RevokeTokenDto {
  @IsString() token!: string;
}

