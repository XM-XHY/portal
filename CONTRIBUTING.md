# 贡献指南（CONTRIBUTING.md）

> 归属：流程·度量·代码审查域（何序）。状态：初始版。

## 1. 开发环境

```bash
npm ci                 # 安装依赖（需 Node 22）
cp .env.example .env.local   # 本地环境变量（勿提交真实凭证）
npm run dev            # 本地开发
```

## 2. 分支与提交

- 默认保护分支：`master`。**禁止直接 push 到 master**（CI 仍会在 push 时运行作为兜底）。
- 功能 / 修复请基于 `master` 拉取短生命周期分支：`feat/xxx`、`fix/xxx`、`chore/xxx`、`qa/xxx`。
- 提交信息建议语义化：`feat: ...` / `fix: ...` / `test: ...` / `docs: ...` / `chore: ...`。
- **不得提交** `.env*`、密钥、凭证、构建产物（`node_modules/`、`.next/`）。

## 3. 提交前自查（本地必须跑）

```bash
npx tsc --noEmit      # 类型检查
npx eslint .          # 静态检查（error 必须清零；warn 需说明）
npx vitest run        # 测试（依赖与用例由同事统一补齐中）
```

## 4. 拉取请求（PR）

- 必须使用 PR 模板（`.github/PULL_REQUEST_TEMPLATE.md`）。
- 在模板中**关联缺陷编号**（如 `DEF-022`）；修复阻断级缺陷的 PR 不得遗漏关联。
- 至少 1 名 CODEOWNERS 指定 reviewer 审批后方可合并。
- CI（typecheck / lint / test）全绿是合并前提。

## 5. 缺陷闭环

- 阻断级问题统一登记在 `docs/defects/DEF-<nn>.md`。
- 缺陷「验证关闭」字段**留空待回填**；修复后经复测与验收，由验证人回填，未回填不得关闭。
- 禁止在未修复情况下关闭阻断级缺陷。

## 6. 安全约定

- 任何密钥 / 盐 / token 一律环境变量注入，禁止写死（见 `SECURITY.md`）。
- 涉及鉴权 / 支付 / 对外接口的变更，须在 PR 模板「安全自查」逐项确认。

## 7. 发布

- 发布前完成 [`docs/RELEASE-GATE.md`](./docs/RELEASE-GATE.md) 全部准出条件；阻断缺陷清零前不得上线。
- 发布须带回滚预案，发布后执行冒烟与付费链路抽检。
