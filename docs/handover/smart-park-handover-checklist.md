# 金湖智慧园区数字运营 SaaS 平台移交清单

生成日期：2026-06-12
口径校正日期：2026-07-24
当前阶段：持续开发完善与 UAT 验收；当前最高环境为 UAT，尚未真实投入生产
未来生产域名：https://<production-domain>（占位，尚未作为真实生产入口启用）
代码仓库：git@github.com:ivanzhao299/jinhu-smart-park.git

> 安全原则：本文档不保存任何明文密码、私钥、数据库密码、JWT 密钥、第三方 token、管理员密码或完整敏感连接串。所有密钥应通过 1Password、Bitwarden、企业微信密封消息或线下密封交接。
>
> 当前权威口径：[产品范围](../product/current-product-scope.md)、[环境矩阵](../deployment/environment-matrix.md)、[全量产品 UAT 矩阵](../uat/full-product-acceptance-matrix.md)。本文后续 commit、数量和 First Release 内容是 2026-06-12 的历史移交快照，不应视为 2026-07-24 的实时仓库状态或真实生产证明。

## 1. 2026-06-12 历史基线

- 当前工作分支：`docs/update-smart-park-handover-checklist`
- 当前 `main` / `origin/main` / `HEAD`：`2f2a1cfa2c4691f8c1afc786feaedc6b2842e6ca`
- 最近提交：
  - `2f2a1cf Merge pull request #133 from ivanzhao299/docs/audit-handover-checklist-drift`
  - `0fe26d8 docs: audit smart park handover checklist drift`
  - `9b5d18a Merge pull request #132 from ivanzhao299/docs/first-release-target-env-verification-execution`
  - `54138a6 docs: add first release verification execution record`
  - `7df40d6 Merge pull request #131 from ivanzhao299/docs/first-release-target-env-verification-dry-run`
  - `bec1a55 docs: add first release target environment dry-run`
  - `c5de6c7 Merge pull request #130 from ivanzhao299/docs/first-release-target-env-verification-plan`
  - `9fbb989 docs: add first release target environment verification plan`
  - `641050a Merge pull request #129 from ivanzhao299/docs/first-release-readiness-gap-analysis`
  - `6314aa6 docs: add first release readiness gap analysis`
- 已建立重要 tag：
  - `v1-smartpark-s9f1-energy-adjustment`
  - `v1-smartpark-s9f-energy-billing`
  - `v1-smartpark-s9e-baseline-freeze`
- 当前 migration 数量：141
- 当前最新 migration：`database/migrations/000140_expand_audit_request_id.sql`
- 当前 smoke/e2e 脚本数量：35
- 当前前端 `page.tsx` 页面数量：110
- 当前 handover drift 审计报告：`docs/handover/smart-park-handover-checklist-drift-report.md`

## 2. 已完成模块范围

- S0 工程底座
- S1 系统基础支撑
- S1.5 工程治理加固
- S1-RBAC-STD / FIX：租户、角色、权限、数据权限、字段权限、编码规则、模块授权
- S2-A / S2-B：资产主数据、房源增强、状态看板、统计
- S3-A：租户企业与租户 360
- S3-B：招商 CRM
- S3-C-A：合同主流程
- S3-D-A：应收账单、收款、账龄、豁免、发票
- S3-E-A：合同变更、续租、退租、结算、退款
- S4-A：工单系统基础闭环
- S5-A：安全巡检与隐患整改
- S5-B：应急事件与作业许可
- S6-A / S9-A / S9-B / S9-C：IoT 设备、实时状态、告警、规则引擎
- S9-D：场景联动中心
- S9-D.1：统一动作执行器
- S9-E：能源计量与用能监测
- S9-F：能源分摊与租户账单联动
- S9-F.1：能源账单调整与红冲机制
- S8-C / S8-D / S8-E / S8-F：视频安防点位、平台适配、取证、告警大屏
- 机器人模块：萤石清洁机器人接入骨架、可见性 seed、设备同步权限补丁
- 首版发布治理：readiness checklist、gap analysis、target environment verification plan / dry-run / execution record
- API snapshot release gate：默认 schema snapshot、`workorders.stats.numeric` 专项 baseline、manual workflow

