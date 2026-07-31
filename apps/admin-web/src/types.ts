export interface Dashboard {
  orders: number;
  successfulPayments: number;
  fulfilledOrders: number;
  openExceptions: number;
  refundedOrders: number;
  paymentSuccessRate: number;
  averageFulfillmentMs: number;
}

export interface TraceEvent {
  id: string;
  eventType: string;
  actorType: string;
  summary: string;
  occurredAt: string;
  correlationId: string;
  sourceType?: string;
  sourceId?: string;
}

export interface ExceptionCase {
  id: string;
  orderId?: string;
  exceptionCode: string;
  severity: string;
  status: string;
  retryCount: number;
  lastErrorCode?: string;
  nextRetryAt?: string;
  createdAt: string;
  order?: { orderNo: string; userId: string };
}

export interface Order {
  id: string;
  orderNo: string;
  status: string;
  userId: string;
  payableAmountMinor: number;
  currency: string;
  createdAt: string;
  paidAt?: string;
  fulfilledAt?: string;
  user?: { displayName: string; email: string };
  items: Array<{ skuNameSnapshot: string; entitlements?: Array<{ id: string; status: string; entitlementDefinition: { name: string }; ledgers: unknown[] }> }>;
  paymentAttempts: Array<{ id: string; merchantTradeNo: string; providerTradeNo?: string; status: string; events?: Array<{ id: string; eventType: string; processingStatus: string; errorCode?: string; receivedAt: string }> }>;
  traceEvents?: TraceEvent[];
  exceptionCases?: ExceptionCase[];
  refunds?: Array<{ refundNo: string; status: string; entitlementActionStatus: string }>;
}

