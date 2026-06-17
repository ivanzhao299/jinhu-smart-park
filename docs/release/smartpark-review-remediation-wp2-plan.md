# SmartPark WP2 CI / 测试 / Coverage 基础设施工作计划

生成日期：2026-06-17

建议分支：`docs/wp2-ci-test-coverage-plan`

## 1. 目的

WP2 对应 `docs/release/smartpark-review-remediation-plan.md` 中的 R3，优先级为 P1，短期。

WP2 的目标是补齐 CI、测试入口和 coverage 基础设施，让后续 P1 风险修复具备稳定、快速、可阻断的测试门禁。本阶段只制定计划，不修改 CI、package 脚本、测试代码或业务代码。

本计划文档本身不代表测试门禁已完成，不代表 coverage 已接入，不代表 CI 已增强。后续实施应独立建分支、独立提交、独立验证，避免混入 WP3-WP8 的业务安全、权限、财务、文件、IoT 或架构治理修复。

## 2. 背景

WP0 已恢复首发回归入口，WP1 已修复 Docker / release-smoke 阻塞。下一步需要让后续 P1 风险修复具备稳定测试基础，避免认证、权限、财务一致性、文件安全、IoT / WebSocket / 外部调用等整改缺少快速回归入口。

当前总计划记录 WP2 需要新增 `test:unit`，接入 API `.spec.ts`，明确测试脚本语义，并补齐 coverage / `test:coverage` 脚本和 artifact。

当前只读检查得到的现状：

- 根包 `test` 当前指向 `test:e2e`，而 `test:e2e` 会串行执行多个 `scripts/e2e/*.mjs` smoke 脚本，不适合作为默认快速 unit 门禁。
- 根包、API 包、Web 包当前未发现 `coverage` / `test:coverage` 脚本。
- API 包当前未定义 `test` / `test:unit` 脚本，但仓库已有 4 个 API `.spec.ts` 文件。
- Web、shared、ui 包当前仅定义 `build`、`lint`、`typecheck` 等基础脚本。
- 当前未发现 `vitest.config.*`、`jest.config.*`、`playwright.config.*` 或 coverage 配置文件。
- 当前存在 `apps/web/coverage/coverage-final.json` 这样的 coverage 产物，后续需要明确 coverage 输出、artifact 和生成目录排除策略。

需人工确认的事项：

- WP2 采用 Vitest、Jest，还是沿用 NestJS 生态常见 Jest 配置。
- coverage 初期是否设置阈值；如设置，阈值数值和阻断策略需人工确认。
- Web 组件测试是否纳入 WP2 第一批，还是先保 API `.spec.ts` 和共享包基础测试入口。

## 3. 输入依据

| 输入文件 | 用途 |
|---|---|
| `docs/release/smartpark-review-remediation-plan.md` | WP2 来源、R3/P1 定级、短期整改顺序、CI/CD 门禁分层建议 |
| `docs/release/smartpark-review-remediation-wp0-plan.md` | 确认 WP0 已聚焦首发回归入口，避免 WP2 回头修改菜单 contract |
| `docs/release/smartpark-review-remediation-wp1-plan.md` | 确认 WP1 已聚焦 Docker / release-smoke，避免 WP2 混入 release-smoke 修复 |
| `.github/workflows/ci.yml` | 当前 CI verify 和 release-smoke job 现状、触发条件、artifact 方式 |
| `package.json` | 根包脚本语义、当前 `test` / `test:e2e` / `lint` / `typecheck` / `build` 入口 |
| `apps/api/package.json` | API workspace 当前脚本和测试入口缺口 |
| `apps/web/package.json` | Web workspace 当前脚本和测试入口缺口 |
| `packages/shared/package.json` | shared workspace 当前脚本和测试入口缺口 |
| `packages/ui/package.json` | ui workspace 当前脚本和测试入口缺口 |
| `pnpm-workspace.yaml` | workspace 范围：`apps/*` 和 `packages/*` |
| 当前测试配置文件 | 当前未发现 `vitest.config.*`、`jest.config.*`、`playwright.config.*`；后续新增需在实现阶段确认 |
| API `.spec.ts` 文件 | 当前存在 `apps/api/src/shared/guards/idempotency-key.guard.spec.ts`、`apps/api/src/shared/services/idempotency.service.spec.ts`、`apps/api/src/shared/services/idempotency-cleanup.service.spec.ts`、`apps/api/src/shared/interceptors/idempotency.interceptor.spec.ts` |

