import type { Dashboard, ExceptionCase, Order } from "./types";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3000/api/v1";
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) throw new Error(`接口请求失败：${response.status}`);
  return response.json() as Promise<T>;
}
export const api = {
  dashboard: () => request<Dashboard>("/dashboard"),
  orders: () => request<Order[]>("/orders"),
  order: (id: string) => request<Order>(`/orders/${id}`),
  exceptions: () => request<ExceptionCase[]>("/exceptions"),
  retry: (id: string) => request<Order>(`/exceptions/${id}/retry`, { method: "POST", body: JSON.stringify({ reason: "运营台人工确认后补发" }) }),
  oauthContext: () => request<{ user: { id: string; displayName: string }; apps: Array<{ id: string; clientId: string; name: string; redirectUris: string; allowedScopes: string }> }>("/oauth/demo-context"),
  oauthAuthorize: (body: Record<string, string>) => request<{ code: string; state: string; redirectUri: string; securityChecks: string[] }>("/oauth/authorize", { method: "POST", body: JSON.stringify(body) }),
  oauthToken: (body: Record<string, string>) => request<{ tokenType: string; accessToken: string; refreshToken: string; expiresIn: number; scope: string }>("/oauth/token", { method: "POST", body: JSON.stringify(body) }),
  oauthUserInfo: (accessToken: string) => request<{ sub: string; name: string; email?: string; clientId: string; scope: string }>("/oauth/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } }),
  oauthRevoke: (token: string) => request<{ revoked: boolean; matched: boolean }>("/oauth/revoke", { method: "POST", body: JSON.stringify({ token }) }),
};
