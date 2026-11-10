# 无障碍（Accessibility）审计报告

> 项目：企业网站制作（Next.js 14 App Router + TypeScript + React）
> 审查人：阮清（兼容性 / 体验 / 无障碍）
> 目标标准：**WCAG 2.1 AA**
> 审计方式：**静态代码审查**（本环境未运行 axe / Lighthouse / 真机矩阵，相关自动化见配套资产）
> 配套资产：`docs/compatibility-matrix.md`、`tests/a11y/axe.test.ts`、`tests/a11y/playwright-a11y.spec.ts`、`lighthouserc.json`

---

## 0. 阻断项闭环状态（来自审查 C-01 / A-01 / A-02）

| 项 | 原问题 | 本专项处置 | 状态 |
|----|--------|-----------|------|
| C-01 | 无兼容矩阵 | 新增 `docs/compatibility-matrix.md`（浏览器/设备/分辨率/时区/语言 + 待核实状态） | ✅ 已补资产（实测待真机矩阵回填） |
| A-01 | 无 axe / pa11y / Lighthouse 配置 | 新增 `tests/a11y/axe.test.ts`（jest-axe）、`tests/a11y/playwright-a11y.spec.ts`（@axe-core/playwright）、`lighthouserc.json`（Lighthouse CI） | ✅ 已补配置（运行需 CI/真机，未实跑） |
| A-02 | skip link 目标非 `<main>` landmark | 定位到 `app/layout.tsx:144` 使用 `<div id="main">` 而非 `<main>`；**修复留给专项**（见 §1） | 🔧 已定位 + 给出修复建议（未改源码） |

> 约束：本专项**仅新增配置/文档/测试文件**，未编辑任何生产源码（尤其 `app/layout.tsx`、`app/globals.css`、`components/*`），故 A-02 的实际代码修复不在此处落地。

---

## 1. 已发现 / 可预见的 a11y 问题清单

> 严重度：🔴 阻断（WCAG AA 不达标，须修）/ 🟠 一般（建议修，多为 AAA 或体验基线）
> 修复建议均指向**专项**（不在本文件改动）。

### 1.1 🔴 A-02 skip link 目标非 `<main>` landmark
- **位置**：`app/layout.tsx:137-142`（skip link 指向 `#main`）、`app/layout.tsx:144`（`<div id="main">{children}</div>`）
- **问题**：跳过链接指向 `#main`，但目标是**普通 `<div>`**，页面**不存在 `<main>` 语义化 landmark**。屏幕阅读器无法识别主内容区；跳过链接跳到一个无语义的 div，等价于未提供「跳到主内容」能力。
- **违反**：WCAG 2.4.1 Bypass Blocks（AA）、1.3.1 Info and Relationships（A）。
- **修复建议（专项）**：将 `app/layout.tsx:144` 的 `<div id="main">` 改为 `<main id="main">`，保留 `id` 以便 skip link 锚点不变；确保全站仅一个 `<main>`。注意 `components/WorkPlayer.tsx:73` 自身渲染了 `<main>`，在 `/works/[id]` 路由下会形成 `<div id="main"><main>…</main></div>` 的嵌套——建议 WorkPlayer 内改用 `<section>` 或确保根布局的 `<main>` 不被其重复（需专项统一）。

### 1.2 🔴 PayGate 付费弹窗缺 dialog 语义与键盘支持
- **位置**：`components/PayGate.tsx:189-271`（弹窗容器 `<div className="fixed inset-0 …">`）
- **问题**：
  - 弹窗是普通 `<div>`，**无 `role="dialog"`、`aria-modal="true"`、`aria-labelledby`**（标题 `<h3>` 未关联）。屏幕阅读器不会将其识别为模态。
  - **无焦点陷阱 / 焦点管理**：打开后焦点未移入、Tab 可逃出弹窗。
  - **无 ESC 关闭**（对比 `Navbar.tsx:33`、`ChatWidget.tsx:177` 均实现了 ESC，此处缺失，键盘用户只能点「取消」）。
  - 背景内容未 `inert`/`aria-hidden`，读屏仍会朗读背后内容。
