# JinHu Smart Park 首发核心自动化回归包设计

## 1. 目的

本文用于定义首发版本上线前、以及后续每次发布前都应执行的最小自动化回归包，目标是用尽量小的成本覆盖最关键、最稳定、最值得回归的首发能力。

这份设计不替代 `release-smoke`，而是把当前“能上线”进一步收敛为“可重复验证、可持续回归”的发布前检查体系。

## 2. 当前测试基线

| 类型 | 当前是否存在 | 覆盖内容 | 缺口 | 是否进入本阶段 |
|---|---|---|---|---|
| lint | 是 | 代码风格、静态语法、基础质量 | 只能发现静态问题，无法验证运行链路 | 是 |
| typecheck | 是 | TypeScript 类型校验；Web 已独立于 `.next/types` | 不覆盖运行时逻辑 | 是 |
| build | 是 | API Nest build + Web Next build | 不验证业务流程 | 是 |
| unit | 少量存在 | 幂等 guard / interceptor / service | 核心模块覆盖太少 | 是 |
| smoke | 是 | 多个 `scripts/e2e/*.mjs` 场景脚本 | 偏场景型，覆盖不均衡 | 是 |
| release-smoke | 是 | PostgreSQL、migration、production seed、bootstrap-admin、baseline、health、login verify | 只覆盖首发主链路，深度不足 | 是 |
| API regression | 现在几乎没有 | 尚无成体系 API 回归包 | 缺少 auth/users/files/leasing/workorders 的最小回归集 | 是 |
| browser E2E | 无稳定门禁 | 当前没有形成稳定的浏览器回归包 | 成本高、波动大、暂不适合首发前纳入 | 否 |
| component test | 无 | 当前没有形成组件测试体系 | 维护成本高、收益暂时不高 | 否 |

## 3. 回归包分层

### L0：工程门禁

- `lint`
- `typecheck`
- `build`

说明：

- 这一层已经存在，继续作为所有回归包的前置条件。
- 这层不回答业务是否可用，只回答仓库能否健康构建。

### L1：发布冒烟

- PostgreSQL 启动
- migration
- production seed
- bootstrap-admin
- init baseline
- health / ready
- login verify

说明：

- 这一层就是当前 `release-smoke` 的核心。
- 目标是保证“从空库到可登录管理后台”的首发闭环可重复验证。

### L2：首发 API 回归

- auth
- users
- assets
- files
- idempotency
- leasing contract
- receivables
- payments
- work orders

说明：

- 这一层是首发上线后最值得持续回归的业务核心。
- 优先覆盖“风险高、操作少、数据依赖可控、适合重复执行”的接口链路。

### L3：Web 静态 / 轻量回归

- 菜单白名单
- 非首发菜单隐藏
- 关键页面路由存在

说明：

- 这一层不做完整浏览器 E2E。
- 目标是快速发现菜单配置、路由映射、首发范围偏离。

### L4：浏览器 E2E

- 暂缓，仅保留长期规划。

说明：

- 首发前不建议把全量浏览器 E2E 当作门禁。
- 等 API 回归包稳定后，再评估关键页面的少量 E2E。

## 4. 首发核心链路覆盖矩阵

