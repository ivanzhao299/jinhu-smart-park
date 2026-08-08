# JinHu Smart Park 生产上线 SOP

## 1. 适用范围

本 SOP 适用于当前 UAT 以及未来正式生产环境的上线准备、执行、验证与收口。完整目标产品范围不因阶段性发布而删减，各模块可在通过对应 UAT 和运维保障确认后分批开放。

每次发布的实际开放范围以已批准的版本清单、模块授权和目标角色运行时权限为准，至少核对：

- 目标角色 `/users/me` 返回的角色、权限、模块和菜单上下文
- Web 实际渲染菜单及对应页面
- 缺权或模块禁用角色的拒绝路由
- 本批次已批准开放模块的 UAT 证据；安全模块口径见 [安全模块上线整改计划](safety-module-release-readiness-plan.md)

本 SOP 不自动批准以下内容：

- 对象存储
- 未列入本批次版本清单或未通过对应 UAT 的模块
- 全量状态流转
- 全量幂等覆盖

## 2. 上线前提

上线前必须满足以下条件：

- Final Go 验证已完成
- `release-smoke` CI 通过
- 生产环境变量已确认
- 数据库备份方案已确认
- 文件备份方案已确认
- 回滚镜像 tag 已准备
- 上线窗口已确认
- 值守人员已确认

如任一前提未满足，不进入发布步骤。

## 3. 角色分工

| 角色 | 姓名 / 负责人 | 职责 | 联系方式 |
|---|---|---|---|
| 发布负责人 | `<待填写>` | 统筹上线步骤、Go / No-Go 决策、协调各方 | `<待填写>` |
| 运维执行人 | `<待填写>` | 执行镜像拉取、compose 启停、备份恢复、健康检查 | `<待填写>` |
| 数据库负责人 | `<待填写>` | 数据库备份、迁移执行、备份恢复确认 | `<待填写>` |
| 业务验收负责人 | `<待填写>` | 验收首发功能、确认关键业务链路可用 | `<待填写>` |
| 回滚决策人 | `<待填写>` | 在异常时决定是否回滚及回滚范围 | `<待填写>` |

## 4. 生产环境变量确认

| 变量名 | 用途 | 是否必填 | 生产值是否已确认 | 备注 |
|---|---|---|---|---|
| `NODE_ENV` | 运行环境标识 | 是 | 已确认 | 建议固定为 `production` |
| `APP_ENV` | 应用环境标识 | 是 | 已确认 | 建议固定为 `production` 或运维约定值 |
| `POSTGRES_HOST` | 数据库主机 | 是 | 已确认 | 由运维填写 |
| `POSTGRES_PORT` | 数据库端口 | 是 | 已确认 | 由运维填写 |
| `POSTGRES_DB` | 数据库名 | 是 | 已确认 | 由运维填写 |
| `POSTGRES_USER` | 数据库用户 | 是 | 已确认 | 由运维填写 |
| `POSTGRES_PASSWORD` | 数据库密码 | 是 | 已确认 | 由运维填写，不在文档中明文展示 |
| `JWT_SECRET` | JWT 签名密钥 | 是 | 已确认 | 由运维填写，不在文档中明文展示 |
| `WEB_ORIGIN` | Web 访问源 | 是 | 已确认 | 生产域名 / 预发域名 |
| `FILE_STORAGE_LOCAL_ROOT` | 文件落盘目录 | 是 | 已确认 | 建议使用 `/var/lib/jinhu/files` |
| `AUTH_SMS_FIXED_CODE` | 短信 mock 固定码 | 是 | 已确认 | 首发必须为空 |
| `AUTH_SMS_CODE_VISIBLE` | 是否展示短信 mock 码 | 是 | 已确认 | 首发必须为 `false` |
| `AUTH_WECHAT_MOCK_ENABLED` | 微信 mock 开关 | 是 | 已确认 | 首发必须为 `false` |
| `PROPERTY_WORKBENCH_V2` | 房产业务新版工作台开关 | 是 | 已确认 | Track B 审批执行能力发布前必须为 `false`；启用后高风险动作 fail-closed，超级管理员不绕过 |

## 5. 发布前备份

发布前必须完成以下备份：

- PostgreSQL 备份
- 文件目录 / volume 备份
- 备份文件存放位置确认
- 备份校验确认
- 备份负责人确认

