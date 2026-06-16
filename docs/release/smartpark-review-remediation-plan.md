# SmartPark 审查整改计划

生成日期：2026-06-16

建议分支：`docs/smartpark-review-remediation-plan`；当前检查分支：`main`

## 1. 来源与边界

本计划基于仓库外审查目录 `/home/veich/JinhuProjects/SmartPark/SmartParkReview` 的报告整理，重点参考：

- `2026-06-16-智慧园区系统项目完整审查总结汇报.md`
- `step-8-cross-review-risk-dedup-report.md`
- `step-9-final-remediation-roadmap-and-audit-summary.md`
- `step-2` 至 `step-7-extra` 各专项审查报告

本计划只制定整改路线，不在本文档提交中修改业务代码、CI、Docker、数据库脚本或测试脚本。后续每个工作包应独立建分支、独立提交、独立验证，避免将交付阻塞、安全整改、财务并发和架构拆分混在同一个 PR 中。

本计划中的验证命令分为现有可执行命令和建议新增命令；当前不存在的 smoke / coverage 脚本应先在对应工作包中新增，再纳入 CI 或发布门禁。

## 2. 审查结论摘要

当前项目不是“无法构建”的状态，而是“静态构建可用，但发布门禁和高风险业务保障不足”。

已验证通过：

| 类别 | 结果 |
|---|---|
| 静态门禁 | `pnpm lint`、`pnpm typecheck`、`pnpm build` 通过 |
| DB 初始化 | `pnpm db:migrate`、`pnpm db:seed:prod`、`pnpm db:bootstrap:admin`、`pnpm db:check:init` 通过 |
| migration 执行 | 146 个 migration 成功，0 失败 |

已验证失败或阻塞：

| 风险 | 结果 |
|---|---|
| 首发回归入口 | `first-release-regression` 第一脚本失败，缺少 `FIRST_RELEASE_MENU_PATHS` |
| Docker / release-smoke | API 镜像构建阶段 `apt-get install python3 make g++` 下载 `gcc-12/g++-12` 失败 |
| API login smoke | API 容器未创建，`verify-api-login-dockerexec.sh` 无法执行 |
| Coverage | 根包、API 包、Web 包均无 `coverage` / `test:coverage` 入口 |
| 默认 prod compose 端口 | 本地 5432 端口存在冲突风险 |

## 3. 最终风险矩阵

| 编号 | 等级 | 主题 | 整改判断 |
|---|---|---|---|
| R1 | P0 | 首发回归入口不可用 | 立即修复 |
| R2 | P0 | API Docker / release-smoke 阻塞 | 立即修复 |
| R3 | P1 | CI / 测试门禁不足 | 短期纳入默认门禁 |
| R4 | P1 | 认证与会话安全 | 中期安全专项 |
| R5 | P1 | 权限、模块授权、数据范围和字段权限 | 中期安全专项 |
| R6 | P1 | 幂等、重放、状态机覆盖不均 | 中期业务一致性专项 |
| R7 | P1 | 财务一致性与并发 | 中期业务一致性专项 |
| R8 | P1 | 文件安全 | 中期安全专项 |
| R9 | P1 | IoT / WebSocket / 外部调用安全 | 中期安全专项 |
| R10 | P2 | Migration / seed / 首发边界治理 | 长期治理 |
| R11 | P2 | 可维护性与性能债 | 长期治理 |
| R12 | P3 | SQL 注入残余与治理项 | 持续治理 |

不可暂缓项：

- R1：首发回归入口不可用。
- R2：Docker/API release-smoke 阻塞。
- R3：CI 默认不跑单元测试。
- R4-R9：认证、权限、财务、文件、IoT/WS/外部调用相关 P1 风险。

## 4. 整改节奏

### 4.1 短期，1 到 3 天

目标：恢复可运行、可验证、可阻断的交付基础。

