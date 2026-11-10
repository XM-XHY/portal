# 测试体系说明（TESTING.md）

> 归属：流程·度量·代码审查域（何序）。状态：初始版，部分能力待同事补齐（见「当前缺口」）。
> 门禁：CI（`.github/workflows/ci.yml`）在 PR / push 到 master 时自动执行 类型检查 → Lint → 测试，任一步失败即阻断。

## 1. 测试分层

| 层级 | 类型 | 目的 | 当前状态 | 运行方式（待接入） |
|---|---|---|---|---|
| 单元测试 | Unit | 对 `lib/` 下的纯函数 / 状态机分支做隔离断言（支付、权益、鉴权、限流、哈希等 P0 函数） | **未发现**（无框架、无用例） | `npx vitest run tests/unit` |
| 冒烟测试 | Smoke | 部署后快速判定核心链路是否可达（首页/接口/支付探活） | 有手工脚本，断言不联动退出码（见 DEF-007） | `npm run test:smoke` |
| 回归测试 | Regression | 版本化套件，防旧功能被破坏；按变更面选子集 | **未发现**（无基线/套件） | `npm run test:regression` |
| 契约测试 | Contract | 前端/脚本 与 后端路由 的接口契约一致性（防 create 幂等键漂移等） | **未发现**（零资产） | `npm run test:contract`（Pact/OpenAPI） |
| 性能测试 | Performance | p95/p99 基线、阶梯加压、限流验证 | **未发现**（无 SLO/基线） | `npm run test:perf`（k6） |
| 安全测试 | Security | SAST/DAST/SCA、越权/重放/金额校验负例 | **未发现**（无配置） | semgrep + npm audit + 专项用例 |

> 兼容性测试（浏览器×设备矩阵）与无障碍测试（axe/Lighthouse）见 `SECURITY.md` 与缺陷单 DEF-019 / DEF-020。

## 2. 如何运行

```bash
# 1) 类型检查
npx tsc --noEmit

# 2) 静态检查（ESLint，独立运行，不依赖构建）
npx eslint .

# 3) 单元 / 集成测试（vitest，需同事先加入依赖与用例）
npx vitest run            # 单次
npx vitest                # watch

# 4) 覆盖率（需 @vitest/coverage-v8）
npx vitest run --coverage
```

> ⚠️ 当前 `package.json` 尚无 `test` / `vitest` 相关脚本与依赖（由同事统一补充）。
> 在补齐之前，CI 的测试步会失败——这是**预期中的门禁红灯**，不是流水线配置错误。

## 3. 门禁含义（Gate）

- **阻断（Blocker）**：任一维度存在阻断级问题，或任一 CI 步失败 → 门禁「不通过」，不得合并 / 发布。
- **严重（Major）/ 一般（Minor）**：不单独一票否决，但须登记缺陷单并排期。
- **待核实（Unverified）**：材料不足，需补充实测证据后复评。
- **准出条件**：见 [`docs/RELEASE-GATE.md`](./docs/RELEASE-GATE.md)。所有阻断级缺陷（见 `docs/defects/DEF-*.md`）清零前，不得上线。

## 4. 当前缺口（对应缺陷单）

- 无单元测试框架与用例 → DEF-001、DEF-002
- 无契约测试且 create 幂等已漂移 → DEF-003
- 冒烟断言不联动退出码、无统一入口 → DEF-007、DEF-008
- 无版本化回归套件 → DEF-009
- 无性能 / 可靠性资产 → DEF-010、DEF-011、DEF-012、DEF-013
- 无安全测试配置 → DEF-014~DEF-018
- 无兼容 / 无障碍检测资产 → DEF-019、DEF-020
- QA 流程资产全零 → DEF-022（本文件即为修复动作之一）

## 5. 缺陷闭环约定

- 每个阻断级问题一张缺陷单：`docs/defects/DEF-<nn>.md`。
- 「验证关闭」字段**留空待回填**；未经复测与回填，缺陷不得关闭。
- 修复 PR 必须在 PR 模板中关联对应 DEF 编号。
