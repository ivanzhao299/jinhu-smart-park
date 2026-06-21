# JinHu Smart Park 生产验收矩阵与风险清单

## 1. 目的和边界

本文用于生产或预生产发布前的 Go / No-Go 判断，统一记录必须通过的测试矩阵、发布检查项、风险清单和回滚检查项。

边界：

- 本文是验收和发布门禁文档，不替代 `production-release-sop.md` 的执行步骤。
- 生产环境默认不运行会写入业务数据的 e2e。确需执行时，必须有发布负责人批准、测试账号、测试数据标识和清理方案。
- 不在文档、脚本或提交中记录真实生产密码、token、数据库连接串或私有凭据。
- 任何 No-Go 项未关闭前，禁止上线或禁止开放对应模块。

## 2. 环境适用性

| 环境 | 可运行检查 | 默认禁止 | 通过口径 |
|---|---|---|---|
| 本地 | `lint`、`typecheck`、`build`、本地 Docker DB、写入型 smoke、first-release regression | 使用真实生产凭据、连接真实生产库 | 工程门禁和相关 smoke 均通过，测试数据可清理 |
| 预生产 | 完整发布链路、migration、production seed、bootstrap-admin、完整回归、财务/安全/IoT 写入型 smoke | 未脱敏生产数据、无清理方案的破坏性测试 | 与生产配置尽量一致，完整回归和发布健康检查通过 |
| 生产 | release smoke、`/health`、`/ready`、登录验证、只读查询、文件受控抽样、幂等受控抽样 | 未批准的写入型 e2e、dev seed、真实业务数据破坏性操作 | 健康检查、登录、文件、菜单、核心只读抽样通过，观察期无 P0 |

## 3. 分层验证命令

### 3.1 必跑

本地和预生产必须跑。生产发布窗口只跑环境安全的发布健康检查、登录验证、文件抽样和只读业务抽样。

```bash
git status --short
pnpm lint
pnpm typecheck
pnpm build
pnpm test:e2e
node scripts/e2e/first-release-auth-health.mjs
node scripts/e2e/first-release-menu-whitelist.mjs
node scripts/e2e/first-release-files.mjs
node scripts/e2e/first-release-users-assets.mjs
node scripts/e2e/first-release-workorders.mjs
node scripts/e2e/first-release-idempotency.mjs
```

预生产和生产发布链路必须跑：

```bash
pnpm db:migrate
ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod
pnpm db:check:init
pnpm db:bootstrap:admin
pnpm db:check:init
MODE=full pnpm prod:health
bash scripts/verify-api-login-dockerexec.sh
```

### 3.2 财务相关必跑

本地和预生产必须跑。生产环境只允许在发布负责人批准的受控测试账号和可清理数据范围内抽样。

```bash
node scripts/e2e/s3c-contract-smoke.mjs
node scripts/e2e/s3d-payment-smoke.mjs
node scripts/e2e/s3d-waiver-smoke.mjs
node scripts/e2e/s3d-invoice-smoke.mjs
node scripts/e2e/s3e-contract-lifecycle-smoke.mjs
node scripts/e2e/first-release-leasing.mjs
node scripts/e2e/first-release-idempotency.mjs
```

### 3.3 安全 / IoT 相关必跑

本地和预生产必须跑。生产环境对会创建工单、隐患、告警、能耗账单或测试设备的脚本默认禁止。

```bash
node scripts/e2e/s5a-safety-smoke.mjs
node scripts/e2e/s5b-emergency-permit-smoke.mjs
node scripts/e2e/safety-module-access-smoke.mjs
node scripts/e2e/s9a-iot-device-hub-smoke.mjs
node scripts/e2e/s9b-iot-runtime-alert-smoke.mjs
node scripts/e2e/s9c-iot-rule-engine-smoke.mjs
node scripts/e2e/s9d-iot-scene-center-smoke.mjs
node scripts/e2e/s9d1-unified-action-executor-smoke.mjs
node scripts/e2e/s9e-energy-meter-monitor-smoke.mjs
node scripts/e2e/s9f-energy-billing-tenant-smoke.mjs
node scripts/e2e/s9f1-energy-billing-adjustment-reversal-smoke.mjs
```

### 3.4 发布前完整回归

本地和预生产完整跑。生产只跑 release smoke、健康检查、登录、文件和只读/受控抽样。

