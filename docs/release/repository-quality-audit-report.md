# JinHu Smart Park 仓库二次质量复审报告

## 1. 复审结论

总判断：**需要上线前补强**

判断依据：

- 当前 `main` 已明显脱离“高风险 AI Coding 项目”状态，已经具备**可运维首发基线**：production seed 初始化闭环、bootstrap-admin、认证 mock 收口、release-smoke、`/health` / `/ready` 分层、本地文件存储持久化、首发菜单白名单、幂等第一版、上线/回滚 SOP 与 Final Go 文档均已形成闭环。
- 但仓库级质量门禁仍有一个真实高风险剩余项不宜继续忽略：
  - migration 机制仍停留在**顺序 SQL 回放**，且已出现 **`000136` 重号**，没有执行历史表、没有 checksum、没有失败状态留痕、没有回滚策略。
- 原 G0-1 `pnpm typecheck` 独立门禁问题已完成修复：Web standalone typecheck 已拆分为不依赖 `.next/types` 的 `tsconfig.typecheck.json`，`pnpm typecheck`、`pnpm --filter @jinhu/web typecheck`、`pnpm build`、`pnpm lint` 在修复后均已通过。
- 除此之外，大量非首发页面代码仍可被直接访问，测试体系主要靠 smoke，文档索引偏分散，维护成本高但**不构成立即阻断上线**。

建议口径：

- 业务/运维基线：**可以作为首发上线基线**
- 仓库治理口径：**typecheck 门禁已收口，后续应继续完成 migration 风险治理计划**

## 2. 复审基线

| 项 | 值 |
|---|---|
| 分支 | `docs/repository-quality-audit` |
| commit | `bc081a684a35cd25b60a17fb8defe56ff8ed1a4c` |
| 检查日期 | `2026-06-08` |
| 是否基于最新 `main` | 是，`HEAD == main == origin/main` |
| 是否修改代码 | 否，仅新增审计报告文档 |
| 工作区状态（开始前） | 干净 |

## 3. 与首次接手审查报告对比

| 原风险项 | 原等级 | 当前状态 | 是否关闭 | 仍需动作 |
|---|---|---|---|---|
| production 环境变量矩阵 | P0 | 文档和模板已补齐，真实值仍靠人工确认 | 部分关闭 | 形成正式生产参数确认单并纳入发布签字 |
| production seed 初始化闭环 | P0 | 已形成 `migrate -> seed -> baseline -> bootstrap-admin -> verify` 闭环 | 是 | 继续维持 SOP |
| bootstrap-admin | P0 | 已实装并验证幂等 | 是 | 后续可选补“首次改密”流程 |
| 认证 mock | P0 | 生产态强禁用，文档和验证脚本一致 | 是 | 二期启用短信/微信时单独回归 |
| 真实幂等 | P0 | 已有 PostgreSQL-backed 第一版，接入 5 个接口 | 部分关闭 | 扩覆盖范围、补清理任务、补监控规范 |
| CI 测试门禁 | P0 | `verify + release-smoke` 已存在且阻断，Web typecheck 独立门禁已收口 | 部分关闭 | 继续补更多自动化测试 |
| 健康检查 | P1 | `/health` liveness 与 `/ready` readiness 已分层 | 是 | 随基线变化维护 readiness 项 |
| migration 机制 | P1 | 仍是顺序 SQL 执行，且有重复编号 | 否 | 引入执行记录、失败追踪、checksum/替代框架 |
| 文件存储 | P1 | 单机本地存储已收口并文档化 | 部分关闭 | 若未来多实例，单独做对象存储迁移 |
| 菜单白名单 | P1 | 已收口到白名单菜单 | 部分关闭 | 继续声明“隐藏不等于下线”，处理直接访问口径 |
| 脱离 dev seed 验证环境 | P1 | 工具链与验收报告已形成 | 部分关闭 | 制度化到预发/生产验收流程 |
| README / 文档 | P2 | 比首次好，但仍与真实系统范围和治理事实脱节 | 否 | 重写 README，重构文档索引 |
| 自动 Docker 清理 | P2 | SOP/文档已说明 | 基本关闭 | 继续在运维文档里强调排障场景禁用自动清理 |
| 可维护性 | P2 | 大文件、大服务、占位路由、别名/兼容页仍明显 | 否 | 按模块分阶段拆分 |

结论：