- **违反**：WCAG 4.1.2 Name, Role, Value（A）、2.1.1 Keyboard（A）、2.4.3 Focus Order（A）。
- **修复建议（专项）**：改用原生 `<dialog>` 或加 `role="dialog" aria-modal="true" aria-labelledby={titleId}`；打开时 `inert` 背景、焦点移入、ESC 关闭、关闭后焦点回原触发按钮；标题 `<h3>` 设 `id` 并 `aria-labelledby` 指向它。

### 1.3 🔴 ChatWidget 客服窗缺 dialog 语义 + 消息列表缺 aria-live
- **位置**：`components/ChatWidget.tsx:284`（客服面板 `<div className="chat-panel …">`）、`:303`（消息列表 `<div ref={listRef} …>`）
- **问题**：
  - 客服面板为裸 `<div>`，**无 `role="dialog"` / `aria-labelledby`**，读屏无法识别这是对话窗口。
  - 消息列表**无 `role="log"` 与 `aria-live="polite"`**：新消息（尤其助手回复、加载态 `loading` 三点）到达时屏幕阅读器**不会播报**（违反状态消息要求）。
- **违反**：WCAG 4.1.2（A）、4.1.3 Status Messages（AA）。
- **修复建议（专项）**：面板加 `role="dialog" aria-labelledby={headerId}`（header 内「智能客服 Copilot」设 `id`）；消息列表容器加 `role="log" aria-live="polite" aria-relevant="additions text"`。
- **已做得好的点**：`:177` 已处理 ESC、`:262/:299/:366` 按钮均有 `aria-label`、输入框有 `placeholder`——应保留。

### 1.4 🔴 Navbar 移动抽屉收起时内容仍在可访问性树 / 可聚焦
- **位置**：`components/Navbar.tsx:93-128`（抽屉容器仅靠 `grid-rows-[0fr] opacity-0` 收起）
- **问题**：收起态仅用 `opacity-0` + `grid-rows-[0fr]` 折叠高度，**元素仍在 DOM 且未被 `hidden` / `display:none` / `aria-hidden`**。键盘 Tab 仍可聚焦到收起菜单里的链接，读屏也会朗读——与「视觉已隐藏」不一致。
- **违反**：WCAG 1.3.1（A）、2.1.1 Keyboard（A）。
- **修复建议（专项）**：收起时给抽屉内容加 `hidden`（或 `aria-hidden="true"` + `inert`），展开再移除；或在 `open` 为 false 时直接不渲染 `<ul id="mobile-nav-menu">`（注意保留 `aria-controls` 指向存在元素或用条件渲染 + 动态控件）。

### 1.5 🟠 aria-live 缺失（动态状态 / 错误播报）
- **位置**：`components/PayGate.tsx:202`（错误提示 `<div className="…text-red-300">`）、`components/ChatWidget.tsx:303`（消息列表，见 1.3）
- **问题**：付费错误、状态变化无 `role="status"` / `aria-live`，读屏用户难以感知「订单超时 / 支付成功 / 申报失败」。
- **违反**：WCAG 4.1.3 Status Messages（AA）。
- **修复建议（专项）**：错误/状态区加 `role="status" aria-live="polite"`（PayGate 的错误块、ChatWidget 消息列表）。

### 1.6 🟠 装饰性语义需确认（多数已 aria-hidden，需复查）
- **位置**：`components/ChatWidget.tsx:268,291,325-329`（emoji/动画点）、`components/Navbar.tsx:88`（☰ 图标）、`components/WorkPlayer.tsx:84,96,105,115`（← ⟳ ⛶ ↗ 图标）
- **现状**：上述装饰图标大多已用 `aria-hidden`（如 `WorkPlayer.tsx` 的图标 `<span aria-hidden>`、按钮本体带 `aria-label`），**方向正确**。
- **风险点**：确保所有纯装饰元素（emoji、动画圆点、分隔线 `<span aria-hidden className="w-px">`）均 `aria-hidden`，且**承载语义的图标**必须有配套文本/`aria-label`（当前均已满足，列为回归看护项）。
- **违反（若漏标）**：WCAG 1.1.1 Non-text Content（A）、4.1.2（A）。

