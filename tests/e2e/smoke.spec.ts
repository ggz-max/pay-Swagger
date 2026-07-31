import { expect, test } from "@playwright/test";

const apiBase = "http://127.0.0.1:3000/api/v1";

test.beforeEach(async ({ request }) => {
  await request.post(`${apiBase}/demo/reset`);
});

test("用户端正常支付后展示订单、支付、权益组合状态", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "选择适合你的创作方案" })).toBeVisible();
  await page.getByRole("button", { name: /选择方案/ }).first().click();
  await expect(page.getByRole("heading", { name: "确认订单与支付场景" })).toBeVisible();
  await page.getByRole("button", { name: /创建订单并模拟支付/ }).click();
  await expect(page.getByRole("heading", { name: "购买成功，权益已到账" })).toBeVisible();
  await expect(page.getByText("交易完成", { exact: true })).toBeVisible();
  await expect(page.getByText("已生效", { exact: true })).toBeVisible();
});

test("支付成功但权益失败时不误导用户再次付款", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /选择方案/ }).last().click();
  await page.getByRole("button", { name: /权益发放失败/ }).click();
  await page.getByRole("button", { name: /创建订单并模拟支付/ }).click();
  await expect(page.getByRole("heading", { name: "支付成功，权益到账延迟" })).toBeVisible();
  await expect(page.getByText("资金已经确认，请勿重复支付。运营端可执行受控补发。")).toBeVisible();
  await expect(page.getByText("已支付·权益处理中", { exact: true })).toBeVisible();
});

test("运营台可以定位异常并受控补发", async ({ page, request }) => {
  const bootstrap = await (await request.get(`${apiBase}/demo/bootstrap`)).json();
  const order = await (await request.post(`${apiBase}/orders`, { data: { userId: bootstrap.user.id, skuId: bootstrap.products[2].skus[0].id, idempotencyKey: "e2e-order-exception" } })).json();
  const payment = await (await request.post(`${apiBase}/orders/${order.id}/payment-attempts`, { data: { idempotencyKey: "e2e-payment-exception", method: "QR_CODE" } })).json();
  await request.post(`${apiBase}/payment-attempts/${payment.id}/mock-complete`, { data: { outcome: "ENTITLEMENT_FAILURE", providerEventId: "evt-e2e-exception" } });

  await page.goto("http://127.0.0.1:5174");
  await page.getByRole("button", { name: /异常中心/ }).click();
  await expect(page.getByText("权益发放失败", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /人工补发/ }).click();
  await expect(page.locator(".detail-heading .status-fulfilled")).toBeVisible();
  await expect(page.locator(".object-state").getByText("生效", { exact: true })).toBeVisible();
  await expect(page.getByText(/人工重试发放成功/)).toBeVisible();
});

test("开放平台授权码 PKCE 流程可完成并撤销 Token", async ({ page, request }) => {
  await page.goto("http://127.0.0.1:5174");
  await page.getByRole("button", { name: "开放平台" }).click();
  await expect(page.getByRole("heading", { name: "开放平台认证实验台" })).toBeVisible();
  await page.getByRole("button", { name: /模拟用户同意授权/ }).click();
  await expect(page.getByText("授权码只存哈希")).toBeVisible();
  await page.getByRole("button", { name: /后端用 code/ }).click();
  await expect(page.getByText(/access_token（数据库只存/)).toBeVisible();
  await page.getByRole("button", { name: /访问 UserInfo/ }).click();
  await expect(page.getByText(/demo-user/)).toBeVisible();
  await page.getByRole("button", { name: /撤销 Access Token/ }).click();
  await expect(page.getByText("Token 已撤销")).toBeVisible();

  const context = await (await request.get(`${apiBase}/oauth/demo-context`)).json();
  expect(context.apps[0].clientId).toBe("monetizelab_demo_client");
});
