import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const apiBase = "http://127.0.0.1:3000/api/v1";
const outputDir = path.resolve("产出/验证截图");

test("保存用户端与运营端视觉验收证据", async ({ page, request }, testInfo) => {
  await mkdir(outputDir, { recursive: true });
  await request.post(`${apiBase}/demo/reset`);

  await page.goto("http://127.0.0.1:5175");
  await expect(page.getByRole("heading", { name: "选择适合你的创作方案" })).toBeVisible();
  await page.screenshot({ path: path.join(outputDir, `用户端商品中心-${testInfo.project.name}.png`), fullPage: true });

  const bootstrap = await (await request.get(`${apiBase}/demo/bootstrap`)).json();
  const order = await (await request.post(`${apiBase}/orders`, {
    data: { userId: bootstrap.user.id, skuId: bootstrap.products[2].skus[0].id, idempotencyKey: `visual-order-${testInfo.project.name}` },
  })).json();
  const payment = await (await request.post(`${apiBase}/orders/${order.id}/payment-attempts`, {
    data: { idempotencyKey: `visual-payment-${testInfo.project.name}`, method: "QR_CODE" },
  })).json();
  await request.post(`${apiBase}/payment-attempts/${payment.id}/mock-complete`, {
    data: { outcome: "ENTITLEMENT_FAILURE", providerEventId: `evt-visual-${testInfo.project.name}` },
  });

  await page.goto("http://127.0.0.1:5174");
  await page.getByRole("button", { name: "异常中心" }).click();
  await page.getByRole("button", { name: "查看链路" }).click();
  await expect(page.getByText("资金已确认，但权益发放失败")).toBeVisible();
  await page.screenshot({ path: path.join(outputDir, `运营台异常详情-${testInfo.project.name}.png`), fullPage: true });
});