### 1.7 🟠 触控目标基线 44px（WCAG 2.5.5，AAA 基线 / iOS HIG）
- **位置**：
  - `components/ChatWidget.tsx:365` 发送按钮 `h-10 w-10` = **40px**（低于 44px，且非 `.btn-*` 类，不享受 44px 规则）。
  - `components/ChatWidget.tsx:340` 快捷提问 chips `min-h-[36px]` = **36px**（低于 44px）。
  - `app/globals.css:111-135`：`.btn-primary/.btn-ghost` 的 `min-height:44px` **仅在 `@media (max-width: 767px)` 内生效**，即 iPad（≥768）/ 桌面触摸设备不保证 44px。
- **问题**：发送按钮、快捷 chips 在任意断点都 <44px；且 44px 规则被 `≤767px` 限制，iPad 竖屏（768）与桌面触摸失去保障。PayGate 按钮、底部悬浮 CTA 因使用 `.btn-*` 在 ≤767px 满足 44px（良好）。
- **基线依据**：WCAG 2.5.5 Target Size（AAA，但作为移动体验基线广泛采用）、iOS HIG 44pt。
- **修复建议（专项）**：ChatWidget 发送按钮改 `h-11 w-11`（44px）或加 `min-h-11`；快捷 chips 改 `min-h-[44px]`；将 globals.css 的 44px 规则从 `max-width:767px` 放宽到覆盖 iPad/触摸（如 `@media (pointer: coarse)` 或 `max-width:1024px`）。

### 1.8 ✅ 已达标 / 良好实践（保留，勿回退）
- `components/WorkPlayer.tsx:73` 使用语义化 `<main>`；`:124-125` 加载态 `role="status" aria-live="polite"`（正确）；`:136` iframe 带 `title`。
- `app/layout.tsx:129` `<html lang="zh-CN">` 合规；`:74-81` viewport 未禁用缩放（不写 `user-scalable=no`，符合可访问性）。
- `components/Navbar.tsx:80-88` 菜单按钮 `aria-label` + `aria-expanded` + `aria-controls` 关联正确（可保留，仅收起态可见性见 1.4）。
- `components/ChatWidget.tsx:177` ESC 关闭、`:262/:299/:366` 按钮 `aria-label` 完整。

---

## 2. 修复建议汇总（专项落地清单）

| # | 文件:行 | 修复动作 | 对应 WCAG |
|---|---------|----------|-----------|
| 1 | `app/layout.tsx:144` | `<div id="main">` → `<main id="main">`（并协调 WorkPlayer 的嵌套 `<main>`） | 2.4.1 / 1.3.1 |
| 2 | `components/PayGate.tsx:189-271` | 加 `role="dialog" aria-modal aria-labelledby`；焦点陷阱；ESC 关闭；背景 `inert` | 4.1.2 / 2.1.1 / 2.4.3 |
| 3 | `components/ChatWidget.tsx:284,303` | 面板 `role="dialog" aria-labelledby`；消息列表 `role="log" aria-live="polite"` | 4.1.2 / 4.1.3 |
| 4 | `components/Navbar.tsx:93-128` | 收起态加 `hidden`/`aria-hidden`/`inert` | 1.3.1 / 2.1.1 |
| 5 | `components/PayGate.tsx:202` | 错误/状态块加 `role="status" aria-live="polite"` | 4.1.3 |
| 6 | 装饰图标 | 确保纯装饰 `aria-hidden`、语义图标有文本（现状良好，回归看护） | 1.1.1 / 4.1.2 |
| 7 | `components/ChatWidget.tsx:340,365` + `app/globals.css:111-135` | 发送按钮/快捷 chips 提到 44px；44px 规则放宽到触摸设备 | 2.5.5 |

