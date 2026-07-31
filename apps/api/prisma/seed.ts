import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function clearDemoData(): Promise<void> {
  await prisma.$transaction([
    prisma.entitlementLedger.deleteMany(),
    prisma.userEntitlement.deleteMany(),
    prisma.paymentEvent.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.reconciliationRecord.deleteMany(),
    prisma.paymentAttempt.deleteMany(),
    prisma.transactionTraceEvent.deleteMany(),
    prisma.exceptionCase.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.subscription.deleteMany(),
    prisma.skuEntitlementRule.deleteMany(),
    prisma.sku.deleteMany(),
    prisma.product.deleteMany(),
    prisma.entitlementDefinition.deleteMany(),
    prisma.oAuthAuthorizationCode.deleteMany(),
    prisma.accessToken.deleteMany(),
    prisma.oAuthGrant.deleteMany(),
    prisma.openPlatformApp.deleteMany(),
    prisma.userSession.deleteMany(),
    prisma.externalIdentity.deleteMany(),
    prisma.idempotencyRecord.deleteMany(),
    prisma.outboxEvent.deleteMany(),
    prisma.jobTask.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

export async function seedDemoData(): Promise<void> {
  await clearDemoData();

  const user = await prisma.user.create({
    data: {
      id: "demo-user",
      displayName: "林墨（演示用户）",
      mobile: "138****2026",
      email: "demo@monetizelab.local",
    },
  });

  const membership = await prisma.entitlementDefinition.create({
    data: {
      id: "ent-membership",
      code: "MEMBERSHIP_DAYS",
      name: "高级会员有效期",
      type: "DURATION",
      unit: "DAY",
      stackingRule: "EXTEND_FROM_LATER_DATE",
    },
  });
  const credits = await prisma.entitlementDefinition.create({
    data: {
      id: "ent-ai-credits",
      code: "AI_CREDITS",
      name: "AI 创作额度",
      type: "BALANCE",
      unit: "CREDIT",
      stackingRule: "ADD",
    },
  });

  const products = [
    {
      id: "product-monthly",
      type: "MEMBERSHIP",
      name: "创作会员月卡",
      description: "适合短期体验，支付后发放 30 天高级会员。",
      sku: { id: "sku-monthly", code: "MEMBER_MONTH_30", name: "30 天会员", priceMinor: 1900 },
      entitlementId: membership.id,
      grantValue: 30,
    },
    {
      id: "product-yearly",
      type: "MEMBERSHIP",
      name: "创作会员年卡",
      description: "长期使用方案，支付后发放 365 天高级会员。",
      sku: { id: "sku-yearly", code: "MEMBER_YEAR_365", name: "365 天会员", priceMinor: 16800 },
      entitlementId: membership.id,
      grantValue: 365,
    },
    {
      id: "product-credits",
      type: "CREDIT_PACKAGE",
      name: "AI 创作额度包",
      description: "一次性购买，支付后增加 1,000 点可用额度。",
      sku: { id: "sku-credits", code: "AI_CREDITS_1000", name: "1,000 点额度", priceMinor: 4900 },
      entitlementId: credits.id,
      grantValue: 1000,
    },
  ];

  for (const item of products) {
    await prisma.product.create({
      data: {
        id: item.id,
        type: item.type,
        name: item.name,
        description: item.description,
        status: "ACTIVE",
        skus: {
          create: {
            ...item.sku,
            billingType: "ONE_TIME",
            currency: "CNY",
            saleStatus: "ON_SALE",
            entitlementRules: {
              create: {
                entitlementDefinitionId: item.entitlementId,
                grantValue: item.grantValue,
                grantTiming: "AFTER_PAYMENT",
              },
            },
          },
        },
      },
    });
  }

  await prisma.externalIdentity.create({
    data: {
      userId: user.id,
      provider: "DEMO_WECHAT",
      providerSubject: "wx_demo_2026",
      profileSnapshot: JSON.stringify({ nickname: "林墨", avatar: null }),
      lastLoginAt: new Date(),
    },
  });

  await prisma.openPlatformApp.create({
    data: {
      id: "demo-open-app",
      ownerUserId: user.id,
      clientId: "monetizelab_demo_client",
      clientSecretHash: "demo-secret-is-not-used-by-pkce-flow",
      name: "灵感笔记（演示接入方）",
      redirectUris: process.env.DEMO_OAUTH_REDIRECT_URI ?? "http://127.0.0.1:5174/oauth/callback",
      allowedScopes: "openid,profile,entitlements.read,orders.read",
      status: "ACTIVE",
    },
  });
}

async function main(): Promise<void> {
  await seedDemoData();
  console.log("MonetizeLab demo data seeded.");
}

if (require.main === module) {
  main()
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}