## 3. 仓库与开发权限移交

必须移交：

- GitHub 仓库 Owner/Admin 权限。
- 受保护分支规则管理权限。
- GitHub Actions 管理权限。
- GitHub Environments `production` 管理权限。
- GitHub Secrets 读写权限。
- Git tag 发布权限。
- Issue / PR / Release 管理权限。

建议团队角色：

- 技术负责人：Repository Admin
- 后端负责人：Maintain
- 前端负责人：Maintain
- 测试负责人：Triage + Actions read
- 运维负责人：Admin 或单独 Production environment approver

GitHub Actions Secrets 需要移交/核对：

- `PROD_HOST`
- `PROD_USER`
- `PROD_SSH_KEY`
- `PROD_DEPLOY_PATH`

部署权限注意：

- 当前 `.github/workflows/deploy-production.yml` 已不是远端 `git pull` 部署。
- 当前 workflow 在 GitHub Actions runner 侧 checkout 后执行 `rsync -az --delete` 到 `PROD_DEPLOY_PATH`。
- 同步完成后，workflow 在远端执行 `PRUNE_DOCKER_AFTER_DEPLOY=yes pnpm prod:deploy && pnpm prod:health`。
- `<production-deploy-path>` 是否仍不是 git worktree，需要接手团队远端人工确认；当前仓库只可确认 workflow 不再依赖远端 git worktree。
- 需要确认 rsync 排除项、远端 `.env.production`、上传/存储目录和数据目录不会被覆盖或误删。

## 4. 服务器与生产权限移交

生产服务器：

- IP：`<production-server-ip>`
- SSH 用户：`<ssh-user>`
- 生产路径：`<production-deploy-path>`
- 生产域名：`<production-domain>`
- Web 容器端口：宿主机 `3410`
- API 容器端口：宿主机 `3411`
- PostgreSQL 宿主机端口：`5433`

必须移交：

- SSH 私钥与 passphrase，如有。
- 服务器 root 登录权限或 sudo 运维账号。
- 云服务器控制台账号权限。
- 安全组/防火墙管理权限。
- 磁盘快照/镜像管理权限。
- 备份与恢复权限。
- Nginx 配置目录权限。
- Docker / Docker Compose 操作权限。
- 生产 `.env.production` 查看与修改权限。

SSH 操作注意：

- 该服务器对 SSH 握手和大包传输比较敏感。
- 远端操作应使用短命令、少输出、低带宽传输。
- 推荐 SSH 参数：

```bash
ssh -i ~/.ssh/id_ed25519 \
  -o ConnectTimeout=40 \
  -o ServerAliveInterval=10 \
  -o ServerAliveCountMax=1 \
  -o IPQoS=none \
  -o Compression=no \
  -o Ciphers=aes128-ctr \
  <ssh-user>@<production-server-ip>
```

小文件同步示例：

```bash
rsync -avR --bwlimit=64 \
  -e "ssh -i ~/.ssh/id_ed25519 -o IPQoS=none -o Compression=no -o Ciphers=aes128-ctr" \
  scripts/prod-deploy.sh <ssh-user>@<production-server-ip>:<production-deploy-path>/
```

## 5. 域名、DNS 与 HTTPS 权限移交

必须移交：

- `<company-domain>` 域名解析平台管理权限。
- `<production-domain>` DNS 记录管理权限。
- HTTPS 证书申请/续期权限。
- Nginx 站点配置权限。
- 如使用 Certbot：Certbot 配置和续期任务权限。

当前外部健康检查：

```bash
curl -I https://<production-domain>/login
curl -s https://<production-domain>/api/v1/health
```

## 6. 生产环境变量与密钥移交

生产环境文件：