- 首次报告中的 P0 主风险，大部分已被收口到**可运维**水平。
- 当前真实剩余项主要集中在：**migration 治理、测试覆盖不足、文档体系和可维护性债务**。

## 4. P1-2 migration 机制治理建议

### 当前问题

1. `scripts/db-migrate.sh` 仅按文件名顺序直接执行 SQL，没有执行状态表。
2. migration 文件已出现重复编号：`000136_idempotency_request.sql` 与 `000136_s9f_energy_billing_allocation.sql`。
3. 没有 checksum，无法判断文件是否被事后修改。
4. 没有执行批次记录、开始/结束时间、执行人、结果状态。
5. 失败后只能从控制台输出定位，大规模环境下不可审计。
6. 没有显式“已执行跳过”机制，重复执行是否安全完全依赖每个 SQL 自己写得是否幂等。
7. 没有统一回滚策略，当前文档口径是 forward-only。

### 风险

- 风险等级：**高**
- 风险说明：
  - 在单环境、单人手工执行时还能工作；
  - 一旦进入多环境发布、回滚演练、多人协作或热修复补丁场景，容易出现“执行过但不可追踪”“同编号不同 SQL”“半执行后难确认状态”的问题。

### 短期强缓解

目标：不动现有业务 migration 内容，先把风险显式化。

- 约束一：冻结当前历史 migration 文件，禁止修改已入库 SQL。
- 约束二：新增 migration 编号规则文档，后续必须唯一递增，禁止重号。
- 约束三：发布 SOP 增加“执行前备份 + 执行日志留存 + 失败后人工比对最后成功文件”步骤。
- 约束四：在 `docs/deployment/production.md` 和 release SOP 中明确当前 migration 为 forward-only，失败恢复依赖备份。
- 约束五：先修复脚本层记录能力，再考虑框架替换。

### 中期方案

目标：保留 SQL 文件，补执行记录表。

建议新增一张执行记录表，例如：

- `sys_schema_migration_history`
  - `filename`
  - `checksum`
  - `started_at`
  - `finished_at`
  - `status`
  - `error_message`
  - `executed_by`
  - `batch_id`

建议脚本行为：

- 执行前计算文件 checksum。
- 若 `filename + checksum` 已成功执行，则跳过。
- 若同名但 checksum 变化，直接失败并提示人工介入。
- 执行每个文件前写入 `running`，成功后更新为 `succeeded`，失败更新为 `failed`。
- 控制台与日志同时输出“当前文件 / 最后成功文件 / 失败文件”。

### 长期方案

目标：迁移到更成熟的 schema migration 机制。

可选方向：

1. 继续保留 SQL-first，但引入专用 migration runner。
2. 迁移到 TypeORM migration 或独立框架（如 Flyway / Liquibase / dbmate 一类）管理执行历史与 checksum。
3. 将 seed 与 migration 彻底分层，seed 只保留 baseline metadata，业务演进只走 migration。

长期推荐：

- 对本仓库更现实的路径是“**保留 SQL 文件 + 自建 history 表 + 未来再评估 Flyway/Liquibase**”。
- 直接切到 TypeORM migration 成本不低，而且当前大量历史 SQL 已存在，不建议一次性推倒。

### 推荐实施顺序

1. G0：确认历史 migration 冻结原则，补文档与发布口径。
2. G1：修复编号治理，避免再出现重复前缀。
3. G1：实现 migration history 表与脚本记录。
4. G2：把 seed / migration / bootstrap-admin 的职责边界固化到文档。
5. G3：评估引入成熟 migration framework。

### 建议 Issue

- `migration: add execution history and checksum tracking`
- `docs: define migration numbering and forward-only policy`
- `ops: add migration failure recovery and audit procedure`

### 验收标准

- 任一 migration 都能回答“是否执行过、何时执行、谁执行、结果如何”。
- 重复执行不会重跑已成功且 checksum 未变的 SQL。
- 同名文件内容变化会被脚本显式拦截。
- 失败后能定位到失败文件和最后一个成功文件。
- 生产文档明确当前回滚只能依赖数据库备份。

### 推荐改动文件

- `scripts/db-migrate.sh`
- `docs/deployment/production.md`
- `docs/release/production-release-sop.md`
- 新增 migration history 表 SQL

### 建议 commit 拆分

1. `docs: define migration execution policy and failure handling`
2. `feat: add migration history table and script logging`
3. `chore: enforce unique migration numbering`

## 5. 测试体系补强计划

### 当前测试能力

