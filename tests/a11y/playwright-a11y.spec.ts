/**
 * tests/a11y/playwright-a11y.spec.ts
 *
 * 需 playwright 浏览器，未在此环境实跑。
 * ============================================================================
 * 运行前提（勿在此 npm install / npx playwright install，浏览器下载过重）：
 *   devDependencies: @playwright/test, @axe-core/playwright
 *   且需先本地构建并启动：next build && next start（或部署预览环境）。
 * 目标：对关键页做 axe（@axe-core/playwright）审计，断言 critical/serious = 0 阻断。
 * 说明：BASE_URL 可用环境变量覆盖；动态作品/商品 id 需按实际数据替换占位。
 * ============================================================================
 */

import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

/** 对当前页面跑 axe，仅拦截 impact=critical/serious 的违规并断言为空。 */
async function auditNoBlocking(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();

  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious"
  );

  expect(
    blocking,
    `${name} 存在 critical/serious a11y 违规: ${JSON.stringify(
      blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }))
    )}`
  ).toHaveLength(0);
}

test.describe("a11y 关键页审计（@axe-core/playwright）", () => {
  test("首页 /", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await auditNoBlocking(page, "首页 /");
  });

  test("作品中心 /works", async ({ page }) => {
    await page.goto(`${BASE}/works`, { waitUntil: "networkidle" });
    await auditNoBlocking(page, "/works");
  });

  test("管理后台 /admin", async ({ page }) => {
    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    await auditNoBlocking(page, "/admin");
  });

  test("付费弹窗 PayGate", async ({ page }) => {
    // 占位 id，需按实际数据替换；进入含付费门禁的作品/商品页
    await page.goto(`${BASE}/works/demo-id`, { waitUntil: "networkidle" });
    const gate = page.getByRole("button", { name: /下载|付费|购买/ });
    if (await gate.count()) {
      await gate.first().click();
      await page.waitForTimeout(500);
    }
    await auditNoBlocking(page, "PayGate 弹窗");
  });

  test("ChatWidget 客服窗", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByLabel("打开智能客服").click();
    await page.waitForTimeout(300);
    await auditNoBlocking(page, "ChatWidget 客服窗");
  });

  test("Navbar 移动抽屉", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.getByLabel("打开菜单").click();
    await page.waitForTimeout(300);
    await auditNoBlocking(page, "Navbar 移动抽屉");
  });

  test("WorkPlayer 加载态", async ({ page }) => {
    await page.goto(`${BASE}/works/demo-id`, { waitUntil: "domcontentloaded" });
    // 加载态（role=status）出现前立即审计
    await auditNoBlocking(page, "WorkPlayer 加载态");
  });
});
