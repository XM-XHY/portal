# 兼容性测试矩阵（Compatibility Matrix）

> 项目：企业网站制作（Next.js 14 App Router + TypeScript + React）
> 负责：阮清（兼容性 / 无障碍 / 体验审查）
> 目标基线：覆盖真实用户环境，验证「换个环境还能不能用、用起来顺不顺」。

## 0. 状态说明（重要）

| 状态值 | 含义 |
|--------|------|
| ✅ 实测 | 已在对应浏览器/设备/分辨率组合上实跑并出结论 |
| ⚠️ 待核实 | **尚未实测**，仅列出计划覆盖的组合，需在隔离的真机 / 浏览器矩阵环境执行后回填结论 |

本项目当前**没有任何兼容性实测数据**，因此下表所有格统一标 **⚠️ 待核实**，并须在隔离真机 / 浏览器农场（如云测平台、BrowserStack / Sauce Labs、内部真机实验室）执行后回填「实测 / 通过 / 不通过」。本环境（开发机）**不替代**真机矩阵，禁止以本机单浏览器通过来声称「全矩阵兼容」。

---

## 1. 浏览器矩阵（最近 2 大版本）

| 浏览器 | 覆盖版本 | 内核 / 备注 | 状态 |
|--------|----------|-------------|------|
| Chrome | 130, 129 | Blink（基准） | ⚠️ 待核实 |
| Edge | 130, 129 | Blink（Chromium） | ⚠️ 待核实 |
| Safari | 18, 17 | WebKit（含 iOS / macOS） | ⚠️ 待核实 |
| Firefox | 131, 130 | Gecko | ⚠️ 待核实 |

> 说明：Safari 17/18 重点验证 `env(safe-area-inset-*)`、`dvh`/`100dvh`、 backdrop-filter、`<dialog>` 与 `requestFullscreen`（iOS Safari 不支持元素级全屏，已有降级分支，见 `components/WorkPlayer.tsx`）。
> Firefox 重点验证 `grid-rows-[0fr]→[1fr]` 高度动画、`backdrop-filter` 与 `aspect-ratio`。

---

## 2. 设备矩阵

| 类别 | 机型 / 形态 | 代表视口 | 状态 |
|------|------------|----------|------|
| iOS 手机 | iPhone 15 / 14 / 13（Safari） | 390 / 393 | ⚠️ 待核实 |
| iOS 小屏 | iPhone SE（3rd） | 375 | ⚠️ 待核实 |
| Android 手机 | 三星 Galaxy S24 / S23、小米 14、华为（Chrome / 系统 WebView） | 360–412 | ⚠️ 待核实 |
| iPad | iPad（10th）/ iPad Air（竖屏） | 768 / 810 | ⚠️ 待核实 |
| iPad | iPad Pro 11″（横屏） | 1024 / 1194 | ⚠️ 待核实 |
| 桌面 | Windows / macOS（Chrome / Edge / Firefox / Safari） | 1280–1440 | ⚠️ 待核实 |

> 重点交互：移动端悬浮客服球拖拽（`components/ChatWidget.tsx`）、移动端导航抽屉（`components/Navbar.tsx`）、付费弹窗二维码扫码（`components/PayGate.tsx`）、作品全屏体验 `WorkPlayer`（`components/WorkPlayer.tsx`）。

---

## 3. 分辨率矩阵

| 分辨率 (宽 px) | 代表场景 | 重点验证 | 状态 |
|----------------|----------|----------|------|
| 375 | iPhone SE / 小屏安卓（最窄主流） | 无横向溢出、悬浮球与底部 CTA 不重叠、抽屉可用 | ⚠️ 待核实 |
| 768 | iPad 竖屏 / 小屏笔记本 | 导航从抽屉切换到桌面横向、布局不断裂 | ⚠️ 待核实 |
| 1024 | iPad 横屏 / 常规笔记本 | 双栏 / 多栏内容正常、iframe 体验页完整 | ⚠️ 待核实 |
| 1440 | 桌面主流宽度 | 最大宽度容器 `max-w-7xl` 居中、留白合理 | ⚠️ 待核实 |

---

## 4. 时区矩阵

| 时区 | 代表 | 验证点 | 状态 |
|------|------|--------|------|
| `Asia/Shanghai` (UTC+8) | 国内用户（默认） | 日期 / 时间 / 数字格式符合中文习惯 | ⚠️ 待核实 |
| `UTC` / `Europe/London` (UTC+0) | 海外 / 评审 | 时间格式化不串时区、不出现 NaN | ⚠️ 待核实 |
| `America/New_York` (UTC-5/-4) | 海外 | 同上，验证 `Intl`/服务端渲染时区一致 | ⚠️ 待核实 |

> 站点内容由后台 CMS 动态维护、强制 `dynamic = "force-dynamic"`（`app/layout.tsx:13`），需确认时区相关展示在服务端渲染与客户端水合后保持一致，避免 hydration mismatch。

---

## 5. 语言矩阵

| 语言 / 区域 | 支持情况 | 验证点 | 状态 |
|------------|----------|--------|------|
| `zh-CN` | 主语言（`<html lang="zh-CN">`，`app/layout.tsx:129`） | 默认文案、CMS 内容、无障碍标签 | ⚠️ 待核实 |
| 其他语言（en 等） | **当前未实现 i18n 脚手架** | 仅验证 `lang` 属性正确、未出现乱码 / 未翻译残留 | ⚠️ 待核实（i18n 缺口） |

> 风险：项目无多语言 / RTL 适配（未引入 `next-intl` 等）。如需出海，须在专项补齐 i18n 与 RTL（如 `dir="rtl"`、镜像布局）。当前矩阵仅验证 `zh-CN` 主路径与 `lang` 属性合规。

---

## 6. 响应式与降级验证

| 场景 | 验证点 | 状态 |
|------|--------|------|
| 小屏（≤375） | 无横向滚动、触控目标 ≥44px、抽屉 / 弹窗可操作 | ⚠️ 待核实 |
| 弱网 | 骨架 / 加载态（如 `WorkPlayer` 的 `role="status"`）及时出现且不假死 | ⚠️ 待核实 |
| 老版本浏览器（Safari 17 / Firefox 130） | `backdrop-filter`、`100dvh`、`grid` 动画、`aspect-ratio` 有可用降级 | ⚠️ 待核实 |
| 禁用 JS / 水合失败 | 关键内容（CMS 文案、导航、CTA）仍可访问；非阻断 | ⚠️ 待核实 |

---

## 7. 执行与回填

- **执行环境**：隔离真机 / 浏览器矩阵（禁止以本开发机单浏览器通过冒充实测）。
- **执行工具**：手动真机 + 云测平台 + 自动化（Playwright 多浏览器，见 `tests/a11y/playwright-a11y.spec.ts`）。
- **回填动作**：将每个 ⚠️ 待核实 改为 ✅ 实测 / 通过 / 不通过，并附执行批次号与设备/浏览器版本。
- **配套资产**：无障碍自动化见 `tests/a11y/`（`axe.test.ts`、`playwright-a11y.spec.ts`、`audit.md`）与 `lighthouserc.json`。