| 链路 | 当前是否已有覆盖 | 建议测试类型 | 是否进入第一批 | 验收标准 | 备注 |
|---|---|---|---|---|---|
| 登录认证 | 有 release-smoke 登录验证，但无独立回归包 | API regression + 最小脚本 | 是 | 成功登录、错误密码失败、token 可用 | 首发最高优先级之一 |
| 用户管理 | 几乎没有 | API regression | 否，第二批 | 能创建/查询/重置/分配角色的最小链路 | 先补最小 CRUD |
| 健康检查 | release-smoke 已覆盖 | API regression | 是 | `/health` 返回 ok，`/ready` 状态正确 | 稳定、低成本 |
| 文件上传下载 | smoke 有部分覆盖，但不成体系 | API regression + 轻量脚本 | 是 | 上传、下载、权限、大小/MIME 基本行为正确 | 与运维体验强相关 |
| 幂等首批 5 接口 | 有第一版接入，但缺回归包 | API regression | 是 | 同 key 重放、冲突、失败重试、缓存响应正确 | 高风险写接口优先 |
| 菜单白名单 | 有文档和前端逻辑，但无自动断言 | Web 静态回归 | 是 | 白名单路径可见、隐藏菜单不展示 | 不必做浏览器 E2E |
| 资产管理 | smoke 有部分场景覆盖 | API regression | 否，第二批 | 园区/楼栋/楼层/房源的最小读链路可用 | 数据量可控 |
| 合同创建 | smoke 有覆盖 | API regression | 否，第二批 | 最小创建/查询链路可执行 | 数据依赖相对高 |
| 应收生成 | smoke 有覆盖 | API regression | 否，第二批 | 合同到应收生成的最小链路正确 | 依赖合同数据 |
| 收款登记 | smoke 有覆盖 | API regression | 否，第二批 | 收款创建、查询、状态变化正确 | 和应收联动 |
| 工单创建 | smoke 有覆盖 | API regression | 否，第二批 | 最小创建/查询/列表链路可执行 | 建议先做 API 级 |
| 工单列表 | smoke 有覆盖 | API regression | 否，第二批 | 列表筛选、分页、基础字段正确 | 易重复执行 |

## 5. 第一批建议落地范围

第一批建议只做最核心、最稳定、最能直接服务发布决策的 5 组回归：

1. auth regression
2. health / ready regression
3. idempotency replay regression
4. menu whitelist static regression
5. files upload / download regression

为什么先做这 5 组：

- 风险高：登录、健康、文件、幂等、菜单都属于首发高频链路。
- 稳定性好：这些链路比复杂业务状态机更容易重复执行。
- 数据依赖少：多数可以依赖 bootstrap-admin + 固定测试前缀数据。
- 可重复执行：适合加入每次发布前检查。
- 易收敛：不会一开始就把测试包做成“巨型全量回归”。

## 6. 第二批建议落地范围

第二批建议在第一批稳定后再补：

1. users regression
2. work orders regression
3. leasing contract / receivables / payments 最小链
4. assets basic read regression

这批的特点是：

- 业务价值高，但数据依赖和组合复杂度高于第一批。
- 更适合在第一批稳定后，逐个接口族补齐。
- 可以逐步扩展为 API 回归包，而不是一开始就做端到端大场景。

## 7. 暂缓范围

暂缓范围建议明确写死，避免回归包无限膨胀：

- 全量浏览器 E2E
- 非首发模块
- IoT / 视频 / 能耗 / 机器人
- 大面积前端组件测试
- 复杂状态机全路径测试

说明：

- 这些内容并非不重要，而是**不适合放在首发前的最小回归包里**。
- 它们更适合在首发稳定后，按模块单独治理。

## 8. 推荐目录和命名

推荐继续复用 `scripts/e2e/` 作为主目录，而不是另起一套复杂框架目录。

推荐原因：

- 仓库当前已经有大量 `scripts/e2e/*.mjs` 现成场景脚本。
- `release-smoke` 也已经把脚本化执行作为主流模式。
- 复用脚本目录可以降低门槛，避免同时引入“脚本系统 + 测试框架 + CI 门禁”三套心智负担。

建议后续子目录命名：

- `scripts/e2e/regression/`
- 或者在现有 `scripts/e2e/` 下按前缀组织：
  - `regression-auth.mjs`
  - `regression-health.mjs`
  - `regression-idempotency.mjs`
  - `regression-files.mjs`
  - `regression-menu.mjs`

如果后续希望做更规范的回归分层，也可以保留脚本入口，同时把公共请求助手沉淀到共享工具模块。

## 9. 推荐命令

以下命令只作为未来设计，不修改 `package.json`：

```bash
pnpm regression:first-release
pnpm regression:auth
pnpm regression:files
pnpm regression:idempotency
pnpm regression:menu
```

更细的拆分可以是：

```bash
pnpm regression:health
pnpm regression:users
pnpm regression:workorders
pnpm regression:leasing
```

建议命令形态保持和现有 `pnpm test:e2e:*` 一致，便于理解与执行。

## 10. 数据准备策略