要求：

- 数据库和文件备份尽量处于同一时间窗口
- 不要执行 `docker compose down -v`
- 备份结果需要有明确记录和确认人

### 5.1 PostgreSQL 备份模板

```bash
pg_dump -h <POSTGRES_HOST> -p <POSTGRES_PORT> -U <POSTGRES_USER> -d <POSTGRES_DB> -Fc -f <backup_dir>/jinhu_pg_$(date +%F_%H%M).dump
```

### 5.2 文件目录 / volume 备份模板

```bash
rsync -a --delete <FILE_STORAGE_LOCAL_ROOT>/ <backup_dir>/jinhu_files/
```

### 5.3 备份校验

- 检查备份文件存在
- 检查备份文件大小合理
- 抽样确认可恢复

## 6. 镜像准备

| 项目 | 值 |
|---|---|
| API 镜像 tag | `<待填写>` |
| Web 镜像 tag | `<待填写>` |
| 上一个可回滚 tag | `<待填写>` |
| 镜像拉取或构建命令 | `docker pull <image:tag>` / `docker compose build` |
| 镜像校验方式 | `docker image inspect` / `docker compose config` / 健康检查 |

## 7. 发布执行步骤

以下命令模板中的占位符由运维按环境填写，禁止在文档中明文放入真实密钥。

通过 GitHub Actions `Deploy Production` 执行远端部署时，`rsync` 和远端 `ssh` 命令必须使用统一 SSH keepalive 参数，避免 Docker build 拉取基础镜像或执行 `apt-get install` 时间较长时触发 `client_loop: send disconnect: Broken pipe`。当前 workflow 使用 `ServerAliveInterval=30`、`ServerAliveCountMax=20`、`TCPKeepAlive=yes`、`ConnectTimeout=30`。

### 7.1 拉取最新镜像

```bash
docker pull <API_IMAGE_TAG>
docker pull <WEB_IMAGE_TAG>
```

### 7.2 检查 docker compose 配置

```bash
docker compose -f infra/docker/docker-compose.prod.yml config
```

### 7.3 启动 PostgreSQL

```bash
docker compose -f infra/docker/docker-compose.prod.yml up -d postgres
```

### 7.4 执行 migration

```bash
COMPOSE_FILE=infra/docker/docker-compose.prod.yml \
POSTGRES_DB=<POSTGRES_DB> \
POSTGRES_USER=<POSTGRES_USER> \
POSTGRES_PASSWORD=<POSTGRES_PASSWORD> \
pnpm db:migrate
```

### 7.5 执行 production seed

```bash
COMPOSE_FILE=infra/docker/docker-compose.prod.yml \
POSTGRES_DB=<POSTGRES_DB> \
POSTGRES_USER=<POSTGRES_USER> \
POSTGRES_PASSWORD=<POSTGRES_PASSWORD> \
ALLOW_PRODUCTION_SEED=yes \
pnpm db:seed:prod
```

### 7.6 执行 check-init-baseline

```bash
TENANT_ID=10000001 \
PARK_ID=20000001 \
FILE_STORAGE_LOCAL_ROOT=<FILE_STORAGE_LOCAL_ROOT> \
AUTH_SMS_CODE_VISIBLE=false \
AUTH_WECHAT_MOCK_ENABLED=false \
pnpm db:check:init
```

### 7.7 执行 bootstrap-admin（如首管未创建）

```bash
TENANT_ID=10000001 \
PARK_ID=20000001 \
ADMIN_USERNAME=<ADMIN_USERNAME> \
ADMIN_PASSWORD=<ADMIN_PASSWORD> \
ADMIN_NAME=<ADMIN_NAME> \
ADMIN_EMAIL=<ADMIN_EMAIL> \
ADMIN_PHONE=<ADMIN_PHONE> \
ROLE_CODE=SUPER_ADMIN \
pnpm db:bootstrap:admin
```

### 7.8 再次执行 check-init-baseline

```bash
TENANT_ID=10000001 \
PARK_ID=20000001 \
FILE_STORAGE_LOCAL_ROOT=<FILE_STORAGE_LOCAL_ROOT> \
AUTH_SMS_CODE_VISIBLE=false \
AUTH_WECHAT_MOCK_ENABLED=false \
pnpm db:check:init
```