## 4. WP2 四阶段计划

### 4.1 计划阶段

计划阶段只读确认以下内容，不修改任何文件：

- 当前 CI `verify` 做了什么：安装依赖、`pnpm lint`、`pnpm --filter @jinhu/shared build`、`pnpm typecheck`、`pnpm build`。
- 当前 `release-smoke` 已独立存在，触发条件为 `workflow_dispatch` 或 PR 带 `run-release-smoke` label，且依赖 `verify`。
- 当前根包有哪些测试相关命令：`test` 指向 `test:e2e`，`test:e2e` 指向多个 E2E smoke 脚本，另有多个 `test:e2e:*` 子入口。
- 各 workspace package 有哪些测试相关命令：API、Web、shared、ui 当前均未定义 `test:unit` 或 `test:coverage`。
- 当前 unit / coverage 入口缺口：已有 API `.spec.ts` 但无可执行 unit runner；coverage 配置和脚本缺失。
- 哪些测试适合默认门禁：lint、typecheck、build、快速 unit。
- 哪些测试需要手动、nightly 或 release label 触发：release-smoke、first-release regression、E2E smoke、财务并发、安全专项和依赖 DB / Docker 的验证。

计划阶段产出应是本计划文档和后续实现拆分建议，不应声称 CI、coverage 或 unit 门禁已经接入。

### 4.2 实现阶段

后续实施应分小步推进：

1. 先明确测试脚本语义。
2. 再新增 `test:unit`。
3. 再补齐 coverage / `test:coverage`。
4. 再考虑 CI `verify` 是否接入。

避免一次性把所有测试、coverage、E2E、release-smoke 都塞进默认 CI。建议拆分为以下可审查小步：

| 小步 | 目标 | 说明 |
|---|---|---|
| package 脚本语义梳理 | 明确 `test`、`test:unit`、`test:e2e`、`test:coverage` 的职责 | 需避免把当前 E2E 链路误当作快速 unit |
| root `test:unit` 入口 | 根包提供统一快速单测入口 | 应可在本地和 CI `verify` 中执行 |
| API `.spec.ts` 接入 | 让现有 API `.spec.ts` 被 unit runner 发现并执行 | 当前有 4 个 API `.spec.ts`，需确认测试框架和 ts transpile 策略 |
| coverage / `test:coverage` 入口 | 提供可重复生成 coverage 的命令 | 初期可先生成 artifact，阈值是否阻断需人工确认 |
| coverage artifact | 在 CI 中上传 coverage 报告 | 需控制输出路径和 artifact 大小 |
| CI `verify` 门禁接入 | 评估将 `pnpm test:unit` 纳入默认 verify | 先接快速 unit，不混入 DB / Docker / E2E |

### 4.3 验证阶段

