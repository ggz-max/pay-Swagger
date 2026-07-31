import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.DEPLOY_BASE_URL ?? "http://49.232.198.140/pay-swagger";
const outputDir = path.resolve("产出/部署截图");
const checks = [
  { name: "线上用户端-desktop", path: "/", heading: "选择适合你的创作方案", viewport: { width: 1440, height: 1000 } },
  { name: "线上运营台-desktop", path: "/admin/", heading: "商业化交易健康度", viewport: { width: 1440, height: 1000 } },
  { name: "线上用户端-mobile", path: "/", heading: "选择适合你的创作方案", viewport: { width: 390, height: 844 } },
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const check of checks) {
    const context = await browser.newContext({ viewport: check.viewport, locale: "zh-CN" });
    const page = await context.newPage();
    const errors = [];

    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
    });

    const response = await page.goto(`${baseUrl}${check.path}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: check.heading }).waitFor({ state: "visible" });
    const screenshot = path.join(outputDir, `${check.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });

    results.push({
      name: check.name,
      status: response?.status(),
      title: await page.title(),
      screenshot,
      errors,
    });
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
  });

  const resetResponse = await context.request.post(`${baseUrl}/api/v1/demo/reset`);
  if (!resetResponse.ok()) throw new Error(`Demo reset failed: ${resetResponse.status()}`);
  const response = await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /选择方案/ }).first().click();
  await page.getByRole("heading", { name: "确认订单与支付场景" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: /创建订单并模拟支付/ }).click();
  await page.getByRole("heading", { name: "购买成功，权益已到账" }).waitFor({ state: "visible" });
  const screenshot = path.join(outputDir, "线上支付成功闭环.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  results.push({
    name: "线上支付成功闭环",
    status: response?.status(),
    title: await page.title(),
    screenshot,
    errors,
  });
  await context.close();

  const oauthContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
  const oauthPage = await oauthContext.newPage();
  const oauthErrors = [];
  oauthPage.on("console", (message) => {
    if (message.type() === "error") oauthErrors.push(`console: ${message.text()}`);
  });
  oauthPage.on("pageerror", (error) => oauthErrors.push(`page: ${error.message}`));
  oauthPage.on("response", (response) => {
    if (response.status() >= 400) oauthErrors.push(`http ${response.status()}: ${response.url()}`);
  });

  const oauthResponse = await oauthPage.goto(`${baseUrl}/admin/`, { waitUntil: "networkidle" });
  await oauthPage.getByRole("button", { name: "开放平台" }).click();
  await oauthPage.getByRole("heading", { name: "开放平台认证实验台" }).waitFor({ state: "visible" });
  await oauthPage.getByText("monetizelab_demo_client", { exact: true }).waitFor({ state: "visible" });
  await oauthPage.getByRole("button", { name: /模拟用户同意授权/ }).click();
  await oauthPage.getByRole("button", { name: /后端用 code/ }).click();
  await oauthPage.getByRole("button", { name: /访问 UserInfo/ }).click();
  await oauthPage.getByText(/demo-user/).waitFor({ state: "visible" });
  await oauthPage.getByRole("button", { name: /撤销 Access Token/ }).click();
  await oauthPage.getByText("Token 已撤销").waitFor({ state: "visible" });
  const oauthScreenshot = path.join(outputDir, "线上OAuth-PKCE闭环.png");
  await oauthPage.screenshot({ path: oauthScreenshot, fullPage: true });
  results.push({
    name: "线上OAuth-PKCE闭环",
    status: oauthResponse?.status(),
    title: await oauthPage.title(),
    screenshot: oauthScreenshot,
    errors: oauthErrors,
  });
  await oauthContext.close();
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
if (results.some((result) => result.status !== 200 || result.errors.length > 0)) process.exitCode = 1;