```bash
pnpm check:s1
node scripts/e2e/first-release-regression.mjs
pnpm test:e2e
node scripts/e2e/s9a-iot-device-hub-smoke.mjs
node scripts/e2e/s9b-iot-runtime-alert-smoke.mjs
node scripts/e2e/s9c-iot-rule-engine-smoke.mjs
node scripts/e2e/s9d-iot-scene-center-smoke.mjs
node scripts/e2e/s9d1-unified-action-executor-smoke.mjs
node scripts/e2e/s9e-energy-meter-monitor-smoke.mjs
node scripts/e2e/s9f-energy-billing-tenant-smoke.mjs
node scripts/e2e/s9f1-energy-billing-adjustment-reversal-smoke.mjs
```

说明：

- `node scripts/e2e/first-release-regression.mjs` 当前覆盖菜单、auth、幂等、文件、用户/资产、工单、租赁核心。
- IoT / 能耗专项 smoke 当前不在 first-release runner 中，发布前完整回归需要单独执行。
- `pnpm test:e2e` 覆盖当前 package script 中的 S1、S2、S3、S5 主链路，不覆盖全部 S9 IoT / 能耗专项。

## 4. 生产就绪矩阵

| 域 | 验证目标 | 建议命令 | 环境适用性 | 通过标准 | No-Go 条件 | 责任域 |
|---|---|---|---|---|---|---|
| Auth | 密码登录、错误密码失败、JWT、`/auth/login`、`/auth/me`、短信 mock 禁用、微信 mock 禁用 | `node scripts/e2e/first-release-auth-health.mjs`；`bash scripts/verify-api-login-dockerexec.sh`；`MODE=full pnpm prod:health` | 本地、预发、生产均必须验证；生产只用受控账号 | 正确密码登录成功，错误密码失败，`/auth/me` 正常，mock 配置关闭 | 登录失败、错误密码未拒绝、`AUTH_SMS_FIXED_CODE` 非空、`AUTH_SMS_CODE_VISIBLE` 非 `false`、`AUTH_WECHAT_MOCK_ENABLED` 非 `false` | Agent 5；auth 责任人 |
| RBAC | 权限种子、角色权限、超级管理员、普通角色拒绝、数据权限、幂等写保护 | `pnpm test:e2e`；`node scripts/e2e/s1-rbac-std-fix-smoke.mjs`；`node scripts/e2e/first-release-idempotency.mjs` | 本地、预发完整跑；生产只做登录后权限只读抽样 | 角色权限匹配，越权请求被拒绝，幂等重复请求不重复写入 | 普通角色越权、超级管理员缺权、幂等冲突语义异常 | Agent 4 / Agent 5 |
| 菜单 | 首发菜单白名单、隐藏非首发能力、前端路由和 API 权限一致 | `node scripts/e2e/first-release-menu-whitelist.mjs` | 本地、预发必须跑；生产人工抽样菜单 | 必开菜单可见，隐藏菜单不出现在首发菜单中 | 非首发菜单误开放、首发菜单缺失、菜单权限与角色不一致 | Agent 4 / Agent 5 |
| 租户 | 租户档案、联系人、资质、租户 360 聚合、数据隔离 | `node scripts/e2e/s3a-park-tenant-smoke.mjs`；`node scripts/e2e/first-release-users-assets.mjs` | 本地、预发完整跑；生产只读抽样 | 租户 CRUD/查询、360 聚合、关联数据隔离正常 | 租户 360 关键节点缺失、跨租户数据可见 | Agent 1 / Agent 5 |
| 资产 | 园区、楼栋、楼层、房源、房源状态板、当前租户、资产统计 | `node scripts/e2e/s2b-smoke.mjs`；`node scripts/e2e/first-release-users-assets.mjs` | 本地、预发完整跑；生产只读抽样 | 资产层级、房源详情、状态板、统计口径正常 | 房源当前租户错误、资产统计明显失真、数据隔离失败 | Agent 1 / Agent 5 |
| 合同 | 招商线索、报价、合同创建、合同详情、生命周期、到期筛选、合同房源 | `node scripts/e2e/s3b-leasing-crm-smoke.mjs`；`node scripts/e2e/s3c-contract-smoke.mjs`；`node scripts/e2e/s3e-contract-lifecycle-smoke.mjs` | 本地、预发完整跑；生产只读抽样 | 合同创建、签约、生效、到期筛选和合同房源关联正常 | 合同状态流转异常、合同房源丢失、到期筛选错误 | Agent 2 / Agent 5 |
| 财务 | 应收、收款、核销、发票、减免、删除/作废保护、幂等和审计 | `node scripts/e2e/s3d-payment-smoke.mjs`；`node scripts/e2e/s3d-waiver-smoke.mjs`；`node scripts/e2e/s3d-invoice-smoke.mjs`；`node scripts/e2e/first-release-leasing.mjs` | 本地、预发完整跑；生产只允许受控抽样 | 财务写入、核销、发票、减免、删除保护、幂等均符合规则 | 已核销/已开票/已减免数据可删除，重复支付或重复应收，审计缺失 | Agent 2 / Agent 5 |
| 工单 | 创建、流转、租户/房源关联、首发工单回归 | `node scripts/e2e/first-release-workorders.mjs`；`pnpm test:e2e` | 本地、预发完整跑；生产只读抽样 | 工单创建、列表、状态、统计和关联数据正常 | 工单不可创建、状态流转异常、关联租户/房源错误 | Agent 3 / Agent 5 |
| 安全 | 巡检点、巡检任务、隐患创建、整改、复查、租户/房源安全记录、统计 | `node scripts/e2e/s5a-safety-smoke.mjs`；`node scripts/e2e/s5b-emergency-permit-smoke.mjs`；`node scripts/e2e/safety-module-access-smoke.mjs` | 本地、预发完整跑；生产只读或批准后抽样 | 安全核心菜单、巡检、隐患、整改、统计和访问控制正常 | 隐患不可见、整改链路失败、安全菜单权限异常 | Agent 3 / Agent 5 |
| IoT | 设备、告警、规则、场景、统一动作执行器、自动创建隐患、能耗计费 | S9A-S9F1 smoke；重点 `node scripts/e2e/s9d1-unified-action-executor-smoke.mjs` | 本地、预发完整跑；生产默认禁止写入型 IoT smoke | IoT 规则和场景能触发统一动作，自动隐患可在列表/360/房源/统计中可见 | 自动动作重复创建、自动隐患不可见、能耗计费回滚失败 | Agent 3 / Agent 5 |
| 文件上传 | MIME/大小限制、上传、下载、业务关联、持久化目录、生产文件备份 | `node scripts/e2e/first-release-files.mjs`；生产文件受控抽样 | 本地、预发、生产均需验证；生产使用非敏感样本 | 上传下载成功，路径持久化，业务关联可追溯，备份已完成 | 上传失败、下载失败、文件目录未持久化、文件备份缺失 | Agent 5 / 运维 |
| 审计日志 | 关键写操作、状态流转、登录失败、财务保护操作 | 相关 smoke 后抽查审计表/页面；发布后人工只读抽样 | 本地、预发抽样；生产只读抽样 | 登录失败、关键写入、财务保护和状态流转有审计记录 | 关键写操作无审计、财务保护无记录、审计页面不可查 | Agent 5 / 各业务 Agent |
| Migration | 前向迁移、checksum、history、重复编号风险、失败即停 | `pnpm db:migrate`；检查 migration 日志和 history 表 | 预发和生产必须执行；本地按需 | 新增迁移成功或无新增快速跳过，checksum 无冲突，失败会停止 | migration 失败、checksum 冲突、history 异常、重复编号未评估 | Agent 5 / 数据库负责人 |
| Seed | production seed 与 dev seed 隔离、`ALLOW_PRODUCTION_SEED=yes`、首发基线 | `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod`；`pnpm db:check:init` | 预发和生产必须执行；本地按需 | production seed 成功，dev seed 未误跑，基线检查通过或明确记录 | production seed 失败、误跑 dev seed、基线缺失 | Agent 5 / 发布负责人 |
| 部署健康 | `/health`、`/ready`、Web `/login`、容器、磁盘、文件目录、Docker cleanup | `MODE=full pnpm prod:health`；`pnpm prod:deploy`；`pnpm prod:cleanup` | 预发和生产必须执行 | API liveness/readiness 和 Web login 通过，容器健康，磁盘和文件目录正常 | `/ready` 失败、容器 unhealthy、磁盘不足、部署后 cleanup 未执行或失败未记录 | Agent 5 / 运维 |