| 顺序 | 风险 | 整改动作 | 验收结果 |
|---|---|---|---|
| 1 | R1 | 恢复 `FIRST_RELEASE_MENU_PATHS` / `filterFirstReleaseMenus`，或更新菜单白名单脚本读取当前菜单 contract | 菜单白名单脚本通过 |
| 2 | R1 | 重跑首发回归入口，确认不再第一步失败 | `first-release-regression` 能进入后续业务脚本 |
| 3 | R2 | 稳定 `infra/docker/Dockerfile.api`：确认是否强制替换为 `mirrors.aliyun.com`，为 `apt-get` 增加 retry / timeout / `--fix-missing`，使用 BuildKit cache mount 或预构建依赖层，必要时使用预装 `python3` / `make` / `g++` 的 builder 基础镜像 | API 镜像可构建 |
| 4 | R2 | 打通 release-smoke API health/login 阶段 | API 容器可启动，登录验证可执行 |
| 5 | R3 | 新增快速单元测试入口，至少接入现有 API `.spec.ts` | `pnpm test:unit` 可执行 |
| 6 | R3 | CI verify 加入 unit 门禁 | 单测失败可阻断 PR |
| 7 | R3 | 明确 `test`、`test:unit`、`test:e2e`、`test:release`、`test:coverage` 语义 | 测试命令不再混淆 |