---

## 3. 本专项所需 devDependencies（勿在此环境安装）

> ⚠️ **不要运行 `npm install` 或 `npx playwright install` 下载浏览器**（过重）。以下依赖仅作清单，由专项 / CI 统一加装与配置；**不要修改 `package.json` 的 scripts**（他人统加）。

| 依赖 | 用途 | 对应资产 |
|------|------|----------|
| `jest` | 单元测试运行器（jest-axe 宿主） | `tests/a11y/axe.test.ts` |
| `jest-environment-jsdom` | jest 的 DOM 环境 | 同上 |
| `ts-jest`（或 `babel-jest`） | 转译 ts/tsx | 同上 |
| `@testing-library/react` | 渲染组件做 axe | 同上 |
| `@testing-library/jest-dom` | 断言辅助 | 同上 |
| `jest-axe` | a11y 规则断言 | `tests/a11y/axe.test.ts` |
| `@playwright/test` | E2E + 浏览器矩阵 | `tests/a11y/playwright-a11y.spec.ts` |
| `@axe-core/playwright` | 在 Playwright 中跑 axe | 同上 |
| `lighthouse` | 本地 Lighthouse 审计 | `lighthouserc.json` |
| `@lhci/cli` | Lighthouse CI（断言 + 报告） | `lighthouserc.json` |

可选：`pa11y`（命令行 axe 审计，作为 CI 轻量替代，对应 A-01 中「pa11y」诉求；本专项以 jest-axe + @axe-core/playwright + Lighthouse 覆盖，pa11y 可按需追加脚本）。

---

## 4. 自动化资产与断言口径

- **jest-axe（单元级）** `tests/a11y/axe.test.ts`：`expect(await axe(container)).toHaveNoViolations()`；覆盖 PayGate/ChatWidget/Navbar/WorkPlayer 关键态 + 页面级 `it.todo` 骨架。**未实跑**（无 jest 环境）。
- **@axe-core/playwright（E2E 级）** `tests/a11y/playwright-a11y.spec.ts`：对 `/`、`/works`、`/admin`、PayGate、ChatWidget、Navbar 抽屉、WorkPlayer 加载态跑 axe，`withTags(['wcag2a','wcag2aa','wcag21aa'])`，断言 `impact` 为 `critical`/`serious` 的违规数 = 0 阻断。**未实跑**（无浏览器）。
- **Lighthouse CI** `lighthouserc.json`：`assertions["categories:accessibility"]` 设 `minScore:1`（即无障碍类目零失败，等价于 critical/serious 不通过即阻断）；另对 `color-contrast`、`image-alt`、`link-name`、`button-name`、`label`、`aria-*`、`bypass`、`html-has-lang` 等单项设 `error`。JSON 不支持注释，`upload.target` 默认 `temporary-public-storage`，可改为内部存储或省略。

> 说明：Lighthouse 不暴露「critical/serious」分级计数，`minScore:1` 是「无障碍类目满分（无失败审计）」的等价拦截口径；如需严格按 axe 的 critical/serious 分级拦截，以 `@axe-core/playwright` 资产为准。

---

## 5. 待核实项（需专项 / 真机 / 用户研究补齐）

- ⚠️ **兼容性实测**：本环境无任何浏览器/真机实测，所有矩阵格子为「待核实」（`docs/compatibility-matrix.md`），须在隔离矩阵环境回填。
- ⚠️ **可用性测试（真实用户证据）**：本专项为静态审查，**未做可用性测试**，无关键任务完成率/阻碍点数据，按职责标注「待核实」，需用户组织可用性测试或启发式评估。
- ⚠️ **屏幕阅读器实测**：NVDA / VoiceOver / JAWS 实测未执行，上述问题基于代码与 WCAG 推导。
- ⚠️ **i18n / RTL**：当前仅 `zh-CN`，无多语言/RTL 适配（见兼容矩阵 §5）。