建议回归包统一采用“固定前缀 + 可重复执行 + 尽量无脏数据依赖”的策略。

可用的数据来源：

- production seed
- bootstrap-admin
- 临时测试用户
- 临时测试工单
- 临时测试合同
- 临时测试文件

要求：

- 所有测试数据都带固定前缀，例如 `REGRESS_` 或按脚本名前缀。
- 所有测试数据都应可重复创建，避免依赖人工清库。
- 尽量不依赖已有脏数据或历史遗留业务数据。
- 不使用 dev seed。
- 不使用真实生产密码。

建议清理原则：

- 每个脚本尽量在结尾清理自己创建的测试数据。
- 如果不能清理，也应保证数据前缀足够明显，便于后续批量清理。

## 11. 环境变量策略

未来回归脚本可能需要的变量建议统一如下：

- `API_BASE_URL`
- `WEB_BASE_URL`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `TENANT_ID`
- `PARK_ID`
- `IDEMPOTENCY_KEY_PREFIX`
- `TEST_RUN_ID`

说明：

- 这些变量只用于脚本执行，不应写入真实密钥。
- `TEST_RUN_ID` 建议在每次执行时生成，作为数据前缀和日志标识。
- 如果要接 CI 或 release smoke，也应通过环境注入，不通过硬编码。

## 12. 验收标准

首发回归包设计完成后，应满足：

- 明确第一批脚本范围。
- 明确第二批脚本范围。
- 明确暂缓范围。
- 明确目录和命令建议。
- 明确测试数据策略。
- 明确未来是否进入 CI。

额外建议：

- 第一批必须能覆盖首发最关键的可用性风险。
- 每个脚本应可独立运行，也应可被组合执行。

## 13. 实施顺序

### C2-1：auth / health regression

- 目标：先把最关键的“能登录、能存活、能进入系统”验证固定下来。
- 建议文件：`scripts/e2e/regression-auth.mjs`、`scripts/e2e/regression-health.mjs`
- 当前落地：`scripts/e2e/first-release-auth-health.mjs`
- 执行命令：`node scripts/e2e/first-release-auth-health.mjs`
- 验证方式：登录成功/失败、`/health`、`/ready`、bootstrap-admin 后可登录。
- 风险点：依赖环境变量和 bootstrap-admin 状态，需固定测试账号。

### C2-2：idempotency replay + menu whitelist regression

- 目标：验证首批写接口的防重放行为，并用静态脚本锁定首发菜单白名单。
- 建议文件：`scripts/e2e/regression-idempotency.mjs`
- 当前落地：`scripts/e2e/first-release-idempotency.mjs`、`scripts/e2e/first-release-menu-whitelist.mjs`
- 执行命令：`node scripts/e2e/first-release-idempotency.mjs`、`node scripts/e2e/first-release-menu-whitelist.mjs`
- 第一版覆盖范围：`POST /users`、`POST /work-orders` 的 missing key / first request / replay / conflict；菜单白名单静态断言。
- 验证方式：同 key 重放、冲突、失败后重试、缓存响应一致。
- 风险点：需要固定 `TEST_RUN_ID` 和可重复的写入前置数据。
- 暂缓项：合同 / 应收 / 收款回归留到第二批，因为它们的数据依赖更深、联动面更大，更适合在用户和工单回归稳定后再补。

### C2-3：files regression

- 目标：验证上传、下载、权限和基础文件行为。
- 建议文件：`scripts/e2e/regression-files.mjs`
- 当前落地：`scripts/e2e/first-release-files.mjs`
- 执行命令：`node scripts/e2e/first-release-files.mjs`
- 当前覆盖范围：登录、单文件上传、下载内容比对、删除、删除后不可再次下载。
- 暂缓范围：超大文件、非法 MIME、病毒 / 内容 sniff、多文件批量上传、权限越权下载、业务附件绑定复杂场景。
- 验证方式：上传成功、下载成功、MIME/大小边界、删除/软删语义。
- 风险点：要注意文件清理和 volume 依赖。

### C2-4a：users + assets read 最小链路回归

