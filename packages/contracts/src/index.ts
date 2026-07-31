export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAYING",
  "PAID",
  "FULFILLED",
  "CLOSED",
  "REFUNDED",
] as const;

export const PAYMENT_STATUSES = [
  "CREATED",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CLOSED",
] as const;

export const ENTITLEMENT_STATUSES = [
  "PENDING",
  "GRANTING",
  "ACTIVE",
  "GRANT_FAILED",
  "REVOKING",
  "REVOKE_FAILED",
  "REVOKED",
  "EXPIRED",
] as const;

export const REFUND_STATUSES = [
  "REQUESTED",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CLOSED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export interface Money {
  amountMinor: number;
  currency: string;
}

export interface ApiProblem {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  correlationId: string;
  retryable: boolean;
  fieldErrors: Array<{ field: string; message: string }>;
}

export interface DisplayState {
  code: string;
  title: string;
  description: string;
  recommendedAction: "PAY" | "REFRESH" | "VIEW_ENTITLEMENT" | "CONTACT_SUPPORT" | "NONE";
}

export function deriveDisplayState(input: {
  orderStatus: OrderStatus;
  paymentStatus?: PaymentStatus;
  entitlementStatus?: EntitlementStatus;
}): DisplayState {
  if (input.orderStatus === "FULFILLED") {
    return {
      code: "PURCHASE_SUCCEEDED",
      title: "购买成功",
      description: "权益已到账，可以立即使用。",
      recommendedAction: "VIEW_ENTITLEMENT",
    };
  }

  if (input.orderStatus === "PAID") {
    const delayed = input.entitlementStatus === "GRANT_FAILED";
    return {
      code: delayed ? "PAYMENT_SUCCEEDED_FULFILLMENT_DELAYED" : "PAYMENT_SUCCEEDED_FULFILLING",
      title: delayed ? "支付成功，到账延迟" : "支付成功，权益处理中",
      description: delayed
        ? "系统正在自动补发，无需再次付款。"
        : "通常会在几秒内到账。",
      recommendedAction: delayed ? "CONTACT_SUPPORT" : "REFRESH",
    };
  }

  if (input.orderStatus === "PAYING" || input.paymentStatus === "PROCESSING") {
    return {
      code: "PAYMENT_CONFIRMING",
      title: "正在确认支付结果",
      description: "请勿重复支付，可以稍后刷新结果。",
      recommendedAction: "REFRESH",
    };
  }

  if (input.orderStatus === "PENDING_PAYMENT") {
    return {
      code: "WAITING_FOR_PAYMENT",
      title: "待支付",
      description: "订单仍在有效期内。",
      recommendedAction: "PAY",
    };
  }

  if (input.orderStatus === "REFUNDED") {
    return {
      code: "ORDER_REFUNDED",
      title: "已退款",
      description: "资金退款结果已确认。",
      recommendedAction: "NONE",
    };
  }

  return {
    code: "ORDER_CLOSED",
    title: "订单已关闭",
    description: "如仍需购买，请重新下单。",
    recommendedAction: "NONE",
  };
}