| 类型 | 当前状态 | 说明 |
|---|---|---|
| lint | 有 | `pnpm lint` 通过 |
| typecheck | 有 | Web standalone typecheck 已改为 `tsc -p tsconfig.typecheck.json --noEmit`，不再依赖 `.next/types` |
| build | 有 | `pnpm build` 通过，Next build 同时做了类型校验 |
| unit | 极少 | 仅见 3 个幂等相关 spec |
| integration | 基本无 | 未见成体系后端集成测试 |
| smoke | 有 | `scripts/e2e/*.mjs` 较多 |
| release-smoke | 有 | CI 阻断门禁已存在 |
| component | 无 | 未见 Testing Library/Vitest 组件测试 |
| browser/e2e | 无稳定门禁 | 未见 Playwright/Cypress 实际配置接入 |

### 当前已经覆盖什么

- verify 门禁：
  - lint
  - typecheck
  - build
- release-smoke：
  - PostgreSQL 启动
  - migration
  - production seed
  - bootstrap-admin
  - baseline check
  - API 健康
  - 登录验证脚本
- 单测：
  - `IdempotencyKeyGuard`
  - `IdempotencyService`
  - `IdempotencyInterceptor`

### 当前缺什么

- 登录认证没有标准单测/集成测试基线。
- 用户管理没有 CRUD 自动化测试。
- 资产管理没有 API 或前端核心链路测试。
- 合同 / 应收 / 收款只有 smoke，没有可回归的精细化测试。
- 工单状态流转没有最小单元/集成覆盖。
- 文件上传下载缺少 MIME、大小、权限、软删除后行为测试。
- 幂等只测框架层，没有对全部接入业务接口做回归。
- 菜单白名单没有自动断言测试。
- `/health` / `/ready` 没有程序化断言套件。

### 首发核心链路应补测试

优先补这几类：

1. 登录认证
   - 密码登录成功 / 失败
   - 生产态 SMS / WeChat mock 禁用
   - `/auth/me` 成功
2. 用户管理
   - 新建用户
   - 重置密码
   - 角色分配
3. 资产管理
   - 园区 / 楼栋 / 楼层 / 房源最小 CRUD
4. 合同 / 应收 / 收款
   - 新建合同
   - 生成应收
   - 新建收款
5. 工单
   - 新建工单
   - 最小状态推进一条链
6. 文件上传下载
   - 白名单 MIME
   - 超限拒绝
   - 下载鉴权
7. 幂等
   - 首批 5 接口重放返回缓存结果
   - 未接入接口只做 header 校验，不做错误宣称
8. 运行态
   - `/health`
   - `/ready`
9. 菜单白名单
   - 首发菜单存在
   - 非首发菜单不可见

### 不建议上线前做的测试

- 大规模浏览器 E2E 全量覆盖
- IoT / 视频 / 能耗 / 机器人二期域全链路自动化
- 前端组件测试大面积补录
- 全业务回归录制式测试

原因：

- 成本高、波动大、对当前首发基线收益不成比例。

### 3 阶段测试路线图

#### T1：上线前 / 上线后短期

- 修复 `pnpm typecheck` 独立执行口径。
- 保持 `verify + release-smoke` 稳定。
- 为登录、用户、合同/应收/收款、工单、文件、菜单白名单补最小 API/smoke 断言。

#### T2：一个迭代内

- 为首发模块补 API integration 测试基线。
- 把 `/health` `/ready` 断言加入可独立执行脚本。
- 把幂等重放验证扩到更多首发高风险写接口。

#### T3：长期

- 建立 Playwright 浏览器回归基线。
- 为复杂状态机模块补 service 级单测。
- 引入测试数据工厂和可重复回放的 fixture。

## 6. 文档体系治理计划

### 当前已有文档

- release 基线、预发验收、Conditional Go、Final Go
- 生产上线 SOP / 回滚 SOP / Go-Live Checklist / 参数清单
- handover 首轮审查、任务拆解、阶段总结
- deployment / testing / architecture 文档

### 当前缺失文档

- 开发环境启动手册
- 模块边界说明
- API 验证手册
- 测试运行手册
- 二期模块启用说明
- 运维排障手册

### 当前文档是否能支持新人接手

- **部分可以，但成本偏高。**
- 原因不是“文档少”，而是“文档很多但分散在 handover、release、testing、deployment 多套脉络里”。

### README 是否仍需重写