无副作用或轻量验证：

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:coverage
```

说明：

- `pnpm test:unit` 和 `pnpm test:coverage` 是新增后执行命令，当前计划阶段不假设它们已经存在。
- coverage 可能耗时更长并生成 coverage 文件，但通常不写 DB。
- `pnpm build` 可能耗时较长，但属于静态构建验证。

可能较重或需另行确认的验证：

```bash
pnpm -r test
pnpm -r test:coverage
node scripts/e2e/first-release-regression.mjs
```

说明：

- `pnpm -r test` / `pnpm -r test:coverage` 可能受 workspace 脚本缺失影响，接入策略需先设计。
- `first-release-regression`、release-smoke 和 E2E smoke 不应在 WP2 默认 unit 门禁中执行，除非另行确认。

### 4.4 风险与回滚阶段

主要风险：

- CI 耗时过长，影响 PR 反馈速度。
- 测试脚本语义混乱，导致 `test`、`test:unit`、`test:e2e` 职责不清。
- coverage 阈值过早阻塞 PR，拖慢 P1 风险修复。
- 把 release-smoke / E2E 混入默认 `verify`。
- 不同 workspace 测试框架不一致，增加维护成本。
- coverage 输出或 artifact 过大。
- 后续 WP3-WP8 修复被 WP2 基础设施变化阻塞。

回滚原则：

- package 脚本新增失败时，优先回退脚本和配置，不修改业务代码绕过测试。
- CI 接入导致误阻断时，可先从 `verify` 移除 `pnpm test:unit` 或改为非阻断 job，再保留本地命令。
- coverage 阈值导致大面积阻塞时，先保留 artifact，阈值改为后续阶段逐步收紧。
- 若 E2E / release-smoke 被误接入默认 unit，回退 CI job 或 package script 语义。

## 5. 范围与边界

### 5.1 后续拟修改范围

| 文件 / 范围 | 可能用途 | 说明 |
|---|---|---|
| `package.json` | 新增或调整 root `test:unit`、`test:coverage`、测试脚本语义 | 实施阶段需单独提交，不在本计划阶段修改 |
| `apps/api/package.json` | 新增 API unit / coverage 入口 | 需接入现有 `.spec.ts` |
| `apps/web/package.json` | 如纳入 Web 测试，新增 Web unit / coverage 入口 | 是否第一批纳入需人工确认 |
| `packages/shared/package.json` | 如 shared 有测试，新增 unit / coverage 入口 | 当前未发现测试文件 |
| `packages/ui/package.json` | 如 ui 有测试，新增 unit / coverage 入口 | 当前未发现测试文件 |
| `.github/workflows/ci.yml` | 将 unit / coverage job 接入 CI verify 或独立 job | 需先评估耗时和失败影响 |
| `vitest.config.*` / `jest.config.*` | 配置测试框架、匹配规则、coverage provider | 当前未发现现有配置，框架选择需人工确认 |
| 必要的测试辅助配置 | ts transpile、module alias、coverage include/exclude | 不应包含真实密钥、密码、token、生产连接串 |

### 5.2 禁止修改范围

WP2 不应修改：

- 业务功能代码，除非只是为测试配置暴露必要入口且经过确认。
- 数据库 migration / seed。
- Dockerfile / compose。
- release-smoke 业务流程。
- 首发菜单 contract。
- WP3-WP8 风险修复代码。
- snapshot baseline。
- 真实密钥、密码、token、连接串。

本计划阶段进一步禁止修改：

- `.github/workflows/**`
- `scripts/**`
- `scripts/e2e/snapshots/**`
- `apps/**`
- `packages/**`
- `database/**`
- `infra/**`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- 业务代码和测试代码

## 6. 只读预检命令

计划阶段建议执行以下只读命令：

```bash
git status --short
git branch --show-current
rg -n "\"test|test:unit|test:e2e|test:coverage|coverage|lint|typecheck|build\"" package.json apps packages .github
rg -n "vitest|jest|coverage|playwright" . -g '!node_modules' -g '!.next' -g '!dist' -g '!coverage'
sed -n '1,220p' .github/workflows/ci.yml
sed -n '1,220p' package.json
sed -n '1,220p' apps/api/package.json
sed -n '1,220p' apps/web/package.json
sed -n '1,220p' packages/shared/package.json
sed -n '1,220p' packages/ui/package.json
rg --files -g '*.spec.ts' -g '*.test.ts' -g '*.spec.tsx' -g '*.test.tsx' apps packages
find . -maxdepth 4 \( -path './node_modules' -o -path './.next' -o -path './dist' -o -path './coverage' \) -prune -o \( -name 'vitest.config.*' -o -name 'jest.config.*' -o -name 'playwright.config.*' \) -print
```

注意避免读取 `node_modules`、`.next`、`dist`、`coverage` 等生成目录，避免把生成产物当作源码配置依据。

## 7. WP2 与后续 WP3-WP8 的关系

WP2 是测试基础设施，不直接修业务风险。

WP3 认证安全、WP4 权限治理、WP5 财务一致性等需要依赖 WP2 提供稳定测试入口。WP2 不应混入认证、权限、财务、文件、IoT 等业务安全修复，也不应借新增测试配置顺手改业务逻辑。

WP2 完成后，后续 P1 工作包更容易纳入测试门禁：

- WP3 可将认证与会话安全单测挂到 `test:unit`。
- WP4 可将权限、模块授权、数据范围、字段权限单测挂到 `test:unit`。
- WP5 可将金额、幂等、状态机、财务一致性单测挂到 `test:unit`，较重并发验证仍保留为专项 smoke。
- WP6-WP8 可根据风险类型选择 unit、coverage、nightly、release label 或手动触发。

## 8. 执行步骤

### 步骤 1：确认当前测试脚本和 CI verify 现状

| 项目 | 内容 |
|---|---|
| 目的 | 明确 WP2 起点，避免把当前 E2E `test` 误接到默认 CI |
| 输入 | `.github/workflows/ci.yml`、`package.json`、workspace package 文件 |
| 操作 | 只读检查 CI jobs、根包和 workspace 脚本 |
| 产出 | 当前命令语义表和缺口清单 |
| 验收标准 | 能明确说明 `verify` 当前不跑 unit，根包 `test` 当前是 E2E 链路 |

### 步骤 2：定义测试命令语义

| 项目 | 内容 |
|---|---|
| 目的 | 防止 `test`、`test:unit`、`test:e2e`、`test:coverage` 混淆 |
| 输入 | 当前脚本、总计划 CI/CD 门禁建议、团队约定 |
| 操作 | 设计 root 和 workspace 脚本命名规则；确认 `test` 是否保留为 E2E 或改为快速 unit |
| 产出 | 脚本语义决策记录 |
| 验收标准 | 每个测试命令都有明确用途、运行范围、是否写 DB、是否适合默认 CI |

### 步骤 3：设计 root `test:unit` 入口

| 项目 | 内容 |
|---|---|
| 目的 | 提供本地和 CI 可执行的快速单测入口 |
| 输入 | workspace 范围、API `.spec.ts`、潜在 shared/ui/web 测试 |
| 操作 | 设计 root script 调用方式，例如按 workspace filter 或统一 test runner |
| 产出 | root `test:unit` 实施方案 |
| 验收标准 | 新增后 `pnpm test:unit` 可执行，且不启动 Docker / DB / release-smoke |

### 步骤 4：接入 API `.spec.ts` 到 unit 入口

| 项目 | 内容 |
|---|---|
| 目的 | 让现有 API `.spec.ts` 真正进入可执行单测 |
| 输入 | 4 个 API `.spec.ts` 文件、API tsconfig、测试框架选择 |
| 操作 | 新增 API 测试 runner 配置和 `apps/api/package.json` 脚本 |
| 产出 | API unit 命令 |
| 验收标准 | 新增后 API `.spec.ts` 被发现并执行；失败时能阻断 `pnpm test:unit` |

### 步骤 5：设计 coverage / `test:coverage` 入口

| 项目 | 内容 |
|---|---|
| 目的 | 统一 coverage 生成方式，服务后续风险修复质量评估 |
| 输入 | 测试框架、coverage provider、include/exclude 范围 |
| 操作 | 设计 root 和 workspace coverage 脚本；明确是否先不设阈值 |
| 产出 | coverage 命令和输出路径方案 |
| 验收标准 | 新增后 `pnpm test:coverage` 可生成可上传的 coverage 报告 |

### 步骤 6：设计 coverage artifact 输出

| 项目 | 内容 |
|---|---|
| 目的 | 让 CI 中的 coverage 结果可下载、可审计 |
| 输入 | `.github/workflows/ci.yml`、coverage 输出目录 |
| 操作 | 设计 upload-artifact 步骤和 artifact 命名；排除过大或无关目录 |
| 产出 | CI artifact 策略 |
| 验收标准 | artifact 路径明确；生成目录不会被提交；大小和保存周期可控 |

### 步骤 7：评估 CI verify 接入策略

| 项目 | 内容 |
|---|---|
| 目的 | 决定 unit / coverage 如何进入 CI，避免误阻断 |
| 输入 | 本地耗时、失败率、团队风险接受度 |
| 操作 | 先将 `pnpm test:unit` 接入 `verify`；coverage 可先独立 job 或非阻断，再视稳定性升级 |
| 产出 | CI 接入决策 |
| 验收标准 | 默认 `verify` 保持快速、无 DB、无 Docker；coverage 阈值是否阻断有明确结论 |

### 步骤 8：运行本地验证

| 项目 | 内容 |
|---|---|
| 目的 | 在提交前确认新增脚本和配置可用 |
| 输入 | 实施后的 package 脚本、测试配置、CI 修改 |
| 操作 | 执行 `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test:unit`、必要时 `pnpm test:coverage` |
| 产出 | 验证结果记录 |
| 验收标准 | 命令通过；如 coverage 未执行，需记录原因和后续执行条件 |

### 步骤 9：更新 PR 描述和风险说明

| 项目 | 内容 |
|---|---|
| 目的 | 让 reviewer 明确 WP2 只改测试基础设施 |
| 输入 | diff、验证结果、未纳入范围 |
| 操作 | 按第 12 节模板填写 PR 描述 |
| 产出 | 清晰 PR 描述 |
| 验收标准 | 明确写出不包含业务安全修复、不包含 release-smoke / Docker 修复、不修改 DB / seed / migration |

### 步骤 10：根据 CI 结果决定是否调整门禁范围

| 项目 | 内容 |
|---|---|
| 目的 | 防止新门禁在初期产生大面积误阻断 |
| 输入 | CI 运行结果、耗时、失败摘要 |
| 操作 | 如果 `test:unit` 稳定则保留在 `verify`；如果 coverage 不稳定则先改为 artifact-only 或手动触发 |
| 产出 | 最终门禁范围结论 |
| 验收标准 | CI 失败能准确指向测试问题，而不是脚本语义或环境污染 |

## 9. 验收命令

当前可执行：

```bash
pnpm lint
pnpm typecheck
pnpm build
```

新增后执行：

```bash
pnpm test:unit
pnpm test:coverage
```

如后续文档或 PR 提到 package 级命令，应标记为“新增后执行”，不要假设当前已经存在。例如：

```bash
pnpm --filter @jinhu/api test:unit
pnpm --filter @jinhu/api test:coverage
pnpm --filter @jinhu/web test:unit
pnpm --filter @jinhu/web test:coverage
```

上述 package 级命令当前均需在实施阶段确认或新增后再执行。

## 10. 需要用户确认后才执行的命令

以下命令可能耗时较长、影响 CI 运行时间，或需要先明确脚本语义：

```bash
pnpm test:coverage
pnpm -r test
pnpm -r test:coverage
```

说明：

- 这些命令通常不写 DB，但可能耗时较长。
- CI 接入前需确认耗时和失败影响。
- 不应在 WP2 中启动 Docker / DB / release-smoke，除非另行确认。
- 不应在 WP2 中运行完整 E2E / first-release regression 作为默认门禁，除非另行确认。

## 11. 风险与回滚

| 风险 | 影响 | 缓解 | 回滚 |
|---|---|---|---|
| CI 时间增加 | PR 反馈变慢，开发者绕过门禁 | 先只接快速 unit；coverage 独立 job 或非阻断 | 从 `verify` 移除新增步骤，保留本地命令 |
| coverage 阈值过高导致 PR 阻塞 | P1 风险修复被基础设施阻断 | 初期先 artifact-only 或低阈值，阈值需人工确认 | 降低或移除阈值，保留报告 |
| 测试脚本命名不清 | `test`、`test:unit`、`test:e2e` 被误用 | 在 package 脚本和文档中明确语义 | 回退脚本命名调整，重新拆分 |
| workspace 测试配置不一致 | 不同包行为不同，维护成本上升 | 优先共享基础配置或明确每包差异 | 回退局部配置，保留已稳定包 |
| E2E / release-smoke 被误放进默认 unit | 默认 CI 写 DB、启动 Docker或耗时过长 | CI `verify` 只接无 DB / 无 Docker 命令 | 移除误接命令，恢复手动或 label 触发 |
| coverage 输出或 artifact 过大 | CI 存储和下载成本增加 | 只上传必要报告，排除原始大文件 | 缩小 artifact 路径或关闭 artifact |
| 后续 P1 修复被测试基础设施变化阻塞 | WP3-WP8 延迟 | 分阶段接入，先本地可执行再进 CI | 暂停 CI 阻断，保留计划和本地命令 |

## 12. PR 描述模板

```markdown
## Summary
- WP2: CI / 测试 / Coverage 基础设施调整。
- 明确测试脚本语义，新增快速 unit 入口，并为 coverage 接入打基础。

## Scope
- 包含：package 脚本、测试配置、unit/coverage 入口、CI verify/coverage artifact 的必要调整。
- 不包含：业务安全修复、权限/财务/文件/IoT 修复、Docker / release-smoke 修复、DB migration / seed 修改。

## Verification
- [ ] pnpm lint
- [ ] pnpm typecheck
- [ ] pnpm build
- [ ] pnpm test:unit
- [ ] pnpm test:coverage

## CI / Coverage Notes
- 说明 `test:unit` 是否已接入 `verify`。
- 说明 coverage 是否只是 artifact，还是已设置阻断阈值。
- 说明 coverage 输出路径和 artifact 名称。

## Out of Scope
- 不包含 WP3-WP8 业务风险修复。
- 不包含 release-smoke / Docker 修复。
- 不启动 Docker / DB，不修改 migration / seed。

## Rollback
- 如 unit 门禁误阻断，回退 CI `verify` 新增步骤。
- 如 coverage 阈值误阻断，降级为 artifact-only 或回退阈值配置。
- 如脚本语义引发混淆，回退 package 脚本变更并重新拆分。
```

## 13. 完成定义 DoD

WP2 实施阶段完成定义：

- 测试命令语义清晰。
- `test:unit` 可执行。
- API `.spec.ts` 被纳入 unit 入口。
- coverage / `test:coverage` 入口明确。
- coverage artifact 策略明确。
- CI `verify` 是否接入有明确结论。
- `pnpm lint` 通过。
- `pnpm typecheck` 通过。
- `pnpm build` 通过。
- 新增的 `pnpm test:unit` 通过。
- 新增的 `pnpm test:coverage` 通过，或明确记录未执行原因。
- 未修改业务代码、DB、seed、migration、Docker、release-smoke。
- `git diff --check` 通过。
- PR 描述记录验证结果和边界。

本计划阶段完成定义：

- 仅新增 `docs/release/smartpark-review-remediation-wp2-plan.md`。
- 不修改 CI、package 脚本、测试代码或业务代码。
- 不运行测试实现、不跑 coverage。
- 文档列出后续实施范围、禁止范围、验证命令、风险与回滚。

## 14. 本计划阶段交付

本阶段仅新增：

```text
docs/release/smartpark-review-remediation-wp2-plan.md
```

本阶段不修改 CI，不修改 package 脚本，不新增测试，不运行测试实现，不跑 coverage，不修改业务代码。

本阶段也不修改：

- `.github/workflows/**`
- `scripts/**`
- `apps/**`
- `packages/**`
- `database/**`
- `infra/**`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- seed / migration
- snapshot baseline
- 真实密钥、密码、token、生产连接串

本计划文档用于后续 WP2 实施 PR 的边界、步骤和验收依据。进入实施阶段前，应重新确认当前 main、工作区状态、测试框架选择、coverage 阈值策略和 CI 接入范围。