- `<production-deploy-path>/.env.production`
- 模板：`.env.production.example`

必须通过安全渠道移交：

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `AI_API_KEY`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`
- `RABBITMQ_URL`
- `REDIS_URL`
- `TIMESCALE_URL`
- `IOT_RULE_WEBHOOK_ALLOWLIST`
- 第三方视频平台 app key / app secret / token
- 萤石机器人相关 app key / secret / token
- 任何短信、微信、邮件、对象存储、AI、IoT 厂家密钥

不得移交方式：

- 不要写入 Git。
- 不要发普通微信群。
- 不要写入项目文档。
- 不要截图保存。
- 不要在 issue、PR、CI log、handover 文档或 release 记录中写真实密码、真实 token、真实 JWT secret 或完整敏感连接串。

生产安全变量必须确认：

- `AUTH_SMS_FIXED_CODE` 为空。
- `AUTH_SMS_CODE_VISIBLE=false`。
- `AUTH_WECHAT_MOCK_ENABLED=false`。

## 7. 数据库权限移交

必须移交：

- PostgreSQL 管理账号。
- 业务数据库账号。
- 备份账号，如有。
- 数据库连接地址、端口、库名。
- 生产数据库备份策略。
- 迁移执行权限。

当前容器内迁移：

```bash
pnpm db:migrate
```

生产部署脚本会执行 migration：

```bash
pnpm prod:deploy
```

数据库注意事项：

- migrations 是 forward-only。
- 当前 migration 数量为 141。
- 最新 migration 为 `000140_expand_audit_request_id.sql`。
- 当前尾部 migration 包括：
  - `000132_robot_ezviz_cleaning_integration.sql`
  - `000133_s9d_iot_scene_center.sql`
  - `000134_robot_cleaning_visibility_seed.sql`
  - `000135_s9e_energy_meter_monitor.sql`
  - `000136_idempotency_request.sql`
  - `000136_s9f_energy_billing_allocation.sql`
  - `000137_s9f1_energy_billing_adjustment_reversal.sql`
  - `000138_robot_ezviz_device_sync_permission_patch.sql`
  - `000139_sys_schema_migration_history.sql`
  - `000140_expand_audit_request_id.sql`
- 仓库存在重复 `000136_*` migration 历史，新 migration 编号需要额外小心。
- 每次生产 migration 前必须备份。
- 不允许直接修改历史 migration。

## 8. Docker 与部署权限移交

生产脚本：

- `pnpm prod:deploy`
- `pnpm prod:health`
- `pnpm prod:cleanup`
- `pnpm prod:up`
- `pnpm prod:down`

Compose 文件：

- `infra/docker/docker-compose.prod.yml`

部署流程：

1. GitHub Actions 通过 `rsync -az --delete` 同步仓库文件到生产目录。
2. 远端执行 `PRUNE_DOCKER_AFTER_DEPLOY=yes pnpm prod:deploy && pnpm prod:health`。
3. 构建 API/Web 镜像。
4. 启动 PostgreSQL。
5. 执行 migration。
6. 可选执行 production seed。
7. 启动 API/Web。
8. 执行健康检查。
9. 清理旧 Docker container、未使用镜像、build cache。

磁盘策略：

- 当前部署后会自动运行 Docker 清理逻辑。
- 只保留当前运行容器使用的镜像。
- 清空 Docker build cache。
- 不清理 volumes，避免删除 PostgreSQL 数据。

部署风险与人工确认：

- `deploy-production.yml` 当前不再远端执行 `git pull`。
- `<production-deploy-path>` 是否为 git worktree 仍需远端人工确认，但当前 workflow 已不依赖这一点。
- 需要人工确认远端目录内 `.env.production`、文件存储、上传目录、数据库 volume、日志目录不会被 rsync 删除或覆盖。
- 当前 deploy workflow 是源码 rsync + 远端构建/部署，不是完整 build artifact 发布方案；是否要进一步改造为 artifact/registry 发布可作为后续运维优化。

## 9. CI/CD 移交

CI / workflow 文件：

- `.github/workflows/ci.yml`
- `.github/workflows/api-snapshot-numeric.yml`
- `.github/workflows/deploy-production.yml`

`ci.yml` verify job 执行：

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm --filter @jinhu/shared build`
- `pnpm typecheck`
- `pnpm build`