## 5. 发布前检查清单

| 阶段 | 检查项 | 必须证据 | Go / No-Go |
|---|---|---|---|
| 代码冻结 | 发布 commit 冻结，`git status --short` clean | commit hash、分支、CI 链接 | 不 clean 且未说明原因为 No-Go |
| 工程门禁 | `pnpm lint`、`pnpm typecheck`、`pnpm build` | 本地/CI 日志 | 任一失败为 No-Go |
| CI | `verify` 和 `release-smoke` 通过 | GitHub Actions 结果 | 任一失败为 No-Go |
| 数据备份 | PostgreSQL 和文件目录 / volume 备份完成 | 备份路径、校验、责任人 | 备份缺失为 No-Go |
| Migration | migration 清单冻结，history/checksum 正常 | `pnpm db:migrate` 日志 | 失败或 checksum 冲突为 No-Go |
| Seed | production seed 成功，dev seed 未误跑 | seed 日志、`ALLOW_PRODUCTION_SEED=yes` | seed 失败为 No-Go |
| 初始化 | `bootstrap-admin` 和两次 `db:check:init` 完成 | 命令日志 | 首管不可登录或基线失败为 No-Go |
| Auth 配置 | SMS / WeChat mock 关闭 | 环境变量核对记录 | mock 误启用为 No-Go |
| 回归 | 必跑、财务、安全/IoT、完整回归按范围完成 | 命令日志、失败清单 | P0 或目标模块失败未关闭为 No-Go |
| 部署健康 | `/health`、`/ready`、Web `/login` 通过 | `MODE=full pnpm prod:health` 日志 | 任一失败为 No-Go |
| 回滚准备 | 上一版镜像 tag、数据库备份、文件备份、回滚负责人确认 | 回滚清单 | 任一缺失为 No-Go |