短期默认验收命令：

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
node scripts/e2e/first-release-menu-whitelist.mjs
```

有副作用或依赖运行环境的命令需单独确认后执行：

```bash
node scripts/e2e/first-release-regression.mjs
docker compose -f infra/docker/docker-compose.prod.yml up -d api
bash scripts/verify-api-login-dockerexec.sh
```

### 4.2 中期，1 到 2 周

目标：处理 P1 安全与核心业务一致性风险。

| 领域 | 风险 | 整改方向 | 主要验收 |
|---|---|---|---|
| 认证与会话 | R4 | 登录、refresh、select-context 增加限流和失败锁定；refresh token 改 HttpOnly cookie；增加 token family 复用检测 | 连续失败触发 429/lock；旧 refresh 复用失败并告警；前端不持久化 refresh token |
| 权限与数据范围 | R5 | 模块授权强制声明或路由前缀映射；无匹配数据范围默认拒绝；字段权限统一 response 出口 | 新 controller 漏模块声明会被阻断；跨维度数据范围测试通过；敏感字段无法绕过 |
| 幂等与状态机 | R6 | 建 endpoint 幂等等级表；核心写动作补真实幂等或业务唯一约束；状态流事务内重读重锁 | 同 key replay 一致；不同 body conflict；重复审批/退款只有一个有效结果 |
| 财务一致性 | R7 | 统一 Money/Decimal helper；限制手工应收初始状态；补收款、豁免、退租、退款、开票并发测试 | 金额边界和并发最终状态一致；状态日志不重复有效 |
| 文件安全 | R8 | MIME+扩展名+magic bytes；下载 `nosniff`；流式上传和 hash；文件编号序列化或冲突重试 | 伪文件被拒；危险扩展被拒；下载头正确；并发编号唯一 |
| IoT/WS/外部调用 | R9 | Redis/DB nonce；禁 WebSocket query token；生产专用密钥 fail-fast；统一 HTTP client timeout/allowlist | nonce 重放拒绝；query token 连接拒绝；缺密钥生产启动失败；私网 URL 和慢响应被阻断 |

中期建议新增验证入口（以下脚本当前不存在，需在对应工作包新增后执行）：

```bash
node scripts/e2e/auth-security-smoke.mjs
node scripts/e2e/permission-data-scope-matrix.mjs
node scripts/e2e/files-security-smoke.mjs
node scripts/e2e/iot-security-smoke.mjs
node scripts/e2e/robots-external-call-security-smoke.mjs
node scripts/e2e/financial-concurrency-smoke.mjs
```

### 4.3 长期，1 个月

目标：形成持续治理能力，降低后续迭代回归成本。

| 领域 | 风险 | 治理方向 | 验收标准 |
|---|---|---|---|
| Migration / seed | R10 | migration 编号唯一检查；历史重复 `000136_*` 登记例外；production seed 首发模块授权校验 | 新增重复编号被 CI 阻断；首发模块授权可审计 |
| 架构拆分 | R11 | 拆租赁大服务，抽出金额计算、状态机、账单生成、数据权限、状态日志 | 拆出的领域逻辑具备单测；业务行为不变 |
| 前端拆分 | R11 | 拆租赁大页面为容器、筛选、详情抽屉、数据 hook 和懒加载面板 | 构建通过；关键页面 smoke 通过 |
| 性能 | R11 | 批量任务分页、预取、事务最小化、规模化 smoke | 大数据量下任务耗时和内存可控 |
| SQL 与生成目录治理 | R12 | raw SQL / QueryBuilder 审查规则；审计脚本排除 `.next`、`dist`、coverage | 静态审查能发现高风险 SQL；生成目录不干扰审计 |

## 5. 工作包拆分

### WP0：恢复首发回归入口

| 项目 | 内容 |
|---|---|
| 优先级 | P0 |
| 覆盖风险 | R1 |
| 建议负责人 | Web 负责人、QA、交付负责人 |
| 主要任务 | 恢复或重建首发菜单 contract；同步前端菜单、路由、文档和回归脚本；确认二期直达 URL 的拒绝策略 |
| 验收命令 | `node scripts/e2e/first-release-menu-whitelist.mjs`；`node scripts/e2e/first-release-regression.mjs` |
| 注意事项 | 完整 regression 依赖 API/DB，可能写业务测试数据；首发菜单 contract、API 权限码、模块授权、前端菜单/按钮权限、E2E 白名单、production seed 授权范围需保持同源或同步机制，否则会再次漂移 |

### WP1：修复 Docker / release-smoke

| 项目 | 内容 |
|---|---|
| 优先级 | P0 |
| 覆盖风险 | R2 |
| 建议负责人 | DevOps、API 负责人 |
| 主要任务 | 稳定 API Docker build 依赖源；确认 `Dockerfile.api` 是否强制替换为 `mirrors.aliyun.com`；为 `apt-get` 增加 retry / timeout / `--fix-missing`；使用 BuildKit cache mount 或预构建依赖层；必要时使用预装 `python3` / `make` / `g++` 的 builder 基础镜像；支持本地端口覆盖；完成 API health/login smoke |
| 验收命令 | `docker compose -f infra/docker/docker-compose.prod.yml up -d api`；`bash scripts/verify-api-login-dockerexec.sh`；`pnpm db:check:init` |
| 注意事项 | 会启动 Docker、写 DB、产生日志；CI 可使用默认端口；本地执行前检查 5432 是否占用，可通过 `POSTGRES_PUBLISHED_PORT` / `API_PUBLISHED_PORT` 覆盖，例如 `15432` / `13001`；release-smoke 应上传 apt/build 失败日志 artifact |

### WP2：CI / 测试 / Coverage 基础设施

| 项目 | 内容 |
|---|---|
| 优先级 | P1，短期 |
| 覆盖风险 | R3 |
| 建议负责人 | QA、DevOps、API 负责人 |
| 主要任务 | 新增 `test:unit`；接入 API `.spec.ts`；明确测试脚本语义；第一步新增根包、API 包、Web 包 `coverage` / `test:coverage` 脚本和 artifact，再接 CI verify / coverage |
| 验收命令 | `pnpm lint`；`pnpm typecheck`；`pnpm build`；`pnpm test:unit`；`pnpm test:coverage`（新增 coverage 入口后执行） |
| 注意事项 | 当前根包、API 包、Web 包 coverage 脚本不存在，需先新增后再纳入 CI |

### WP3：认证与会话安全

| 项目 | 内容 |
|---|---|
| 优先级 | P1 |
| 覆盖风险 | R4 |
| 建议负责人 | 安全负责人、API 负责人、Web 负责人 |
| 主要任务 | 公开认证端点限流；密码失败锁定；refresh token HttpOnly cookie；access token 内存化；token family 复用检测 |
| 验收命令 | `pnpm --filter @jinhu/api test:unit -- auth`；新增后执行：`node scripts/e2e/auth-security-smoke.mjs` |
| 注意事项 | 会影响前后端登录协议，需同步 CSRF、跨域、移动端或小程序登录态策略 |

### WP4：权限、模块授权、数据范围和字段权限

| 项目 | 内容 |
|---|---|
| 优先级 | P1 |
| 覆盖风险 | R5 |
| 建议负责人 | API 负责人、安全负责人、QA |
| 主要任务 | 强制模块声明或路由前缀映射；显式模块豁免；数据范围默认拒绝；字段权限统一 serializer/DTO allowlist |
| 验收命令 | `pnpm --filter @jinhu/api test:unit -- module data-scope field-policy`；新增后执行：`node scripts/e2e/permission-data-scope-matrix.mjs` |
| 注意事项 | 需要与首发菜单、模块、权限、seed contract 对齐；首发菜单 contract、API 权限码、模块授权、前端菜单/按钮权限、E2E 白名单、production seed 授权范围需保持同源或同步机制，否则会再次漂移 |

### WP5：幂等、状态机、财务并发一致性

| 项目 | 内容 |
|---|---|
| 优先级 | P1 |
| 覆盖风险 | R6、R7 |
| 建议负责人 | 财务业务负责人、API 负责人、QA |
| 主要任务 | endpoint 幂等等级表；核心写动作真实幂等；事务内重读重锁；Money/Decimal helper；财务并发测试 |
| 验收命令 | `pnpm --filter @jinhu/api test:unit -- money idempotency leasing`；新增后执行：`node scripts/e2e/financial-concurrency-smoke.mjs`；`node scripts/e2e/first-release-leasing.mjs` |
| 注意事项 | 并发测试会写 DB，需可控测试数据和清理策略 |

建议拆分 PR：

1. endpoint 幂等等级表 + 现状测试。
2. 退租状态流事务内重锁。
3. 退款 / 工单 / 作业许可真实幂等。
4. Money / Decimal helper。
5. 财务并发测试矩阵。

### WP6：文件安全

| 项目 | 内容 |
|---|---|
| 优先级 | P1 |
| 覆盖风险 | R8 |
| 建议负责人 | API 负责人、安全负责人、QA |
| 主要任务 | magic bytes 校验；危险类型拒绝或强制下载；下载 `nosniff`；流式上传和 hash；文件编号唯一策略 |
| 验收命令 | `pnpm --filter @jinhu/api test:unit -- files`；新增后执行：`node scripts/e2e/files-security-smoke.mjs`；`node scripts/e2e/first-release-files.mjs` |
| 注意事项 | 流式上传可能影响存储实现、hash 计算和前端上传体验 |

### WP7：IoT / WebSocket / 外部调用安全

| 项目 | 内容 |
|---|---|
| 优先级 | P1 |
| 覆盖风险 | R9 |
| 建议负责人 | IoT 负责人、安全负责人、API 负责人 |
| 主要任务 | IoT nonce 改 Redis/DB TTL；禁 query token；生产专用密钥 fail-fast；统一外部 HTTP client 的 timeout、allowlist、redirect 和响应大小限制 |
| 验收命令 | `pnpm --filter @jinhu/api test:unit -- iot websocket external-http`；新增后执行：`node scripts/e2e/iot-security-smoke.mjs`；新增后执行：`node scripts/e2e/robots-external-call-security-smoke.mjs` |
| 注意事项 | Redis/DB TTL 方案需要基础设施支持；WS 协议变更需前端联动 |

### WP8：架构、性能与长期治理

| 项目 | 内容 |
|---|---|
| 优先级 | P2/P3 |
| 覆盖风险 | R10、R11、R12 |
| 建议负责人 | 架构负责人、模块负责人 |
| 主要任务 | migration 编号唯一门禁；production seed 首发边界校验；租赁服务拆分；前端页面拆分；批量任务性能优化；raw SQL 审查 |
| 验收命令 | `pnpm lint`；`pnpm typecheck`；`pnpm build`；migration prefix check；相关模块 unit；规模化 smoke |
| 注意事项 | 应在 P0/P1 稳定后逐步推进，避免与安全和财务修复互相干扰 |

## 6. CI/CD 门禁建议

建议将门禁拆成以下层级：

| 层级 | 触发时机 | 内容 | 是否有副作用 |
|---|---|---|---|
| verify | 每个 PR / push | install、lint、typecheck、build、unit | 否 |
| coverage | PR / main，可先非阻断 | 新增 coverage 入口后生成 coverage artifact | 生成 coverage 文件 |
| release-smoke | main、发布分支、手动、关键 PR label | Docker、migration、seed、bootstrap、baseline、API login | 是 |
| first-release regression | nightly、发布分支、关键 PR label | 首发业务主链 E2E | 是 |
| security-special | nightly / 发布前 | 认证、权限、文件、IoT、外部调用专项 | 多数有 |
| financial-concurrency | nightly / 发布前 | 财务并发一致性测试 | 是 |

落地顺序：

1. `verify` 中加入 `pnpm test:unit`。
2. 明确 `pnpm test` 是否保留为 E2E，或改为快速 unit 并新增 `test:e2e`。
3. 新增根包、API 包、Web 包 coverage / `test:coverage` 入口后执行 `pnpm test:coverage`，并上传 artifact。
4. 修复 release-smoke API Docker build 后，在 main / 发布分支必跑。
5. 修复 first-release regression 入口后，先 nightly，再进入发布分支门禁。
6. 安全专项和财务并发先 nightly，稳定后对高风险 PR label 必跑。

## 7. 风险接受与暂缓项

以下事项可以暂缓，但需要记录责任人、接受期限和复核条件：

| 项目 | 当前判断 | 暂缓条件 |
|---|---|---|
| SQL 注入残余 | 重点范围未发现直接拼接用户输入 SQL 证据，当前为 P3 | 保持 TypeORM 参数绑定、sort/filter allowlist，新增 raw SQL 审查规则 |
| 生成目录治理 | `.next`、`dist`、coverage 等存在但 Git 状态干净 | 审计脚本默认排除，必要时提供 clean 说明 |
| CI 明文测试凭据 | 固定测试密码/JWT secret 属 P2 | 短期仅限隔离 CI，后续动态生成或迁移 secrets |
| API snapshot | 当前优先级低于 release-smoke 和首发回归 | P0/P1 门禁恢复后纳入手动或定时任务 |
| Web 组件测试 | 当前 Web 测试为 0 | 先保交付门禁，中长期补登录、菜单权限、文件、移动操作流 |
| 批量性能优化 | 尚未做性能压测 | 财务和安全 P1 修复后再做规模化 smoke |

## 8. 后续执行建议

建议按以下分支和 PR 顺序推进：

1. `fix/first-release-menu-contract`：只处理 R1。
2. `fix/release-smoke-api-docker`：只处理 R2。
3. `test/unit-ci-gate`：只处理 R3 的 unit 和 CI 基础。
4. `security/auth-session-hardening`：处理 R4。
5. `security/module-data-field-policy`：处理 R5。
6. `fix/financial-idempotency-concurrency`：处理 R6/R7。
7. `security/files-hardening`：处理 R8。
8. `security/iot-ws-external-http`：处理 R9。
9. `chore/platform-governance`：处理 R10/R11/R12 的长期治理项。

每个 PR 的完成条件：

- 只包含对应工作包的必要变更。
- 有明确测试或验证命令。
- 对有副作用命令标明执行环境和数据影响。
- 更新相关运行文档或测试文档。
- PR 描述关联风险编号和验收结果。
