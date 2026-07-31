export interface EntitlementRule {
  grantValue: number;
  entitlementDefinition: { code: string; name: string; unit: string; type: string };
}

export interface Sku {
  id: string;
  code: string;
  name: string;
  priceMinor: number;
  currency: string;
  entitlementRules: EntitlementRule[];
}

export interface Product {
  id: string;
  type: string;
  name: string;
  description: string;
  skus: Sku[];
}

export interface PaymentAttempt {
  id: string;
  merchantTradeNo: string;
  providerTradeNo?: string;
  status: string;
  amountMinor: number;
}

export interface TraceEvent {
  id: string;
  eventType: string;
  actorType: string;
  summary: string;
  occurredAt: string;
}

export interface ExceptionCase {
  id: string;
  exceptionCode: string;
  status: string;
}

export interface UserEntitlement {
  id: string;
  status: string;
  validTo?: string;
  remainingBalance?: number;
  entitlementDefinition: { name: string; unit: string };
}

export interface Order {
  id: string;
  orderNo: string;
  status: string;
  payableAmountMinor: number;
  currency: string;
  createdAt: string;
  items: Array<{
    skuNameSnapshot: string;
    entitlements?: UserEntitlement[];
  }>;
  paymentAttempts: PaymentAttempt[];
  traceEvents?: TraceEvent[];
  exceptionCases?: ExceptionCase[];
  refunds?: Array<{ refundNo: string; status: string }>;
}

export interface Bootstrap {
  user: { id: string; displayName: string; email: string };
  products: Product[];
}