- 目标：先补最稳定的用户读写最小链路，以及资产模块的只读验证。
- 建议文件：`scripts/e2e/regression-users-assets.mjs`
- 当前落地：`scripts/e2e/first-release-users-assets.mjs`
- 执行命令：`node scripts/e2e/first-release-users-assets.mjs`
- 当前覆盖范围：登录、用户列表、创建测试用户、用户详情回读、`assets/parks`、`assets/buildings`、`assets/floors`、`assets/units` 只读。
- 暂缓范围：workorders、leasing contract / receivables / payments、资产写操作、浏览器 E2E。
- 验证方式：用户创建后可在详情和列表中回读，资产列表接口可稳定返回可解析的分页结构。
- 风险点：用户创建依赖幂等 key 和固定测试前缀，资产只读需要生产 seed / 基础数据可访问。

### C2-4：menu whitelist regression

- 目标：验证首发菜单范围和隐藏模块策略。
- 建议文件：`scripts/e2e/regression-menu.mjs`
- 验证方式：读取菜单白名单配置，断言白名单路径可见、非首发路径默认不展示。
- 风险点：适合做静态/轻量检查，不建议升级成浏览器 E2E。

### C2-5：workorders / leasing regression

- 目标：把工单和租赁财务链路补成可回归最小集。
- 建议文件：`scripts/e2e/regression-workorders.mjs`、`scripts/e2e/regression-leasing.mjs`
- 验证方式：工单最小创建/列表、合同到应收/收款最小链。
- 风险点：数据依赖更高，建议在 users / assets / files 稳定后再做。

### 已落地状态

#### C2-4b：workorders create/list regression

- 状态：已落地
- 脚本：`scripts/e2e/first-release-workorders.mjs`
- 执行命令：`node scripts/e2e/first-release-workorders.mjs`
- 当前覆盖范围：
  - 登录
  - 工单列表查询
  - 工单创建
  - 列表回读
  - 详情回读
- 暂缓范围：
  - 工单状态流转
  - SLA / 超时
  - 附件绑定
  - 评论 / 处理记录
  - leasing contract / receivables / payments
  - 浏览器 E2E

## 14. 建议 Issue 列表

### Issue 1

- 标题：`define first-release regression package and script layout`
- 优先级：P1
- 背景：首发核心能力已经收口，但缺少一套稳定、可复用的回归分层设计。
- 任务：
  - 确定第一批、第二批、暂缓范围。
  - 确定脚本目录和命名。
  - 确定未来命令形态。
- 验收标准：
  - 文档可直接指导后续脚本实现。

### Issue 2

- 标题：`add auth and health regression scripts`
- 优先级：P1
- 背景：登录和健康检查是首发最基础的可用性验证。
- 任务：
  - 编写 auth regression。
  - 编写 health / ready regression。
  - 固化测试账号和环境变量约定。
- 验收标准：
  - 每次发布前可独立运行。

### Issue 3

- 标题：`add idempotency replay regression`
- 优先级：P1
- 背景：首批 5 个幂等接口属于高风险写接口。
- 任务：
  - 验证重放、冲突、失败重试。
  - 固化 `TEST_RUN_ID` 与幂等 key 前缀。
- 验收标准：
  - 重放行为和现有语义一致。

### Issue 4

- 标题：`add files upload and download regression`
- 优先级：P1
- 背景：文件上传下载和运维感知强，失败容易直接暴露。
- 任务：
  - 验证上传、下载、权限、大小/MIME 边界。
  - 保证可重复执行和可清理。
- 验收标准：
  - 上传下载链路可被稳定回归。

### Issue 5

- 标题：`add menu whitelist static regression`
- 优先级：P2
- 背景：首发菜单白名单已经落地，但缺少自动断言。
- 任务：
  - 自动校验白名单路径和隐藏模块。
  - 生成可读性良好的输出。
- 验收标准：
  - 菜单范围偏移可快速发现。

### Issue 6

- 标题：`add users workorders and leasing minimal regression`
- 优先级：P2
- 背景：这些是首发后最容易被业务频繁触达的核心链路。
- 任务：
  - 逐步补最小 API 回归。
  - 保持数据前缀和清理策略统一。
- 验收标准：
  - 形成第二批稳定回归包。
