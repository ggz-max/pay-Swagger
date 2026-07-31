import type { Bootstrap, Order, PaymentAttempt } from "./types";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3000/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: "请求失败" })) as { message?: string };
    throw new Error(Array.isArray(body.message) ? body.message.join("；") : body.message ?? "请求失败");
  }
  return response.json() as Promise<T>;
}

export const api = {
  bootstrap: () => request<Bootstrap>("/demo/bootstrap"),
  orders: () => request<Order[]>("/orders"),
  order: (id: string) => request<Order>(`/orders/${id}`),
  createOrder: (userId: string, skuId: string) => request<Order>("/orders", {
    method: "POST",
    body: JSON.stringify({ userId, skuId, idempotencyKey: `web-order-${crypto.randomUUID()}` }),
  }),
  createPayment: (orderId: string) => request<PaymentAttempt>(`/orders/${orderId}/payment-attempts`, {
    method: "POST",
    body: JSON.stringify({ idempotencyKey: `web-payment-${crypto.randomUUID()}`, method: "QR_CODE" }),
  }),
  completePayment: (paymentId: string, outcome: string) => request<{ duplicate: boolean; order: Order }>(`/payment-attempts/${paymentId}/mock-complete`, {
    method: "POST",
    body: JSON.stringify({ outcome }),
  }),
  refund: (orderId: string) => request<Order>(`/orders/${orderId}/refunds`, {
    method: "POST",
    body: JSON.stringify({ idempotencyKey: `web-refund-${crypto.randomUUID()}`, reason: "演示用户申请退款" }),
  }),
  reset: () => request<{ reset: boolean }>("/demo/reset", { method: "POST" }),
};