## 6. Go / No-Go 标准

### Go 条件

- 当前发布 commit、镜像 tag、数据库备份、文件备份和回滚 tag 已冻结并记录。
- `pnpm lint`、`pnpm typecheck`、`pnpm build`、CI `verify` 均通过。
- `release-smoke` 通过，且目标环境 migration、production seed、bootstrap-admin、`db:check:init` 均通过。
- `MODE=full pnpm prod:health` 和 `verify-api-login-dockerexec.sh` 通过。
- 必跑、财务、安全/IoT、完整回归按发布范围完成，未关闭问题均非 P0/P1 且有负责人接受。
- 生产 auth mock 配置关闭，文件上传下载受控抽样通过。
- 观察期责任人、回滚决策人和值守窗口明确。

### No-Go 条件

- `pnpm typecheck`、`pnpm lint`、`pnpm build`、CI `verify` 或 `release-smoke` 任一失败。
- migration 失败、checksum 冲突、history 异常、重复编号风险未评估。
- production seed 失败、误跑 dev seed、`ALLOW_PRODUCTION_SEED=yes` 缺失。
- `db:check:init`、`bootstrap-admin`、登录验证、auth smoke 失败。
- `AUTH_SMS_FIXED_CODE` 非空、`AUTH_SMS_CODE_VISIBLE` 非 `false`、`AUTH_WECHAT_MOCK_ENABLED` 非 `false`。
- `/health`、`/ready`、Web `/login`、文件上传下载或持久化目录验证失败。
- 首发菜单白名单失败、非首发菜单误开放。
- 财务删除/作废保护、收款核销、发票、减免、幂等或审计回归失败。
- 安全隐患、工单、IoT 自动隐患可见性回归失败且影响对应模块开放。
- 数据库备份、文件备份、上一版镜像 tag 或回滚责任人缺失。
- 部署后 Docker cleanup 未执行或失败且未记录处理方案。

## 7. 风险清单

