/**
 * tests/a11y/axe.test.ts
 *
 * 需 jest + jest-axe，未在此环境实跑。
 * ============================================================================
 * 运行前提（本文件只产出用例骨架；安装 / 配置由专项或 CI 统加，勿在此 npm install）：
 *   devDependencies: jest, jest-environment-jsdom, ts-jest(或 babel-jest),
 *                    @testing-library/react, @testing-library/jest-dom, jest-axe
 *   jest 配置需:
 *     - testEnvironment: "jsdom"
 *     - moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" }
 *     - transform: ts/tsx（ts-jest）
 *   并为下列模块提供 mock（见下方 jest.mock）：
 *     next/link, next/navigation, @/lib/store, @/lib/brand, @/lib/seo, qrcode
 * ============================================================================
 * 目标：对关键路由（/、/works、/admin）与关键交互组件（PayGate 付费弹窗、
 *       ChatWidget 客服窗、Navbar 移动抽屉、WorkPlayer 加载态）做 WCAG 2.1 AA
 *       自动化断言；jest-axe 默认规则集，重点拦截 impact=critical/serious 违规。
 * 说明：App Router 页面为 async 服务端组件，需用 renderToStaticMarkup 包一层再喂
 *       给 axe（见 renderServerA11y）；真实运行须保证 CMS store 已 mock。
 * ============================================================================
 */

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

// ── 前端依赖 mock（App Router + CMS 动态读取）──
const MOCK_SITE = { companyName: "XX 科技", slogan: "s", phone: "x", email: "x", address: "x", contactName: "x" } as any;

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, ...p }: any) => React.createElement("a", p, children),
}));
jest.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("@/lib/store", () => ({ getSite: jest.fn(async () => MOCK_SITE) }));
jest.mock("@/lib/brand", () => ({ brandName: (n: string) => n }));
jest.mock("@/lib/seo", () => ({
  SITE_URL: "https://example.com",
  SITE_KEYWORDS: [],
  abs: (p: string) => p,
}));
jest.mock("qrcode", () => ({ toDataURL: jest.fn(async () => "data:image/png;base64,") }));

// 页面级服务端组件渲染辅助（骨架，真实运行需解析页面内组件依赖）
async function renderServerA11y(El: React.ReactElement) {
  const html = renderToStaticMarkup(El);
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  const results = await axe(host);
  host.remove();
  return results;
}

import PayGate from "@/components/PayGate";
import ChatWidget from "@/components/ChatWidget";
import Navbar from "@/components/Navbar";
import WorkPlayer from "@/components/WorkPlayer";

describe("a11y: 关键客户端组件（jest-axe）", () => {
  it("PayGate 默认（未开弹窗）无 critical/serious 违规", async () => {
    const { container } = render(
      <PayGate productId="demo" label="下载" onGranted={() => {}} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("PayGate 打开付费弹窗后无 critical/serious 违规", async () => {
    const { container, getByText } = render(
      <PayGate productId="demo" label="下载" onGranted={() => {}} />
    );
    fireEvent.click(getByText("下载"));
    // 真实运行需 mock /api/pay/order；begin() 失败也会打开错误态弹窗
    await waitFor(() =>
      expect(container.querySelector('[role="dialog"]') || container.querySelector(".glass")).toBeTruthy()
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("ChatWidget 默认（收起）无 critical/serious 违规", async () => {
    const { container } = render(<ChatWidget />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("ChatWidget 打开客服窗后无 critical/serious 违规", async () => {
    const { container } = render(<ChatWidget />);
    fireEvent.click(container.querySelector('[aria-label="打开智能客服"]')!);
    await waitFor(() =>
      expect(container.querySelector(".chat-panel")).toBeTruthy()
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Navbar 桌面态无 critical/serious 违规", async () => {
    const { container } = render(<Navbar site={MOCK_SITE} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Navbar 移动抽屉展开后无 critical/serious 违规", async () => {
    const { container } = render(<Navbar site={MOCK_SITE} />);
    fireEvent.click(container.querySelector('[aria-label="打开菜单"]')!);
    await waitFor(() =>
      expect(container.querySelector("#mobile-nav-menu")).toBeTruthy()
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("WorkPlayer 加载态无 critical/serious 违规", async () => {
    const { container } = render(
      <WorkPlayer id="demo" name="示例作品" subtitle="s" accessNote="n" />
    );
    // 加载态（role=status / aria-live）应在 iframe onLoad 前出现
    expect(container.querySelector('[role="status"]')).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ── 页面级（骨架，需补齐页面导入与 async 渲染）──
describe("a11y: 关键路由（页面级，骨架待补全）", () => {
  it.todo("首页 / ：jest-axe 无 critical/serious 违规");
  it.todo("作品中心 /works ：jest-axe 无 critical/serious 违规");
  it.todo("管理后台 /admin ：jest-axe 无 critical/serious 违规");
});