### 7.9 启动 API / Web

```bash
docker compose -f infra/docker/docker-compose.prod.yml up -d api web
```

### 7.10 执行 `/health`

```bash
curl -i http://127.0.0.1:<API_PORT>/api/v1/health
```

### 7.11 执行 `/ready`

```bash
curl -i http://127.0.0.1:<API_PORT>/api/v1/ready
```

### 7.12 执行 verify-api-login

```bash
POSTGRES_CTN=<POSTGRES_CONTAINER> \
API_CTN=<API_CONTAINER> \
POSTGRES_DB=<POSTGRES_DB> \
ADMIN_PASSWORD=<ADMIN_PASSWORD> \
bash scripts/verify-api-login-dockerexec.sh
```

### 7.13 执行文件上传 / 下载抽样

```bash
curl -F "file=@<sample_file>" -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:<API_PORT>/api/v1/files
curl -L -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:<API_PORT>/api/v1/files/<FILE_ID>/download -o <download_path>
```

### 7.14 执行幂等接口抽样

```bash
curl -X POST -H "X-Idempotency-Key: <KEY>" -H "Authorization: Bearer <TOKEN>" ...
```

### 7.15 执行运行时角色菜单与拒绝路由抽样

```bash
# 使用批准的目标角色登录 Web，保存 /users/me 的脱敏角色、权限、模块和菜单摘要
# 核对实际渲染菜单，并直接访问至少一个缺权或模块禁用路由确认被拒绝
# 全量本地/UAT 浏览器检查可执行 pnpm go-live:uat-browser
```

## 8. 发布后验证

发布后必须验证：

- `/api/v1/health`
- `/api/v1/ready`
- `/login`
- `/auth/login`
- `/auth/me`
- 错误密码失败
- 短信 / 微信 mock 禁用
- 文件上传下载
- 幂等重复请求抽样
- 目标角色 `/users/me` 与实际渲染菜单、模块授权和权限一致
- 缺权或模块禁用路由不可用
- 核心业务流程抽样

## 9. Go / No-Go 判断

### Go 条件

- 初始化闭环通过
- `/ready` 通过
- 登录通过
- `release-smoke` 通过
- 安全巡检与隐患整改核心菜单及 `/safety/my-inspect-tasks` 开放前，`node scripts/e2e/s5a-safety-smoke.mjs` 通过
- 本批次目标角色的运行时菜单和拒绝路由证据通过
- 文件存储持久化验证通过
- 幂等关键接口验证通过
- 无 P0 阻断问题

### No-Go 条件

- migration 失败
- `check-init-baseline` 失败
- `/ready` 失败
- 登录失败
- 认证 mock 被误启用
- 文件上传下载失败
- 幂等重复写入
- 数据库备份缺失
- 文件备份缺失

## 10. 上线后观察

上线后观察重点：

- API 日志
- Web 日志
- 数据库连接
- 登录错误
- 5xx 错误
- 文件上传下载错误
- 幂等 409 是否异常增多
- 磁盘空间
- PostgreSQL volume
- `api-files-data` volume

## 11. 上线完成确认

| 检查项 | 结果 | 确认人 | 时间 | 备注 |
|---|---|---|---|---|
| 生产镜像已发布 | `<待填写>` | `<待填写>` | `<待填写>` |  |
| 数据库 migration 已执行 | `<待填写>` | `<待填写>` | `<待填写>` |  |
| production seed 已执行 | `<待填写>` | `<待填写>` | `<待填写>` |  |
| bootstrap-admin 已确认 | `<待填写>` | `<待填写>` | `<待填写>` |  |
| `/health` 通过 | `<待填写>` | `<待填写>` | `<待填写>` |  |
| `/ready` 通过 | `<待填写>` | `<待填写>` | `<待填写>` |  |
| verify-api-login 通过 | `<待填写>` | `<待填写>` | `<待填写>` |  |
| 文件存储验证通过 | `<待填写>` | `<待填写>` | `<待填写>` |  |
| 幂等抽样通过 | `<待填写>` | `<待填写>` | `<待填写>` |  |
| 运行时角色菜单与拒绝路由确认通过 | `<待填写>` | `<待填写>` | `<待填写>` |  |
