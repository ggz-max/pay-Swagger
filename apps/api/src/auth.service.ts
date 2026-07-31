import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "./prisma.service";
import { AuthorizeDto, TokenDto } from "./auth.dto";

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private opaque(prefix: string): string {
    return `${prefix}_${randomBytes(32).toString("base64url")}`;
  }

  async demoContext(): Promise<unknown> {
    const [user, apps] = await Promise.all([
      this.prisma.user.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } }),
      this.prisma.openPlatformApp.findMany({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } }),
    ]);
    return { user, apps };
  }

  async authorize(dto: AuthorizeDto): Promise<unknown> {
    const app = await this.prisma.openPlatformApp.findUnique({ where: { clientId: dto.clientId } });
    if (!app || app.status !== "ACTIVE") throw new NotFoundException("开放平台应用不存在或已停用");
    const redirectUris = app.redirectUris.split(",").map((item) => item.trim());
    if (!redirectUris.includes(dto.redirectUri)) throw new BadRequestException("redirect_uri 不在应用白名单中");
    const allowed = new Set(app.allowedScopes.split(",").map((item) => item.trim()));
    const requested = dto.scopes.split(/[, ]/).map((item) => item.trim()).filter(Boolean);
    if (requested.some((scope) => !allowed.has(scope))) throw new BadRequestException("请求包含应用未获准的 scope");
    if (!requested.includes("openid")) throw new BadRequestException("本演示的登录授权必须包含 openid");
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user || user.status !== "ACTIVE") throw new NotFoundException("授权用户不存在或不可用");

    let grant = await this.prisma.oAuthGrant.findFirst({ where: { appId: app.id, userId: user.id, status: "ACTIVE" } });
    if (!grant) {
      grant = await this.prisma.oAuthGrant.create({ data: { appId: app.id, userId: user.id, scopes: requested.join(",") } });
    } else {
      grant = await this.prisma.oAuthGrant.update({ where: { id: grant.id }, data: { scopes: requested.join(",") } });
    }

    const rawCode = this.opaque("code");
    await this.prisma.oAuthAuthorizationCode.create({
      data: {
        codeHash: this.hash(rawCode), appId: app.id, userId: user.id, grantId: grant.id,
        redirectUri: dto.redirectUri, scopes: requested.join(","), codeChallenge: dto.codeChallenge,
        codeChallengeMethod: "S256", nonce: dto.nonce, expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    return {
      code: rawCode,
      state: dto.state,
      redirectUri: `${dto.redirectUri}?code=${encodeURIComponent(rawCode)}&state=${encodeURIComponent(dto.state)}`,
      expiresIn: 300,
      securityChecks: ["redirect_uri 精确匹配", "scope 子集校验", "state 原样返回", "授权码只存哈希"],
    };
  }

  async token(dto: TokenDto): Promise<unknown> {
    if (dto.grantType === "refresh_token") return this.refresh(dto);
    if (!dto.code || !dto.redirectUri || !dto.codeVerifier) throw new BadRequestException("授权码换 token 缺少必要参数");
    const authorizationCode = await this.prisma.oAuthAuthorizationCode.findUnique({
      where: { codeHash: this.hash(dto.code) }, include: { app: true, grant: true },
    });
    if (!authorizationCode) throw new UnauthorizedException("授权码无效");
    if (authorizationCode.status !== "ACTIVE" || authorizationCode.usedAt) throw new UnauthorizedException("授权码已使用或已失效");
    if (authorizationCode.expiresAt < new Date()) throw new UnauthorizedException("授权码已过期");
    if (authorizationCode.app.clientId !== dto.clientId || authorizationCode.redirectUri !== dto.redirectUri) {
      throw new UnauthorizedException("client_id 或 redirect_uri 与授权请求不一致");
    }
    const actualChallenge = createHash("sha256").update(dto.codeVerifier).digest("base64url");
    if (actualChallenge !== authorizationCode.codeChallenge) throw new UnauthorizedException("PKCE code_verifier 校验失败");

    const accessToken = this.opaque("at");
    const refreshToken = this.opaque("rt");
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.oAuthAuthorizationCode.updateMany({
        where: { id: authorizationCode.id, status: "ACTIVE", usedAt: null },
        data: { status: "USED", usedAt: new Date() },
      });
      if (consumed.count !== 1) throw new UnauthorizedException("授权码已被并发使用");
      await tx.accessToken.create({
        data: {
          grantId: authorizationCode.grantId, tokenHash: this.hash(accessToken), refreshTokenHash: this.hash(refreshToken),
          scopes: authorizationCode.scopes, expiresAt: new Date(Date.now() + 60 * 60_000),
        },
      });
    });
    return { tokenType: "Bearer", accessToken, refreshToken, expiresIn: 3600, scope: authorizationCode.scopes };
  }

  private async refresh(dto: TokenDto): Promise<unknown> {
    if (!dto.refreshToken) throw new BadRequestException("缺少 refresh_token");
    const current = await this.prisma.accessToken.findUnique({
      where: { refreshTokenHash: this.hash(dto.refreshToken) }, include: { grant: { include: { app: true } } },
    });
    if (!current || current.status !== "ACTIVE" || current.grant.status !== "ACTIVE") throw new UnauthorizedException("refresh_token 无效或已撤销");
    if (current.grant.app.clientId !== dto.clientId) throw new UnauthorizedException("refresh_token 不属于该应用");
    const accessToken = this.opaque("at");
    const refreshToken = this.opaque("rt");
    await this.prisma.$transaction([
      this.prisma.accessToken.update({ where: { id: current.id }, data: { status: "ROTATED", revokedAt: new Date() } }),
      this.prisma.accessToken.create({ data: { grantId: current.grantId, tokenHash: this.hash(accessToken), refreshTokenHash: this.hash(refreshToken), scopes: current.scopes, expiresAt: new Date(Date.now() + 60 * 60_000) } }),
    ]);
    return { tokenType: "Bearer", accessToken, refreshToken, expiresIn: 3600, scope: current.scopes };
  }

  async userInfo(bearer: string | undefined): Promise<unknown> {
    const rawToken = bearer?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!rawToken) throw new UnauthorizedException("缺少 Bearer access_token");
    const token = await this.prisma.accessToken.findUnique({
      where: { tokenHash: this.hash(rawToken) },
      include: { grant: { include: { user: true, app: true } } },
    });
    if (!token || token.status !== "ACTIVE" || token.expiresAt < new Date() || token.grant.status !== "ACTIVE") {
      throw new UnauthorizedException("access_token 无效、已过期或已撤销");
    }
    return {
      sub: token.grant.userId,
      name: token.grant.user.displayName,
      email: token.scopes.split(",").includes("profile") ? token.grant.user.email : undefined,
      clientId: token.grant.app.clientId,
      scope: token.scopes,
    };
  }

  async revoke(rawToken: string): Promise<unknown> {
    const hashes = [this.hash(rawToken)];
    const updated = await this.prisma.accessToken.updateMany({
      where: { OR: [{ tokenHash: { in: hashes } }, { refreshTokenHash: { in: hashes } }] },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    return { revoked: true, matched: updated.count > 0 };
  }
}