| 风险 | 影响 | 发现方式 | 缓解和建议 |
|---|---|---|---|
| migration 前向不可逆或半执行失败 | 数据库结构与代码不一致，可能需要恢复备份 | `pnpm db:migrate` 日志、history 表、checksum 记录 | 发布前备份；失败即停；数据库负责人确认后恢复或重试 |
| 重复 migration 编号 | 人工排查困难，排序和审计易混乱 | migration 清单冻结时检查 | 不新增重复编号；已知重复编号必须在发布记录中标注 |
| production seed 与 dev seed 混用 | 生产出现测试账号、样例数据或固定密码 | seed 日志和命令审计 | 生产只允许 `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod` |
| auth mock 误启用 | 生产登录安全风险 | 环境变量检查、auth smoke | 保持 `AUTH_SMS_FIXED_CODE` 空、`AUTH_SMS_CODE_VISIBLE=false`、`AUTH_WECHAT_MOCK_ENABLED=false` |
| 菜单和权限不一致 | 首发能力不可用或非首发能力误开放 | menu whitelist smoke、RBAC smoke、人工验收 | 菜单白名单失败禁止上线；权限变更需同步回归 |
| 财务删除/作废保护缺口 | 应收、收款、发票、减免数据不可审计或被误删 | 财务 smoke、审计抽样 | 对财务 P0 失败执行 No-Go；修复交 Agent 2 |
| 幂等覆盖不足 | 重复扣款、重复应收、重复工单或重复隐患 | first-release idempotency、业务专项 smoke | 对写入型接口保留 idempotency 或等价防重策略 |
| IoT 自动动作不可见或重复创建 | 工单/隐患已创建但列表、360、房源或统计不可见 | S9D1 smoke、DB 关联字段检查 | 失败时停止开放相关联动，修复交 Agent 3 |
| 文件目录未持久化或未备份 | 上传文件丢失，业务附件不可恢复 | files smoke、生产受控上传下载、备份校验 | 发布前确认 `FILE_STORAGE_LOCAL_ROOT`、volume 和备份 |
| 生产 smoke 写入数据未清理 | 生产业务数据污染 | TEST_RUN_ID、remark、审计查询 | 生产默认禁止写入型 e2e；必须批准和清理 |
| 本地 fixture 与目标环境不一致 | 回归假阳性或假阴性 | 预发完整回归、失败日志 | 将生产发布判断优先建立在预发和目标环境验证上 |
| 回滚只回镜像不回数据 | 新 schema 或 seed 与旧代码不兼容 | migration/seed 记录、回滚演练 | 回滚前确认是否需要数据库和文件恢复 |
| 部署后未清理 Docker | 磁盘增长导致服务不可用 | `df -h`、Docker image/container 检查 | 发布健康检查后执行 Docker cleanup 并记录结果 |

## 8. 回滚检查清单

| 步骤 | 检查项 | 责任人 | 通过标准 |
|---|---|---|---|
| 触发判断 | `/ready` 失败、登录失败、P0、财务写入异常、文件上传失败、数据库连接异常、5xx 激增 | 回滚决策人 | 明确 Go / Rollback 决策和时间点 |
| 现场冻结 | 记录当前 commit、镜像 tag、migration 批次、seed 日志、错误日志 | 发布负责人 | 证据已归档，停止继续变更 |
| 备份确认 | PostgreSQL 备份、文件备份、上一版镜像 tag 可用 | 数据库负责人 / 运维 | 可定位、可读取、可恢复 |
| 应用回滚 | 切回上一版 API/Web 镜像 | 运维 | 容器启动成功 |
| 数据回滚 | 如 migration/seed 写入不可兼容数据，确认是否恢复 DB 备份 | 数据库负责人 | 数据库状态与回滚镜像兼容 |
| 文件回滚 | 如文件目录写入错误文件，按文件备份恢复 | 运维 | 受控下载抽样通过 |
| 回滚后验证 | auth、RBAC、菜单、文件、核心财务只读、工单/安全只读、审计日志 | Agent 5 / 业务验收 | `MODE=full pnpm prod:health` 和登录验证通过，无 P0 |
| 复盘结论 | 记录触发原因、恢复范围、数据一致性、遗留风险、再次发布条件 | 发布负责人 | 形成可追溯结论 |

## 9. 当前命令覆盖缺口

- `first-release-regression.mjs` 当前不包含 S9 IoT / 能耗专项脚本，发布前完整回归需单独执行 S9A-S9F1。
- `pnpm test:e2e` 当前不包含 first-release runner，也不包含全部 IoT / 能耗专项。
- 生产环境写入型 e2e 需要单独批准；默认不能用本地/预发 smoke 结果替代生产健康检查。
- 审计日志目前主要依赖业务 smoke 后的抽样核查，建议后续补充更明确的审计日志专项回归。