- **需要。**
- 当前 README 仍然偏“项目骨架说明”，与真实系统规模、首发范围、测试现状、初始化方式、文档入口不完全匹配。
- 尤其 `pnpm test` 描述与当前“最小 S1 冒烟”口径已有偏差，且未突出 `release-smoke`、`bootstrap-admin`、`check-init-baseline` 的真实角色。

### release 文档是否完整

- **首发发布文档基本完整。**
- SOP、回滚、Checklist、参数清单、Go/No-Go 资料都已具备。

### 部署文档仍有遗漏

- migration 风险接受说明不够强
- 宿主机备份/恢复验证动作还可更明确
- `.env.production` 与真实运维审批流程缺连接

### 需要归档的 handover 文档

- `handover_*` 文档建议按“审查 / 修复总结 / 验证报告 / 历史材料”四类归档。
- `HANDOVER_INDEX.md` 建议未来并入仓库内 `docs/index.md`，避免根目录长期堆积阶段性资料。

### 推荐文档索引结构

- `docs/index.md`
- `docs/getting-started/`
  - `dev-setup.md`
  - `repo-map.md`
- `docs/testing/`
  - `how-to-run-tests.md`
  - `release-smoke.md`
- `docs/deployment/`
  - `production.md`
  - `troubleshooting.md`
- `docs/release/`
  - 保留现有 SOP / 报告
- `docs/handover-archive/`
  - 归档历史 handover 文档

## 7. 可维护性和架构治理计划

### 高风险大文件

| 文件 | 行数 | 判断 |
|---|---:|---|
| `apps/web/app/leasing/tenants/page.tsx` | 2797 | 前端聚合过重 |
| `apps/web/app/leasing/contracts/page.tsx` | 2772 | 首发核心页过大 |
| `apps/web/app/leasing/leads/page.tsx` | 2353 | 非首发但维护成本高 |
| `apps/web/app/assets/units/UnitsPageClient.tsx` | 1811 | 页面组件过大 |
| `apps/web/app/workorders/list/page.tsx` | 1571 | 首发核心页过大 |
| `apps/api/src/modules/units/units.service.ts` | 1664 | 服务膨胀 |
| `apps/api/src/modules/leasing-contracts/leasing-contracts.service.ts` | 1609 | 服务膨胀 |
| `apps/api/src/modules/leasing-leads/leasing-leads.service.ts` | 1597 | 服务膨胀 |
| `apps/api/src/modules/work-orders/work-orders.service.ts` | 1591 | 服务膨胀 |
| `packages/shared/src/index.ts` | 1166 | 共享常量/类型入口过大 |

### AppModule 膨胀

- `apps/api/src/app.module.ts` 为 206 行，注册模块目录数达 **41** 个。
- 问题不在“行数特别长”，而在**单体装配点承载过多业务域**，说明仓库仍是大单体组织方式。

### 是否存在明显重复逻辑

- 前端存在大量别名页 / 重导出页 / redirect 页：
  - `admin/*` 到真实页
  - `finance/*` 到 leasing 页
  - `invest/*` 到 leasing 页
  - `/contracts` 到 `/leasing/contracts`
  - `/workorders/statistics` 到 `/workorders/stats`
  - `/system/files` 复用 `/system/attachments`
- 这些做法短期降低兼容成本，长期会抬高路径治理和测试成本。

### 是否存在占位页和真实页混杂

- **存在。**
- `apps/web/app/(dashboard)/[...segments]/page.tsx` 仍是 catch-all 占位页，命中后显示“功能建设中”。
- 与此同时，很多二期模块真实页面代码又已经存在，导致“占位页 / 兼容页 / 真实页”三种状态并存。

### 是否存在前端页面承载过多业务聚合

- **明显存在。**
- 首发核心页如合同、租户、工单列表、房源页都包含大量筛选、表格、弹窗、状态动作、数据加载和局部组件定义，后续变更风险较高。

### 是否存在模块边界不清

- 存在中度问题：
  - leasing 相关路由与 finance / invest 兼容路由交叉；
  - system / attachments / files 的命名口径不完全一致；
  - 非首发模块虽隐藏，但仍保留大量可访问路由与别名。

### 推荐拆分路线

1. 先按首发模块拆大前端页：`page.tsx` -> `PageClient + hooks + sections + dialogs`
2. 再按业务动作拆大 service：查询、创建、状态流转、日志/附件分离
3. 最后治理 alias/compat 路由，形成统一路径口径

## 8. 配置和安全剩余风险

