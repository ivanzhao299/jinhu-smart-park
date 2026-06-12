# 金湖智慧园区数字运营 SaaS 平台移交清单

生成日期：2026-05-31  
当前阶段：S9-F.1 Energy Billing Adjustment & Reversal 已完成  
当前生产域名：https://park.cnjinhu.top  
代码仓库：git@github.com:ivanzhao299/jinhu-smart-park.git

> 安全原则：本文档不保存任何明文密码、私钥、数据库密码、JWT 密钥、第三方 token。所有密钥应通过 1Password、Bitwarden、企业微信密封消息或线下密封交接。

## 1. 当前基线

- 最新本地/远端分支：`main`
- 最近提交：
  - `fdf612c chore: fully prune production docker build cache`
  - `ad3268e chore: prune old docker artifacts after production deploy`
  - `3ea8453 ci: build shared types before workspace checks`
  - `8b17998 perf: improve app shell loading and add ci workflows`
- 已建立重要 tag：
  - `v1-smartpark-s9e-baseline-freeze`
  - `v1-smartpark-s9f-energy-billing`
  - `v1-smartpark-s9f1-energy-adjustment`
- 当前 migration 数量：137
- 当前 smoke/e2e 脚本数量：25
- 当前前端 `page.tsx` 页面数量：86

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
- 机器人模块：萤石清洁机器人接入骨架与可见性 seed

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

注意：当前生产目录 `/opt/jinhu-smart-park` 不是 git worktree。现有 `deploy-production.yml` 使用 `git pull --ff-only`，团队需要二选一：

1. 将生产目录改造为 git checkout。
2. 或把 workflow 改为 rsync/scp artifact 部署。

## 4. 服务器与生产权限移交

生产服务器：

- IP：`47.236.122.224`
- SSH 用户：`root`
- 生产路径：`/opt/jinhu-smart-park`
- 生产域名：`park.cnjinhu.top`
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
  root@47.236.122.224
```

小文件同步示例：

```bash
rsync -avR --bwlimit=64 \
  -e "ssh -i ~/.ssh/id_ed25519 -o IPQoS=none -o Compression=no -o Ciphers=aes128-ctr" \
  scripts/prod-deploy.sh root@47.236.122.224:/opt/jinhu-smart-park/
```

## 5. 域名、DNS 与 HTTPS 权限移交

必须移交：

- `cnjinhu.top` 域名解析平台管理权限。
- `park.cnjinhu.top` DNS 记录管理权限。
- HTTPS 证书申请/续期权限。
- Nginx 站点配置权限。
- 如使用 Certbot：Certbot 配置和续期任务权限。

当前外部健康检查：

```bash
curl -I https://park.cnjinhu.top/login
curl -s https://park.cnjinhu.top/api/v1/health
```

## 6. 生产环境变量与密钥移交

生产环境文件：

- `/opt/jinhu-smart-park/.env.production`
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
- 每次生产 migration 前必须备份。
- S8/S9 migration 编号已连续到 `000137_s9f1_energy_billing_adjustment_reversal.sql`。
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

1. 构建 API/Web 镜像。
2. 启动 PostgreSQL。
3. 执行 migration。
4. 可选执行 production seed。
5. 启动 API/Web。
6. 执行健康检查。
7. 清理旧 Docker container、未使用镜像、build cache。

磁盘策略：

- 当前部署后会自动运行 `scripts/prod-docker-cleanup.sh`。
- 只保留当前运行容器使用的镜像。
- 清空 Docker build cache。
- 不清理 volumes，避免删除 PostgreSQL 数据。

## 9. CI/CD 移交

CI 文件：

- `.github/workflows/ci.yml`

CI 执行：

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm --filter @jinhu/shared build`
- `pnpm typecheck`
- `pnpm build`

手动生产部署 workflow：

- `.github/workflows/deploy-production.yml`

当前风险：

- `deploy-production.yml` 默认远端执行 `git pull`。
- 生产目录当前不是 git worktree，需要团队在接手后修正部署方式。