`ci.yml` release-smoke job：

- 触发方式：`workflow_dispatch`，或 PR 带 `run-release-smoke` label。
- 依赖 verify job。
- 启动 PostgreSQL。
- 执行 `pnpm db:migrate`。
- 执行 `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod`。
- 执行 `pnpm db:bootstrap:admin`。
- 执行 `pnpm db:check:init`。
- 启动 API。
- 执行 `scripts/verify-api-login-dockerexec.sh`。
- 上传 release-smoke logs artifact。

`api-snapshot-numeric.yml` manual workflow：

- workflow 名称：`API Snapshot Numeric`。
- 触发方式：`workflow_dispatch`。
- 不接入普通 `push` / `pull_request` CI。
- 使用 isolated DB 和 fixed dataset。
- 执行默认 schema snapshot 与 `workorders.stats.numeric` 专项 snapshot。
- 上传 `api-snapshot-numeric-logs` artifact。

`deploy-production.yml` 手动生产部署：

- workflow 名称：`Deploy Production`。
- 触发方式：`workflow_dispatch`。
- 使用 `production` environment。
- 使用 `PROD_HOST`、`PROD_USER`、`PROD_SSH_KEY`、`PROD_DEPLOY_PATH`。
- 当前部署方式为 runner checkout 后 `rsync -az --delete` 到生产目录。
- 远端执行 `PRUNE_DOCKER_AFTER_DEPLOY=yes pnpm prod:deploy && pnpm prod:health`。

## 10. API snapshot / release gate 移交

核心文档：

- `docs/testing/api-snapshot-regression-plan.md`
- `docs/testing/api-snapshot-baseline-policy.md`
- `docs/testing/first-release-api-snapshot-release-gate-review.md`
- `docs/testing/api-snapshot-workorders-stats-numeric-baseline-workflow-summary.md`
- `docs/testing/api-snapshot-workorders-stats-numeric-manual-workflow-runbook.md`

当前状态：

- 默认 API snapshot 已稳定。
- `workorders.list` 已从易波动样本快照转为 stable 结构快照。
- `workorders.stats` 默认路径为 `workorders.stats.schema`。
- 默认 schema snapshot 不冻结动态 numeric count。
- `workorders.stats.numeric` 已拆分为专项检查。
- numeric baseline 使用独立文件：`scripts/e2e/snapshots/first-release-api-snapshots.numeric.json`。
- fixed dataset 使用：
  - `SNAPSHOT-BLD-001`
  - `SNAPSHOT-FLR-001`
  - `SNAPSHOT-UNIT-001`
  - `SNAPSHOT-WO-001`
- fixed dataset 链路为 building -> floor -> unit -> workorder。
- `API Snapshot Numeric` manual workflow 已纳入 GitHub Actions。
- readiness gap analysis 记录 `API Snapshot Numeric` Run `#1` succeeded；release candidate 前仍建议按需重新触发。

默认 schema snapshot：

```bash
node scripts/e2e/first-release-api-snapshots.mjs
```

numeric snapshot 专项检查：

```bash
SNAPSHOT_STATS_MODE=numeric \
ALLOW_STATS_NUMERIC_SNAPSHOT=true \
SNAPSHOT_WORKORDER_NO=SNAPSHOT-WO-001 \
SNAPSHOT_UNIT_NO=SNAPSHOT-UNIT-001 \
node scripts/e2e/first-release-api-snapshots.mjs
```

baseline 维护规则：