### 已关闭风险

- 生产危险 auth mock 变量已强禁用
- bootstrap-admin 已替代默认开发账号进入生产
- local storage 路径与 volume 已收口
- `/health` 与 `/ready` 职责已分层

### 剩余风险

1. CORS 仍是单值 `WEB_ORIGIN` 依赖，适合首发单域名，不适合复杂多域场景。
2. 文件上传仅校验 MIME 和大小，没有后缀校验、内容 sniff、恶意文件识别。
3. 文件上传未纳入幂等第一版，需要单独设计。
4. 幂等记录有 `cleanupExpired()`，但未见 scheduler/cron 接入，存在表增长风险。
5. 仓库内 `.env.example` 仍保留大量未来集成变量，占位值多，误读成本高。
6. 默认开发账号仍存在于 dev seed，虽然有脚本保护，但仍需继续强调“不得进入共享环境”。

### 是否阻断上线

- 阻断上线：**否**
- 上线前建议补强：**是**

### 后续建议

- 上线前确认 typecheck 门禁口径。
- 上线后 1 周内补幂等清理任务与告警指标。
- 后续二期前补文件上传内容校验。

## 9. 非首发模块与二期启用条件

### 当前隐藏状态

- 菜单白名单已生效，非首发菜单默认隐藏。
- 但隐藏的是菜单，不是代码与路由。

### 直接访问风险

- **存在。**
- `next build` 结果与路由扫描显示，以下页面代码仍可访问或经兼容跳转抵达：
  - IoT
  - 能耗
  - 视频安防
  - 机器人
  - 安全管理
  - 招商线索 / 公海池 / 招商漏斗
  - 退款 / 欠费账龄 / 发票 / 豁免
  - `assets/rooms`
  - `workorders/statistics`
  - `system/attachments`

### 是否应继续在 release 文档里声明非首发

- **必须继续声明。**
- 当前系统的首发边界靠“菜单白名单 + 组织口径 + 验收清单”，不是靠删除代码实现。

### 二期启用前条件

1. 模块独立验收报告
2. 最小自动化测试
3. 路由/菜单/权限三者一致性检查
4. 文档补齐
5. 涉及外部集成的真实环境验证

### 建议验收清单

- 菜单是否开启
- 路由是否仍兼容旧入口
- 权限点是否齐全
- 写接口是否接入幂等
- 文件/外部系统依赖是否真实可用
- 至少一条端到端业务链路是否验收通过

## 10. 后续治理路线图

### G0：上线前必须完成

| 任务 | 类型 | 优先级 | 建议负责人 | 验收标准 |
|---|---|---|---|---|
| 明确 migration 风险接受与执行策略 | migration | P0 | 后端/DBA | 发布文档明确 forward-only、备份、失败处理和重号禁令 |

### G1：上线后 1 周内

| 任务 | 类型 | 优先级 | 建议负责人 | 验收标准 |
|---|---|---|---|---|
- Web standalone typecheck 门禁收口 | test | 已完成 | 前端工程负责人 | `pnpm typecheck`、`pnpm --filter @jinhu/web typecheck`、`pnpm build`、`pnpm lint` 在清理 `apps/web/.next` 后均通过 |
| 为幂等记录增加清理任务与监控项 | ops | P1 | 后端 | 有定时清理，有表增长监控 |
| 补登录/用户/合同/收款/工单最小自动化回归 | test | P1 | 测试/后端 | 能独立执行并纳入常规回归 |
| README 重写并补 docs 索引 | docs | P1 | 架构/项目负责人 | 新人可按 README 找到启动、测试、发布入口 |

### G2：上线后 1 个迭代内

| 任务 | 类型 | 优先级 | 建议负责人 | 验收标准 |
|---|---|---|---|---|
| 实现 migration history 表与 checksum 校验 | migration | P1 | 后端/DBA | 可追踪执行状态与失败文件 |
| 首发核心大页面拆分 | architecture | P1 | 前端 | 合同/租户/工单页拆成可维护模块 |
| 首发高风险写接口扩幂等 | security | P1 | 后端 | 新增覆盖清单和回归验证 |

### G3：长期治理

| 任务 | 类型 | 优先级 | 建议负责人 | 验收标准 |
|---|---|---|---|---|
| 评估成熟 migration framework | migration | P2 | 后端/架构 | 完成技术选型结论 |
| 建立浏览器级回归基线 | test | P2 | 测试/前端 | 首发主链有稳定 E2E |
| 清理兼容路由与非首发别名页 | architecture | P2 | 前端 | 路由口径统一、文档一致 |
| 补文件内容检测与对象存储演进设计 | security | P2 | 后端/运维 | 文件治理方案升级 |