建议修正：

- 使用 GitHub Actions build artifact。
- 通过 rsync 小包同步到生产。
- 或在生产服务器建立裸仓库/工作树。
- 保留 SSH 小包参数，避免握手被服务器阻断。

## 10. 系统账号与后台权限移交

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

## 11. 业务 RBAC 权限范围移交

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

## 12. 外部平台权限移交

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

## 13. 本地开发启动

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

## 14. 关键目录说明

- `apps/api/src/modules`：后端业务模块。
- `apps/web/app`：Next.js App Router 页面。
- `apps/web/components`：前端组件。
- `database/migrations`：数据库 migration。
- `database/seeds`：生产/开发 seed。
- `scripts/e2e`：smoke/e2e 脚本。
- `infra/docker`：Docker 与 Compose。
- `docs/deployment`：部署文档。
- `docs/handover`：交接文档。

## 15. 生产验收入口

生产 URL：

- Web：https://park.cnjinhu.top
- Login：https://park.cnjinhu.top/login
- API health：https://park.cnjinhu.top/api/v1/health

交接验收建议：

1. 登录后台。
2. 打开系统管理、资产管理、招商租赁、工单、安全、IoT、视频、能源、机器人菜单。
3. 随机抽检 10 个页面。
4. 新建一条非关键测试数据。
5. 查看操作日志是否写入。
6. 验证无权限账号无法访问管理页面。
7. 验证模块禁用后菜单和 API 均不可访问。

## 16. 测试脚本清单

主要 smoke 脚本：

- `s1-smoke.mjs`
- `s1-rbac-std-fix-smoke.mjs`
- `s2b-smoke.mjs`
- `s3a-park-tenant-smoke.mjs`
- `s3b-leasing-crm-smoke.mjs`
- `s3c-contract-smoke.mjs`
- `s3d-payment-smoke.mjs`
- `s3d-waiver-smoke.mjs`
- `s3d-invoice-smoke.mjs`
- `s3e-contract-lifecycle-smoke.mjs`
- `s5a-safety-smoke.mjs`
- `s5b-emergency-permit-smoke.mjs`
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

## 17. 已知技术债

- `deploy-production.yml` 与当前生产目录形态不完全匹配，需要改造为 artifact/rsync 或生产 git worktree。
- 服务器 SSH 对大包和频繁握手敏感，部署脚本应继续小包化。
- S8/S9 页面很多，后续每次新增功能必须用浏览器实际打开验证。
- 部分高级能力为适配层或模拟执行：真实设备控制、真实厂家视频平台、真实机器人控制、MQTT/Redis/TimescaleDB 高可用需要后续生产化。
- 前端菜单与页面挂载需要持续 smoke，避免“写了页面但菜单不可见”。
- 数据权限/字段权限已有接入点，后续新增模块必须严格复用。
- 能源账单已具备调整/红冲，但真实财务结算、开票、缴费、对账仍需后续联调财务流程。

## 18. 接手后第一天建议事项

1. 团队成员加入 GitHub 仓库。
2. 配置团队自己的 SSH key，不再共用个人 key。
3. 使用密码管理器完成生产密钥交接。
4. 登录生产后台并创建团队管理员。
5. 执行一次 `pnpm lint && pnpm typecheck && pnpm build`。
6. 抽检生产页面。
7. 备份生产数据库。
8. 修正 GitHub Actions 生产部署方式。
9. 建立每日备份和监控告警。
10. 冻结当前版本为接手基线。

## 19. 后续阶段建议

建议下一阶段先做运维与质量补强，再继续业务扩展：

1. CI/CD artifact 部署改造。
2. 生产数据库自动备份与恢复演练。
3. 页面挂载与菜单可见性自动化巡检。
4. RBAC/模块授权自动 smoke。
5. 生产日志、容器指标、磁盘空间监控。
6. 再进入 S9-G 或 S10 业务模块。