- baseline 不是测试失败后的兜底文件。
- baseline 更新必须单独 PR。
- baseline 更新必须说明原因、预期响应变化和验证证据。
- 禁止因为本地脏数据、认证失败、环境错误、动态字段未归一化或不明原因失败而更新 baseline。
- 目标环境和 release checklist 中不得执行 `UPDATE_SNAPSHOTS=true`。

## 11. First release readiness / target environment verification 移交

核心文档：

- `docs/release/first-release-readiness-checklist.md`
- `docs/release/first-release-readiness-gap-analysis.md`
- `docs/release/first-release-target-environment-verification-plan.md`
- `docs/release/first-release-target-environment-verification-dry-run.md`
- `docs/release/first-release-target-environment-verification-execution-record.md`

当前状态：

- readiness checklist 已建立。
- readiness gap analysis 已建立。
- target environment verification plan 已建立。
- dry-run 记录模板已建立。
- execution record 模板已建立。
- actual run 当前状态：`docs/release/first-release-target-environment-verification-execution-record.md` 中 P0 项仍为 `NOT_RUN`，`Final decision` 待填写。
- 当前主要缺口仍集中在真实目标环境验证、生产初始化执行、auth smoke、文件存储、备份回滚与发布后 smoke。

验证顺序建议：

1. 环境变量与密钥验证。
2. 数据库连接验证。
3. migration 验证。
4. production seed 验证。
5. 初始化闭环验证。
6. bootstrap admin 验证。
7. auth smoke 验证。
8. mock 禁用验证。
9. 文件存储验证。
10. 备份 / 回滚验证。
11. 常规 CI / release gate 结果确认。
12. 默认 API snapshot 结果确认。
13. `API Snapshot Numeric` 结果确认。
14. 发布后 smoke 验证。

强制边界：

- 不通过 P0 项不得进入正式发布。
- 不记录真实生产密钥、真实数据库密码、真实管理员密码、真实 token 或完整敏感连接串。
- 不在目标环境验证流程中自动更新 snapshot baseline。
- migration 失败、auth smoke 失败、文件存储失败或发布后 smoke 失败，应停止或进入回滚判断。

## 12. 系统账号与后台权限移交

必须移交：

- 生产超级管理员账号。
- 生产租户 ID / 园区 ID。
- 初始角色清单。
- 模块授权管理权限。
- 权限点管理权限。
- 数据权限管理权限。
- 字段权限管理权限。
- 字典管理权限。
- 编码规则管理权限。
- 操作日志查看权限。

生产账号密码不得写入本文档，应通过密码管理器移交。

建议接收团队立即执行：

1. 登录生产后台。
2. 新建团队管理员账号。
3. 分配超级管理员或系统管理员角色。
4. 确认 enabled_modules 包含需要模块。
5. 修改原始交接密码。
6. 关闭不需要的临时账号。

## 13. 业务 RBAC 权限范围移交

后台需要确保以下权限域由接手团队掌握：

- `system/*`：租户、组织、用户、角色、权限、数据权限、字段权限、模块授权、字典、编码规则、审计日志。
- `asset/*`：园区、楼栋、楼层、房源、房源状态、资产统计。
- `leasing/*`：招商、租户、合同、应收、收款、账龄、豁免、发票、合同变更、续租、退租、退款。
- `workorder/*`：工单、派单、处理、SLA、统计、日志。
- `safety/*`：巡检、隐患、应急、作业许可、安全统计。
- `iot/*`：网关、设备、点位、指标、数据、告警、规则、场景、实时推送。
- `video/*`：摄像头、平台配置、视频取证、视频告警、大屏。
- `energy/*`：表计、读数、告警、看板、账期、账单项、分摊规则、调整红冲。
- `robot/*`：机器人总览、清洁机器人、萤石适配预留。

接手团队至少应拥有：

- 系统超级管理员角色。
- 园区运营负责人角色。
- 设备主管角色。
- 安全主管角色。
- 财务主管角色。
- 物业主管角色。

## 14. 外部平台权限移交

按当前/后续功能，需要准备或移交：

