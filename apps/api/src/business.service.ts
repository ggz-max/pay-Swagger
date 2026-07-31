import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { CreateOrderDto, CreatePaymentDto, CreateRefundDto, CompletePaymentDto } from "./business.dto";
import { PrismaService } from "./prisma.service";

type Tx = Prisma.TransactionClient;

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  private businessNo(prefix: string): string {
    const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    return `${prefix}${stamp}${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  }

  private async trace(
    tx: Tx,
    input: {
      orderId?: string;
      eventType: string;
      actorType: string;
      actorId?: string;
      correlationId: string;
      sourceType?: string;
      sourceId?: string;
      summary: string;
      payload?: unknown;
    },
  ): Promise<void> {
    await tx.transactionTraceEvent.create({
      data: {
        orderId: input.orderId,
        eventType: input.eventType,
        actorType: input.actorType,
        actorId: input.actorId,
        correlationId: input.correlationId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        summary: input.summary,
        payloadRedacted: input.payload ? JSON.stringify(input.payload) : null,
      },
    });
  }

  async bootstrap(): Promise<unknown> {
    const [user, products] = await Promise.all([
      this.prisma.user.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } }),
      this.prisma.product.findMany({
        where: { status: "ACTIVE" },
        include: {
          skus: {
            where: { saleStatus: "ON_SALE" },
            include: { entitlementRules: { include: { entitlementDefinition: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return { user, products };
  }

  async createOrder(dto: CreateOrderDto): Promise<unknown> {
    const existingKey = await this.prisma.idempotencyRecord.findUnique({
      where: { scope_idempotencyKey: { scope: "CREATE_ORDER", idempotencyKey: dto.idempotencyKey } },
    });
    if (existingKey?.resourceId) return this.orderDetail(existingKey.resourceId);

    const sku = await this.prisma.sku.findFirst({
      where: { id: dto.skuId, saleStatus: "ON_SALE", product: { status: "ACTIVE" } },
      include: { product: true, entitlementRules: { include: { entitlementDefinition: true } } },
    });
    if (!sku) throw new NotFoundException("SKU 不存在或当前不可售");
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException("用户不存在");

    const correlationId = randomUUID();
    const entitlementSnapshot = sku.entitlementRules.map((rule) => ({
      definitionId: rule.entitlementDefinitionId,
      code: rule.entitlementDefinition.code,
      name: rule.entitlementDefinition.name,
      type: rule.entitlementDefinition.type,
      unit: rule.entitlementDefinition.unit,
      grantValue: rule.grantValue,
      stackingRule: rule.entitlementDefinition.stackingRule,
    }));

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNo: this.businessNo("ORD"),
          userId: dto.userId,
          originalAmountMinor: sku.priceMinor,
          payableAmountMinor: sku.priceMinor,
          currency: sku.currency,
          expiresAt: new Date(Date.now() + 15 * 60_000),
          items: {
            create: {
              skuId: sku.id,
              skuCodeSnapshot: sku.code,
              skuNameSnapshot: `${sku.product.name} / ${sku.name}`,
              unitPriceMinorSnapshot: sku.priceMinor,
              lineAmountMinor: sku.priceMinor,
              currencySnapshot: sku.currency,
              entitlementSnapshot: JSON.stringify(entitlementSnapshot),
            },
          },
        },
      });
      await tx.idempotencyRecord.create({
        data: {
          scope: "CREATE_ORDER",
          idempotencyKey: dto.idempotencyKey,
          requestHash: JSON.stringify({ userId: dto.userId, skuId: dto.skuId }),
          resourceType: "ORDER",
          resourceId: created.id,
          status: "COMPLETED",
        },
      });
      await this.trace(tx, {
        orderId: created.id,
        eventType: "ORDER_CREATED",
        actorType: "USER",
        actorId: dto.userId,
        correlationId,
        sourceType: "ORDER",
        sourceId: created.id,
        summary: `创建订单 ${created.orderNo}，金额由后端按 SKU 计算`,
        payload: { skuId: sku.id, amountMinor: sku.priceMinor, currency: sku.currency },
      });
      return created;
    });
    return this.orderDetail(order.id);
  }

  async createPayment(orderId: string, dto: CreatePaymentDto): Promise<unknown> {
    const existing = await this.prisma.paymentAttempt.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) {
      if (existing.orderId !== orderId) throw new ConflictException("支付幂等键已被其他订单使用");
      return existing;
    }
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException("订单不存在");
    if (!['PENDING_PAYMENT', 'PAYING'].includes(order.status)) {
      throw new BadRequestException(`订单状态 ${order.status} 不允许创建支付尝试`);
    }
    if (order.expiresAt < new Date()) throw new BadRequestException("订单已过支付有效期");

    const correlationId = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.paymentAttempt.create({
        data: {
          orderId,
          merchantTradeNo: this.businessNo("PAY"),
          provider: "MOCK_PAY",
          method: dto.method ?? "QR_CODE",
          amountMinor: order.payableAmountMinor,
          currency: order.currency,
          status: "PROCESSING",
          idempotencyKey: dto.idempotencyKey,
        },
      });
      await tx.order.update({ where: { id: orderId }, data: { status: "PAYING" } });
      await this.trace(tx, {
        orderId,
        eventType: "PAYMENT_ATTEMPT_CREATED",
        actorType: "SYSTEM",
        correlationId,
        sourceType: "PAYMENT_ATTEMPT",
        sourceId: attempt.id,
        summary: `创建支付尝试 ${attempt.merchantTradeNo}`,
        payload: { provider: attempt.provider, amountMinor: attempt.amountMinor, currency: attempt.currency },
      });
      return attempt;
    });
  }

  async completePayment(paymentAttemptId: string, dto: CompletePaymentDto): Promise<unknown> {
    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: { id: paymentAttemptId },
      include: { order: true },
    });
    if (!attempt) throw new NotFoundException("支付尝试不存在");
    const providerEventId = dto.providerEventId ?? `evt_${randomUUID()}`;
    const duplicate = await this.prisma.paymentEvent.findUnique({
      where: { provider_providerEventId: { provider: attempt.provider, providerEventId } },
    });
    if (duplicate) return { duplicate: true, event: duplicate, order: await this.orderDetail(attempt.orderId) };

    if (dto.outcome === "DELAYED") {
      const event = await this.prisma.paymentEvent.create({
        data: {
          provider: attempt.provider,
          providerEventId,
          paymentAttemptId: attempt.id,
          eventType: "PAYMENT_PENDING",
          signatureStatus: "VALID",
          processingStatus: "PROCESSED",
          rawPayloadRedacted: JSON.stringify({ merchantTradeNo: attempt.merchantTradeNo, result: "PENDING" }),
          processedAt: new Date(),
        },
      });
      return { duplicate: false, event, order: await this.orderDetail(attempt.orderId) };
    }

    if (dto.outcome === "AMOUNT_MISMATCH") {
      const event = await this.prisma.$transaction(async (tx) => {
        const created = await tx.paymentEvent.create({
          data: {
            provider: attempt.provider,
            providerEventId,
            paymentAttemptId: attempt.id,
            eventType: "PAYMENT_SUCCEEDED",
            signatureStatus: "VALID",
            processingStatus: "REJECTED",
            errorCode: "PAYMENT_AMOUNT_MISMATCH",
            rawPayloadRedacted: JSON.stringify({ merchantTradeNo: attempt.merchantTradeNo, amountMinor: attempt.amountMinor + 1 }),
            processedAt: new Date(),
          },
        });
        await tx.exceptionCase.create({
          data: {
            orderId: attempt.orderId,
            sourceType: "PAYMENT_EVENT",
            sourceId: created.id,
            exceptionCode: "PAYMENT_AMOUNT_MISMATCH",
            severity: "S1",
            lastErrorCode: "PAYMENT_AMOUNT_MISMATCH",
          },
        });
        await this.trace(tx, {
          orderId: attempt.orderId,
          eventType: "PAYMENT_CALLBACK_REJECTED",
          actorType: "PAYMENT_PROVIDER",
          correlationId: randomUUID(),
          sourceType: "PAYMENT_EVENT",
          sourceId: created.id,
          summary: "回调金额与订单应付金额不一致，拒绝更新资金状态",
        });
        return created;
      });
      return { duplicate: false, event, order: await this.orderDetail(attempt.orderId) };
    }

    if (dto.outcome === "FAILURE") {
      await this.prisma.$transaction(async (tx) => {
        const event = await tx.paymentEvent.create({
          data: {
            provider: attempt.provider,
            providerEventId,
            paymentAttemptId: attempt.id,
            eventType: "PAYMENT_FAILED",
            signatureStatus: "VALID",
            processingStatus: "PROCESSED",
            rawPayloadRedacted: JSON.stringify({ merchantTradeNo: attempt.merchantTradeNo, result: "FAILED" }),
            processedAt: new Date(),
          },
        });
        await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "FAILED", failureCode: "USER_PAYMENT_FAILED" } });
        await tx.order.update({ where: { id: attempt.orderId }, data: { status: "PENDING_PAYMENT" } });
        await this.trace(tx, {
          orderId: attempt.orderId,
          eventType: "PAYMENT_FAILED",
          actorType: "PAYMENT_PROVIDER",
          correlationId: randomUUID(),
          sourceType: "PAYMENT_EVENT",
          sourceId: event.id,
          summary: "渠道返回支付失败，业务订单仍可发起新的支付尝试",
        });
      });
      return { duplicate: false, order: await this.orderDetail(attempt.orderId) };
    }

    await this.confirmPayment(attempt.id, providerEventId);
    await this.fulfillOrder(attempt.orderId, dto.outcome === "ENTITLEMENT_FAILURE");
    return { duplicate: false, order: await this.orderDetail(attempt.orderId) };
  }

  private async confirmPayment(paymentAttemptId: string, providerEventId: string): Promise<void> {
    const attempt = await this.prisma.paymentAttempt.findUniqueOrThrow({ where: { id: paymentAttemptId }, include: { order: true } });
    if (attempt.amountMinor !== attempt.order.payableAmountMinor || attempt.currency !== attempt.order.currency) {
      throw new ConflictException("支付尝试金额或币种与订单不一致");
    }
    await this.prisma.$transaction(async (tx) => {
      const event = await tx.paymentEvent.create({
        data: {
          provider: attempt.provider,
          providerEventId,
          paymentAttemptId: attempt.id,
          eventType: "PAYMENT_SUCCEEDED",
          signatureStatus: "VALID",
          processingStatus: "PROCESSED",
          rawPayloadRedacted: JSON.stringify({ merchantTradeNo: attempt.merchantTradeNo, result: "SUCCESS", amountMinor: attempt.amountMinor }),
          processedAt: new Date(),
        },
      });
      const now = new Date();
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: "SUCCEEDED", providerTradeNo: this.businessNo("CHN"), providerPaidAt: now },
      });
      await tx.order.update({ where: { id: attempt.orderId }, data: { status: "PAID", paidAt: now } });
      await tx.outboxEvent.create({
        data: {
          aggregateType: "ORDER",
          aggregateId: attempt.orderId,
          eventType: "ORDER_PAID",
          payload: JSON.stringify({ orderId: attempt.orderId, paymentAttemptId: attempt.id }),
        },
      });
      await this.trace(tx, {
        orderId: attempt.orderId,
        eventType: "PAYMENT_CONFIRMED",
        actorType: "PAYMENT_PROVIDER",
        correlationId: randomUUID(),
        sourceType: "PAYMENT_EVENT",
        sourceId: event.id,
        summary: "Webhook 验签、金额、币种和关联订单校验通过，资金事实落库",
      });
    });
  }

  private async fulfillOrder(orderId: string, forceFailure: boolean): Promise<void> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    if (order.status === "FULFILLED") return;

    for (const item of order.items) {
      const snapshots = JSON.parse(item.entitlementSnapshot) as Array<{
        definitionId: string;
        code: string;
        type: string;
        grantValue: number;
      }>;
      for (const snapshot of snapshots) {
        const existing = await this.prisma.userEntitlement.findFirst({
          where: { sourceOrderItemId: item.id, entitlementDefinitionId: snapshot.definitionId },
        });
        if (existing?.status === "ACTIVE") continue;

        if (forceFailure) {
          await this.prisma.$transaction(async (tx) => {
            const entitlement = existing
              ? await tx.userEntitlement.update({ where: { id: existing.id }, data: { status: "GRANT_FAILED", lastErrorCode: "DEMO_GRANT_FAILURE" } })
              : await tx.userEntitlement.create({
                  data: {
                    userId: order.userId,
                    entitlementDefinitionId: snapshot.definitionId,
                    sourceOrderItemId: item.id,
                    status: "GRANT_FAILED",
                    lastErrorCode: "DEMO_GRANT_FAILURE",
                  },
                });
            await tx.exceptionCase.create({
              data: {
                orderId,
                sourceType: "USER_ENTITLEMENT",
                sourceId: entitlement.id,
                exceptionCode: "ENTITLEMENT_GRANT_FAILED",
                severity: "S2",
                retryCount: 0,
                nextRetryAt: new Date(Date.now() + 60_000),
                lastErrorCode: "DEMO_GRANT_FAILURE",
              },
            });
            await this.trace(tx, {
              orderId,
              eventType: "ENTITLEMENT_GRANT_FAILED",
              actorType: "JOB_WORKER",
              correlationId: randomUUID(),
              sourceType: "USER_ENTITLEMENT",
              sourceId: entitlement.id,
              summary: "支付已成功，但权益发放失败；订单保持 PAID，进入补偿队列",
            });
          });
          continue;
        }
        await this.activateEntitlement(orderId, item.id, snapshot);
      }
    }

    const failedCount = await this.prisma.userEntitlement.count({
      where: { sourceOrderItem: { orderId }, status: "GRANT_FAILED" },
    });
    if (failedCount === 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id: orderId }, data: { status: "FULFILLED", fulfilledAt: new Date() } });
        await tx.outboxEvent.updateMany({ where: { aggregateId: orderId, eventType: "ORDER_PAID" }, data: { status: "PUBLISHED", publishedAt: new Date() } });
        await this.trace(tx, {
          orderId,
          eventType: "ORDER_FULFILLED",
          actorType: "JOB_WORKER",
          correlationId: randomUUID(),
          sourceType: "ORDER",
          sourceId: orderId,
          summary: "订单全部权益发放完成，交易闭环完成",
        });
      });
    }
  }

  private async activateEntitlement(
    orderId: string,
    orderItemId: string,
    snapshot: { definitionId: string; code: string; type: string; grantValue: number },
    existingId?: string,
  ): Promise<void> {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const validTo = snapshot.type === "DURATION" ? new Date(now.getTime() + snapshot.grantValue * 86_400_000) : null;
      const entitlement = existingId
        ? await tx.userEntitlement.update({
            where: { id: existingId },
            data: { status: "ACTIVE", validFrom: now, validTo, remainingBalance: snapshot.type === "BALANCE" ? snapshot.grantValue : null, lastErrorCode: null, version: { increment: 1 } },
          })
        : await tx.userEntitlement.create({
            data: {
              userId: order.userId,
              entitlementDefinitionId: snapshot.definitionId,
              sourceOrderItemId: orderItemId,
              status: "ACTIVE",
              validFrom: now,
              validTo,
              remainingBalance: snapshot.type === "BALANCE" ? snapshot.grantValue : null,
              version: 1,
            },
          });
      const ledgerKey = `GRANT:${orderItemId}:${snapshot.definitionId}`;
      await tx.entitlementLedger.upsert({
        where: { idempotencyKey: ledgerKey },
        update: {},
        create: {
          userEntitlementId: entitlement.id,
          operation: "GRANT",
          delta: snapshot.grantValue,
          beforeValue: 0,
          afterValue: snapshot.grantValue,
          sourceType: "ORDER_ITEM",
          sourceId: orderItemId,
          idempotencyKey: ledgerKey,
          reason: "支付成功后自动发放",
        },
      });
      await this.trace(tx, {
        orderId,
        eventType: "ENTITLEMENT_ACTIVATED",
        actorType: existingId ? "OPERATOR" : "JOB_WORKER",
        correlationId: randomUUID(),
        sourceType: "USER_ENTITLEMENT",
        sourceId: entitlement.id,
        summary: `权益 ${snapshot.code} 发放成功，幂等键 ${ledgerKey}`,
      });
    });
  }

  async retryException(exceptionId: string, reason: string): Promise<unknown> {
    const exception = await this.prisma.exceptionCase.findUnique({ where: { id: exceptionId } });
    if (!exception) throw new NotFoundException("异常工单不存在");
    if (exception.exceptionCode !== "ENTITLEMENT_GRANT_FAILED") throw new BadRequestException("该异常不支持权益补发");
    const entitlement = await this.prisma.userEntitlement.findUnique({
      where: { id: exception.sourceId },
      include: { entitlementDefinition: true, sourceOrderItem: true },
    });
    if (!entitlement) throw new NotFoundException("待补发权益不存在");
    const snapshot = (JSON.parse(entitlement.sourceOrderItem.entitlementSnapshot) as Array<{ definitionId: string; code: string; type: string; grantValue: number }>).find(
      (item) => item.definitionId === entitlement.entitlementDefinitionId,
    );
    if (!snapshot) throw new ConflictException("订单权益快照缺失");
    await this.activateEntitlement(exception.orderId!, entitlement.sourceOrderItemId, snapshot, entitlement.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.exceptionCase.update({
        where: { id: exceptionId },
        data: { status: "RESOLVED", retryCount: { increment: 1 }, resolutionCode: "MANUAL_RETRY_SUCCEEDED", resolutionNote: reason, resolvedAt: new Date() },
      });
      await tx.order.update({ where: { id: exception.orderId! }, data: { status: "FULFILLED", fulfilledAt: new Date() } });
      await this.trace(tx, {
        orderId: exception.orderId!,
        eventType: "EXCEPTION_RESOLVED",
        actorType: "OPERATOR",
        actorId: "demo-operator",
        correlationId: randomUUID(),
        sourceType: "EXCEPTION_CASE",
        sourceId: exception.id,
        summary: `人工重试发放成功；原因：${reason}`,
      });
    });
    return this.orderDetail(exception.orderId!);
  }

  async createRefund(orderId: string, dto: CreateRefundDto): Promise<unknown> {
    const previous = await this.prisma.refund.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (previous) return this.orderDetail(previous.orderId);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { paymentAttempts: { where: { status: "SUCCEEDED" }, orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!order) throw new NotFoundException("订单不存在");
    const payment = order.paymentAttempts[0];
    if (!payment || !["PAID", "FULFILLED"].includes(order.status)) throw new BadRequestException("订单当前不可退款");

    await this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.create({
        data: {
          refundNo: this.businessNo("RFD"),
          orderId,
          paymentAttemptId: payment.id,
          providerRefundNo: this.businessNo("RFCH"),
          amountMinor: order.payableAmountMinor,
          currency: order.currency,
          reasonCode: "USER_REQUEST",
          reasonNote: dto.reason,
          initiatorType: "USER",
          initiatorId: order.userId,
          status: "SUCCEEDED",
          entitlementActionStatus: "SUCCEEDED",
          idempotencyKey: dto.idempotencyKey,
          succeededAt: new Date(),
        },
      });
      const entitlements = await tx.userEntitlement.findMany({ where: { sourceOrderItem: { orderId }, status: "ACTIVE" } });
      for (const entitlement of entitlements) {
        await tx.userEntitlement.update({ where: { id: entitlement.id }, data: { status: "REVOKED", remainingBalance: 0, version: { increment: 1 } } });
        await tx.entitlementLedger.create({
          data: {
            userEntitlementId: entitlement.id,
            operation: "REVOKE",
            delta: -(entitlement.remainingBalance ?? 0),
            beforeValue: entitlement.remainingBalance,
            afterValue: 0,
            sourceType: "REFUND",
            sourceId: refund.id,
            idempotencyKey: `REVOKE:${refund.id}:${entitlement.id}`,
            reason: dto.reason,
          },
        });
      }
      await tx.order.update({ where: { id: orderId }, data: { status: "REFUNDED", refundedAt: new Date() } });
      await this.trace(tx, {
        orderId,
        eventType: "ORDER_REFUNDED",
        actorType: "USER",
        actorId: order.userId,
        correlationId: randomUUID(),
        sourceType: "REFUND",
        sourceId: refund.id,
        summary: "渠道退款成功，关联权益已回收；资金与权益状态分别留痕",
      });
    });
    return this.orderDetail(orderId);
  }

  async listOrders(): Promise<unknown> {
    return this.prisma.order.findMany({
      include: { items: true, paymentAttempts: { orderBy: { createdAt: "desc" } }, refunds: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async orderDetail(orderId: string): Promise<unknown> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        items: { include: { entitlements: { include: { entitlementDefinition: true, ledgers: { orderBy: { createdAt: "asc" } } } } } },
        paymentAttempts: { include: { events: { orderBy: { receivedAt: "asc" } } }, orderBy: { createdAt: "asc" } },
        refunds: { orderBy: { createdAt: "asc" } },
        traceEvents: { orderBy: { occurredAt: "asc" } },
        exceptionCases: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) throw new NotFoundException("订单不存在");
    return order;
  }

  async exceptions(): Promise<unknown> {
    return this.prisma.exceptionCase.findMany({ include: { order: true }, orderBy: { createdAt: "desc" } });
  }

  async dashboard(): Promise<unknown> {
    const [orders, payments, fulfilled, exceptions, refunded] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.paymentAttempt.count({ where: { status: "SUCCEEDED" } }),
      this.prisma.order.count({ where: { status: "FULFILLED" } }),
      this.prisma.exceptionCase.count({ where: { status: { not: "RESOLVED" } } }),
      this.prisma.order.count({ where: { status: "REFUNDED" } }),
    ]);
    const paidOrders = await this.prisma.order.findMany({ where: { paidAt: { not: null } }, select: { paidAt: true, fulfilledAt: true } });
    const durations = paidOrders.flatMap((item) => item.paidAt && item.fulfilledAt ? [item.fulfilledAt.getTime() - item.paidAt.getTime()] : []);
    return {
      orders,
      successfulPayments: payments,
      fulfilledOrders: fulfilled,
      openExceptions: exceptions,
      refundedOrders: refunded,
      paymentSuccessRate: orders === 0 ? 0 : Math.round((payments / orders) * 1000) / 10,
      averageFulfillmentMs: durations.length === 0 ? 0 : Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
    };
  }

  async reset(): Promise<unknown> {
    // Importing the seed module would create a second Prisma client; keep reset explicit and local.
    const client = this.prisma as PrismaClient;
    await client.$transaction([
      client.entitlementLedger.deleteMany(), client.userEntitlement.deleteMany(), client.paymentEvent.deleteMany(),
      client.refund.deleteMany(), client.reconciliationRecord.deleteMany(), client.paymentAttempt.deleteMany(),
      client.transactionTraceEvent.deleteMany(), client.exceptionCase.deleteMany(), client.orderItem.deleteMany(),
      client.order.deleteMany(), client.idempotencyRecord.deleteMany(), client.outboxEvent.deleteMany(), client.jobTask.deleteMany(),
    ]);
    return { reset: true, message: "交易演示数据已清空，商品与演示用户保留" };
  }
}