## 11. 建议 Issue 列表

### Issue 1

- 标题：`fix web typecheck standalone dependency on .next types`
- 类型：`test`
- 优先级：`已完成`
- 背景：`apps/web/tsconfig.json` 直接包含 `.next/types/**/*.ts`，导致 standalone typecheck 口径依赖 Next generated types，稳定性不足。
- 任务清单：
  - 明确 Next route types 的生成前提
  - 新增 `apps/web/tsconfig.typecheck.json`
  - 将 Web `typecheck` 脚本切到独立 tsconfig
  - 验证本地与 CI 口径一致
- 验收标准：已完成。干净工作区下 `pnpm typecheck` 稳定通过

### Issue 2

- 标题：`govern migration execution history and duplicate numbering`
- 类型：`migration`
- 优先级：`P0`
- 背景：migration 仍为顺序执行 SQL，且已出现 `000136` 重号。
- 任务清单：
  - 冻结历史 SQL
  - 定义唯一编号规则
  - 增加 history 表和 checksum
  - 记录成功/失败状态
- 验收标准：可回答任意 migration 的执行状态与失败位置

### Issue 3

- 标题：`expand idempotency coverage for first-release write endpoints`
- 类型：`security`
- 优先级：`P1`
- 背景：当前只有 5 个接口接入真正的幂等落库复用。
- 任务清单：
  - 盘点首发高风险写接口
  - 分批接入幂等 interceptor
  - 为文件上传单独设计策略
- 验收标准：首发核心资金/状态流转写接口具备明确幂等策略

### Issue 4

- 标题：`add idempotency cleanup task and metrics`
- 类型：`ops`
- 优先级：`P1`
- 背景：存在过期清理函数，但未见定时任务和监控。
- 任务清单：
  - 增加定时清理
  - 暴露清理结果日志/指标
  - 配置告警阈值
- 验收标准：幂等表容量可控，可观测

### Issue 5

- 标题：`add first-release automated regression pack`
- 类型：`test`
- 优先级：`P1`
- 背景：测试主要依赖 smoke，首发核心业务缺少细粒度自动回归。
- 任务清单：
  - 登录
  - 用户管理
  - 资产管理
  - 合同/应收/收款
  - 工单
  - 文件上传下载
- 验收标准：核心主链最少一套自动回归可在本地和 CI 运行

### Issue 6

- 标题：`rewrite README and build a docs index for maintainers`
- 类型：`docs`
- 优先级：`P1`
- 背景：当前文档多但分散，README 与真实系统范围脱节。
- 任务清单：
  - 重写 README
  - 建 `docs/index.md`
  - 归档 handover 文档
- 验收标准：新人 30 分钟内能找到启动、测试、发布和首发边界

### Issue 7

- 标题：`split oversized first-release pages and services`
- 类型：`architecture`
- 优先级：`P1`
- 背景：合同、租户、工单、房源相关页面和服务过大。
- 任务清单：
  - 前端按 `sections/hooks/dialogs` 拆分
  - 后端按 query / command / state transition 拆分
- 验收标准：核心文件明显降体量，改动面缩小

### Issue 8

- 标题：`document non-release direct-route policy and phase-2 acceptance conditions`
- 类型：`docs`
- 优先级：`P2`
- 背景：非首发页面虽隐藏菜单，但仍有直接访问路径。
- 任务清单：
  - 在 release 文档里保留声明
  - 建二期启用验收清单
- 验收标准：业务、测试、运维对边界口径一致

## 12. 最终建议

1. 当前是否可以上线？

   可以，但更准确的说法是：**当前已经是可运维首发基线，仓库治理层面建议带两项强条件上线。**

2. 如果可以，哪些项必须作为上线前强条件？

- 明确接受当前 migration 风险，并把执行、备份、失败恢复口径写进发布流程。

3. 哪些项可以上线后治理？

- migration history/checksum 正式实现
- 幂等覆盖扩展
- 幂等清理任务与监控
- README 与文档体系重构
- 大页面 / 大 service 拆分
- 二期模块启用验收体系

4. 下一步最应该做什么？

- **立刻把 migration 风险接受与治理路线** 固化成 Issue 和上线口径。