- 云服务器控制台。
- DNS/域名控制台。
- GitHub 仓库与 Actions。
- Docker registry，如后续启用。
- 对象存储/MinIO。
- Redis。
- MQTT/EMQX。
- RabbitMQ。
- TimescaleDB，如后续高频 IoT 使用。
- 视频平台：海康、大华、萤石、中维世纪等。
- 机器人平台：萤石清洁机器人。
- AI 服务商密钥，如后续启用。
- 短信、邮件、企业微信、公众号/小程序等通知渠道，如后续启用。

## 15. 本地开发启动

依赖：

- Node.js 22
- pnpm 9.12.0
- Docker / Docker Compose

常用命令：

```bash
pnpm install
pnpm db:up
pnpm db:migrate
pnpm db:seed:dev
pnpm dev:api
pnpm dev:web
```

验证命令：

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test:e2e
```

## 16. 关键目录说明

- `apps/api/src/modules`：后端业务模块。
- `apps/web/app`：Next.js App Router 页面。
- `apps/web/components`：前端组件。
- `database/migrations`：数据库 migration。
- `database/seeds`：生产/开发 seed。
- `scripts/e2e`：smoke/e2e、first release regression、API snapshot 脚本。
- `scripts/e2e/snapshots`：API snapshot baseline 文件。
- `infra/docker`：Docker 与 Compose。
- `docs/deployment`：部署文档。
- `docs/release`：发布、readiness、target environment verification 文档。
- `docs/testing`：测试、API snapshot、release gate 文档。
- `docs/handover`：交接文档与 drift report。

## 17. 生产验收入口

生产 URL：

- Web：https://<production-domain>
- Login：https://<production-domain>/login
- API health：https://<production-domain>/api/v1/health

交接验收建议：

1. 登录后台。
2. 打开系统管理、资产管理、招商租赁、工单、安全、IoT、视频、能源、机器人菜单。
3. 随机抽检 10 个页面。
4. 新建一条非关键测试数据。
5. 查看操作日志是否写入。
6. 验证无权限账号无法访问管理页面。
7. 验证模块禁用后菜单和 API 均不可访问。
8. 执行或复核 first release target environment verification P0 项。
9. 复核 `API Snapshot Numeric` manual workflow 结果和日志 artifact。

## 18. 测试脚本清单

当前 `scripts/e2e` 顶层脚本数量：35。

First release / API snapshot 脚本：

- `bootstrap-api-snapshot-data.mjs`
- `first-release-api-snapshots.mjs`
- `first-release-auth-health.mjs`
- `first-release-files.mjs`
- `first-release-idempotency.mjs`
- `first-release-leasing.mjs`
- `first-release-menu-whitelist.mjs`
- `first-release-regression.mjs`
- `first-release-users-assets.mjs`
- `first-release-workorders.mjs`

阶段 smoke 脚本：

- `s1-rbac-std-fix-smoke.mjs`
- `s1-smoke.mjs`
- `s2b-smoke.mjs`
- `s3a-park-tenant-smoke.mjs`
- `s3b-leasing-crm-smoke.mjs`
- `s3c-contract-smoke.mjs`
- `s3d-invoice-smoke.mjs`
- `s3d-payment-smoke.mjs`
- `s3d-waiver-smoke.mjs`
- `s3e-contract-lifecycle-smoke.mjs`
- `s5a-safety-smoke.mjs`
- `s5b-emergency-permit-smoke.mjs`
- `s6a-mqtt-parser-smoke.mjs`
- `s8c-video-camera-smoke.mjs`
- `s8d-video-preview-platform-smoke.mjs`
- `s8e-video-evidence-inspection-smoke.mjs`
- `s8f-video-alert-dashboard-smoke.mjs`
- `s9a-iot-device-hub-smoke.mjs`
- `s9b-iot-runtime-alert-smoke.mjs`
- `s9c-iot-rule-engine-smoke.mjs`
- `s9d-iot-scene-center-smoke.mjs`
- `s9d1-unified-action-executor-smoke.mjs`
- `s9e-energy-meter-monitor-smoke.mjs`
- `s9f-energy-billing-tenant-smoke.mjs`
- `s9f1-energy-billing-adjustment-reversal-smoke.mjs`

Package script 注意：

- `pnpm test:e2e` 当前只串联部分 S1/S2/S3/S5 smoke。
- S6/S8/S9、first-release regression 和 API snapshot 需要按直接 node 命令或对应 GitHub Actions workflow 执行。
- package scripts 中当前没有 API snapshot 专用 npm script。

## 19. 前端页面范围

当前 `apps/web/app/**/page.tsx` 数量：110。

当前页面范围覆盖：

- dashboard / 403 / login / root
- system 管理
- assets 资产
- leasing / finance
- contracts
- workorders
- safety
- IoT
- video-security
- energy
- robots
- admin 下的 organizations、roles、users、iot、video-security、energy

需要持续注意：

- 前端页面数量增长快，新增页面需要同步菜单、RBAC、模块授权和 smoke。
- S8/S9、energy、robots、admin 页面建议浏览器实际打开验证。
- 页面存在普通业务入口与 admin 入口并行的情况，移交时需要确认接手团队理解菜单挂载和权限差异。

## 20. 已知技术债与风险

- `<production-deploy-path>` 是否仍非 git worktree 需要远端人工确认。
- 当前 `deploy-production.yml` 已改为 rsync 同步，不再远端 `git pull`；旧的 git worktree 不匹配风险已不应按原描述保留。
- 当前部署仍是源码 rsync + 远端构建/部署，不是完整 artifact/registry 部署；后续可继续评估 artifact 或镜像仓库发布。
- 服务器 SSH 对大包和频繁握手敏感，部署同步仍应控制输出和传输量。
- rsync 目标目录、排除项、`.env.production`、上传目录、存储目录和数据目录需要发布前人工复核。
- 目标环境 P0 verification 仍未实际填写完成。
- S8/S9 页面很多，后续每次新增功能必须用浏览器实际打开验证。
- 部分高级能力为适配层或模拟执行：真实设备控制、真实厂家视频平台、真实机器人控制、MQTT/Redis/TimescaleDB 高可用需要后续生产化。
- 前端菜单与页面挂载需要持续 smoke，避免“写了页面但菜单不可见”。
- 数据权限/字段权限已有接入点，后续新增模块必须严格复用。
- 能源账单已具备调整/红冲，但真实财务结算、开票、缴费、对账仍需后续联调财务流程。
- API snapshot baseline 更新必须独立 PR，避免把真实回归误更新为 baseline。

## 21. 接手后第一天建议事项

1. 团队成员加入 GitHub 仓库。
2. 配置团队自己的 SSH key，不再共用个人 key。
3. 使用密码管理器完成生产密钥交接。
4. 登录生产后台并创建团队管理员。
5. 执行一次 `pnpm lint && pnpm typecheck && pnpm build`。
6. 抽检生产页面。
7. 备份生产数据库。
8. 人工确认 `<production-deploy-path>` 目录形态、rsync 排除项和生产 `.env.production` 保留情况。
9. 执行或补齐 target environment verification execution record。
10. 复核 `API Snapshot Numeric` manual workflow 和 release-smoke 结果。
11. 建立每日备份和监控告警。
12. 冻结当前版本为接手基线。

## 22. 后续阶段建议

建议下一阶段先做运维与质量补强，再继续业务扩展：

1. 生产数据库自动备份与恢复演练。
2. 页面挂载与菜单可见性自动化巡检。
3. RBAC/模块授权自动 smoke。
4. 生产日志、容器指标、磁盘空间监控。
5. 评估 artifact / registry 发布方案。
6. 完成真实目标环境 P0 verification 并归档 execution record。
7. 按需在 release candidate 前重新触发 `API Snapshot Numeric` manual workflow。
8. 再进入 S9-G 或 S10 业务模块。
