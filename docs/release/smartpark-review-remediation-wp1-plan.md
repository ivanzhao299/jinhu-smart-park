# WP1：修复 Docker / release-smoke 计划

生成日期：2026-06-16

建议分支：`docs/wp1-release-smoke-plan`

## 1. 目的

WP1 对应 `docs/release/smartpark-review-remediation-plan.md` 中的 R2 / P0：API Docker / release-smoke 阻塞。

本计划用于指导后续独立实现 PR，目标是稳定 API Docker build，并打通 release-smoke 的 API health/login 验证链路。计划阶段只定义边界、步骤、验证方式和回滚策略，不修改 Dockerfile、CI、compose、业务代码、脚本逻辑、package 文件或 lockfile。

## 2. 背景

审查计划记录的 R2 问题是：API Docker 镜像构建阶段执行 `apt-get install python3 make g++` 时，下载 `gcc-12` / `g++-12` 失败，导致 API 镜像无法稳定构建，进而阻塞 release-smoke。

当前 `infra/docker/Dockerfile.api` 的 `deps` stage 使用 `node:22-bookworm-slim`，先无条件将 Debian 源替换为 `mirrors.aliyun.com`，然后单次执行：

```dockerfile
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
```

该实现缺少 retry、timeout、`--fix-missing` 和短循环重试。一次网络抖动、镜像源同步问题或包下载中断都会使构建失败。

`infra/docker/Dockerfile.web` 存在相同 apt 安装逻辑。WP1 的主目标是 API Docker build；如果 Web Dockerfile 仍保留同类逻辑，后续实现阶段可同步应用同一稳定性修复，避免 release 构建链路在 Web 镜像处复现同一问题。

## 3. 输入依据

- `docs/release/smartpark-review-remediation-plan.md`
- `infra/docker/Dockerfile.api`
- `infra/docker/Dockerfile.web`
- `infra/docker/docker-compose.yml`
- `infra/docker/docker-compose.prod.yml`
- `.github/workflows/ci.yml`
- `scripts/verify-api-login-dockerexec.sh`
- `docs/deployment/production.md`
- `package.json`
- `apps/api/package.json`

关键现状：

- `release-smoke` 位于 `.github/workflows/ci.yml`，不是独立 npm script。
- `release-smoke` 触发条件为 `workflow_dispatch`，或 PR 带 `run-release-smoke` label。
- `release-smoke` 依赖 `verify` job。
- `release-smoke` 顺序为：启动 Postgres、执行 migration、production seed、bootstrap admin、baseline check、启动 API、等待 API health、执行 `scripts/verify-api-login-dockerexec.sh`。
- `docker-compose.prod.yml` 的 API 服务通过 `infra/docker/Dockerfile.api` 构建。
- 默认端口为 `POSTGRES_PUBLISHED_PORT=5432`、`API_PUBLISHED_PORT=3001`、`WEB_PUBLISHED_PORT=3000`。
- 本地验证应避免占用已有 5432 / 15432 端口。

## 4. WP1 四阶段计划

### 4.1 计划阶段

目标：

1. 只读确认 R2 失败边界。
2. 梳理 Docker build、compose、DB 初始化、API health/login 验证链路。
3. 明确允许修改范围、禁止修改范围和本地隔离端口策略。
4. 形成本计划文档。

计划阶段不执行 Docker build，不启动 compose，不运行 migration / seed / bootstrap / db check。

### 4.2 实现阶段

目标：

1. 稳定 `infra/docker/Dockerfile.api` 的 apt 依赖安装。
2. 不改变 API 构建语义，继续安装 `python3 make g++`。
3. 保持 `node:22-bookworm-slim` 基础镜像。
4. 不无条件强制替换为 `mirrors.aliyun.com`。
5. 增加可选 `APT_MIRROR` build arg。
6. 给 apt 增加 retry / timeout。
7. `apt-get install` 使用 `--fix-missing`。
8. 对 `apt-get update` / `apt-get install` 使用短循环重试。
9. 清理 `/var/lib/apt/lists/*`。
10. 如 `infra/docker/Dockerfile.web` 仍存在相同 apt 逻辑，可同步修复。

推荐 Dockerfile 行为：

```dockerfile
ARG APT_MIRROR=
```

- `APT_MIRROR` 为空时使用 Debian 官方默认源。
- `APT_MIRROR` 非空时才替换 Debian mirror，例如 `https://mirrors.aliyun.com`。
- 不在 Dockerfile 内无条件绑定某一个地区镜像源。

推荐 apt 配置：

```text
Acquire::Retries "5";
Acquire::http::Timeout "30";
Acquire::https::Timeout "30";
```

推荐 install 策略：

```text
apt-get update
apt-get install -y --no-install-recommends --fix-missing python3 make g++
```

外层使用 2 到 3 次短循环重试，避免单次网络失败直接中断构建。

### 4.3 验证阶段

验证分为无副作用验证和需用户确认的有副作用验证。

无副作用验证：

```bash
git status --short
git diff --name-only
git diff --check
docker compose -f infra/docker/docker-compose.prod.yml config
```

有副作用验证需要用户确认后执行，建议使用隔离 compose project 和本地端口覆盖：

```bash
COMPOSE_PROJECT_NAME=smartpark-wp1-smoke
POSTGRES_PUBLISHED_PORT=15433
API_PUBLISHED_PORT=13001
WEB_PUBLISHED_PORT=13000
```

建议验证顺序：

1. API Docker build 可完成。
2. production compose config 可解析。
3. 隔离 Postgres 可启动并健康。
4. migration 可执行。
5. production seed 可执行。
6. bootstrap admin 可执行。
7. baseline check 可通过。
8. API 容器可构建、启动并进入 healthy。
9. `scripts/verify-api-login-dockerexec.sh` 可通过。
10. CI 手动或 PR label 触发 release-smoke 可通过。

### 4.4 风险与回滚阶段

主要风险：

- apt mirror 替换规则写错，导致 Debian source URL 不可用。
- retry 循环掩盖真实包名或基础镜像问题。
- 本地 release-smoke 使用默认 5432 / 3001 时与现有服务冲突。
- 使用 `docker compose down -v` 误删非隔离环境 volume。
- 将 WP2 的 unit / coverage / CI gate 改造混入 WP1，扩大 PR 风险。

回滚策略：

- Dockerfile 修改可直接 revert 对应 commit。
- 如果只改 Dockerfile 且未改 DB/migration/seed，代码回滚不涉及数据回滚。
- 本地验证使用独立 `COMPOSE_PROJECT_NAME=smartpark-wp1-smoke`，清理时仅清理该项目。
- 不对原始 `jinhu-smart-park-postgres` 或其它共享 volume 执行 `down -v`。

## 5. 范围与边界

### 5.1 WP1 范围内

- `infra/docker/Dockerfile.api`
- `infra/docker/Dockerfile.web`，仅当存在相同 apt 安装逻辑时同步修复
- `docs/deployment/production.md`，仅当需要记录 `APT_MIRROR` 或本地 release-smoke 端口覆盖
- `.github/workflows/ci.yml`，仅当需要增加必要日志或修正 release-smoke 配置；默认不改

### 5.2 WP1 范围外

- WP2 的 unit / coverage / CI gate 改造
- 业务代码修复
- 数据库 migration / seed 改造
- API 功能逻辑调整
- Web 功能逻辑调整
- E2E 业务脚本改造
- package 脚本和 lockfile 调整

### 5.3 禁止混入

- 不修改 `apps/api/**`
- 不修改 `apps/web/**`
- 不修改 `packages/**`
- 不修改 `database/**`
- 不修改 `scripts/e2e/**`
- 不修改 `package.json`
- 不修改 `pnpm-lock.yaml`
- 不运行 `pnpm install`
- 不把 WP2 的测试入口、coverage、CI 默认门禁纳入 WP1 PR

## 6. 只读预检命令

```bash
git branch --show-current
git status --short
docker --version || true
docker compose version || true
ss -lntp | grep -E ':3001|:5432|:13001|:15432' || true
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
rg -n "release-smoke|Dockerfile.api|docker compose|apt-get|python3|make|g\\+\\+|gcc-12|g\\+\\+-12|POSTGRES_PUBLISHED_PORT|API_PUBLISHED_PORT|verify-api-login|db:migrate|db:seed:prod|db:bootstrap:admin|db:check:init" .github scripts package.json apps/api/package.json docs/deployment/production.md infra/docker
```

只读预检不得执行 Docker build、compose up/down、migration、seed、bootstrap、db check 或 release-smoke。

## 7. WP1 与 WP2 / release gate 的关系

WP1 只恢复 release-smoke 的 Docker/API 发布验证能力，属于 R2 / P0。

WP2 负责 CI / 测试 / coverage 基础设施，属于 R3 / P1。WP2 可能会调整 unit test、coverage、CI verify gate 和测试脚本语义，但这些内容不应混入 WP1。

release gate 的建议层级：

| Gate | 所属工作包 | 内容 | WP1 是否处理 |
|---|---|---|---|
| verify | WP2 | lint、typecheck、build、unit | 否 |
| coverage | WP2 | test coverage artifact / threshold | 否 |
| release-smoke | WP1 | Docker、DB 初始化、API health/login | 是 |
| first-release regression | WP0 / 后续发布验证 | 首发业务主链 E2E | 否 |

WP1 完成后，release-smoke 应能作为发布前 Docker/API 运行门禁；WP2 完成后，CI 才补齐 unit / coverage 层面的快速质量门禁。

## 8. 执行步骤

### 8.1 实现前

1. 确认分支为 `fix/release-smoke-api-docker`。
2. 确认 `git status --short` 干净。
3. 复读本计划和 `smartpark-review-remediation-plan.md` 中 WP1 / R2。
4. 只读检查 Dockerfile、compose、CI 和验证脚本。
5. 记录当前本地端口占用，特别是 5432、15432、3001、13001。

### 8.2 Dockerfile 修复

1. 在 `infra/docker/Dockerfile.api` 的 deps stage 增加 `ARG APT_MIRROR=`。
2. 删除无条件替换 `mirrors.aliyun.com` 的逻辑。
3. 改为 `APT_MIRROR` 非空时才替换 Debian mirror。
4. 写入 apt retry / timeout 配置。
5. 将 `apt-get update` 和 `apt-get install` 放入短循环重试。
6. `apt-get install` 增加 `--fix-missing`。
7. 保持安装依赖为 `python3 make g++`。
8. 保持 `node:22-bookworm-slim`。
9. 清理 `/var/lib/apt/lists/*`。
10. 如 `infra/docker/Dockerfile.web` 仍有相同 apt 逻辑，同步应用同一片段。

### 8.3 无副作用验证

```bash
git diff --check
docker compose -f infra/docker/docker-compose.prod.yml config
git diff --name-only
git status --short
```

### 8.4 有副作用验证，需用户确认

先用隔离端口，避免碰已有本地 Postgres：

```bash
export COMPOSE_PROJECT_NAME=smartpark-wp1-smoke
export POSTGRES_PUBLISHED_PORT=15433
export API_PUBLISHED_PORT=13001
export WEB_PUBLISHED_PORT=13000
```

再按验证计划执行 Docker build、compose 启动、DB 初始化和 API login smoke。

## 9. 验收命令

### 9.1 无副作用验收

```bash
git diff --check
POSTGRES_PASSWORD=wp1_config_check \
WEB_ORIGIN=http://127.0.0.1:3000 \
JWT_SECRET=wp1_config_check_secret \
docker compose -f infra/docker/docker-compose.prod.yml config
git diff --name-only
git status --short
```

### 9.2 API Docker build 验收，需确认

默认源：

```bash
docker build -f infra/docker/Dockerfile.api -t jinhu-smart-park-api:wp1 .
```

指定 mirror：

```bash
docker build \
  --build-arg APT_MIRROR=https://mirrors.aliyun.com \
  -f infra/docker/Dockerfile.api \
  -t jinhu-smart-park-api:wp1 .
```

如果同步修改 Web Dockerfile，也可追加：

```bash
docker build -f infra/docker/Dockerfile.web -t jinhu-smart-park-web:wp1 .
```

### 9.3 本地 release-smoke 类验收，需确认

以下命令会启动 Docker、写入隔离 DB、产生 volume 和日志：

```bash
COMPOSE_PROJECT_NAME=smartpark-wp1-smoke \
POSTGRES_PUBLISHED_PORT=15433 \
API_PUBLISHED_PORT=13001 \
WEB_PUBLISHED_PORT=13000 \
POSTGRES_DB=jinhu_wp1_smoke \
POSTGRES_USER=jinhu \
POSTGRES_PASSWORD=JinhuWp1SmokeDb#2026 \
WEB_ORIGIN=http://127.0.0.1:13000 \
JWT_SECRET=JinhuWp1SmokeJwtSecret#2026_LongAndRandom \
docker compose -f infra/docker/docker-compose.prod.yml up -d postgres
```

初始化顺序：

```bash
COMPOSE_FILE=infra/docker/docker-compose.prod.yml \
POSTGRES_DB=jinhu_wp1_smoke \
POSTGRES_USER=jinhu \
pnpm db:migrate

COMPOSE_FILE=infra/docker/docker-compose.prod.yml \
POSTGRES_DB=jinhu_wp1_smoke \
POSTGRES_USER=jinhu \
ALLOW_PRODUCTION_SEED=yes \
pnpm db:seed:prod

COMPOSE_FILE=infra/docker/docker-compose.prod.yml \
POSTGRES_DB=jinhu_wp1_smoke \
POSTGRES_USER=jinhu \
TENANT_ID=10000001 \
PARK_ID=20000001 \
ADMIN_USERNAME=wp1_smoke_admin \
ADMIN_PASSWORD='Wp1SmokeAdmin#2026' \
ADMIN_NAME='WP1 Smoke Admin' \
ADMIN_EMAIL=wp1.smoke.admin@example.com \
ADMIN_PHONE=13900002027 \
ROLE_CODE=SUPER_ADMIN \
pnpm db:bootstrap:admin

COMPOSE_FILE=infra/docker/docker-compose.prod.yml \
POSTGRES_DB=jinhu_wp1_smoke \
POSTGRES_USER=jinhu \
TENANT_ID=10000001 \
PARK_ID=20000001 \
FILE_STORAGE_LOCAL_ROOT=/var/lib/jinhu/files \
AUTH_SMS_FIXED_CODE= \
AUTH_SMS_CODE_VISIBLE=false \
AUTH_WECHAT_MOCK_ENABLED=false \
pnpm db:check:init
```

启动 API 并验证：

```bash
COMPOSE_PROJECT_NAME=smartpark-wp1-smoke \
POSTGRES_PUBLISHED_PORT=15433 \
API_PUBLISHED_PORT=13001 \
WEB_PUBLISHED_PORT=13000 \
POSTGRES_DB=jinhu_wp1_smoke \
POSTGRES_USER=jinhu \
POSTGRES_PASSWORD=JinhuWp1SmokeDb#2026 \
WEB_ORIGIN=http://127.0.0.1:13000 \
JWT_SECRET=JinhuWp1SmokeJwtSecret#2026_LongAndRandom \
docker compose -f infra/docker/docker-compose.prod.yml up -d api

POSTGRES_CTN=jinhu-smart-park-prod-postgres \
API_CTN=jinhu-smart-park-prod-api \
POSTGRES_DB=jinhu_wp1_smoke \
POSTGRES_USER=jinhu \
TENANT_ID=10000001 \
PARK_ID=20000001 \
ADMIN_USERNAME=wp1_smoke_admin \
ADMIN_PASSWORD='Wp1SmokeAdmin#2026' \
API_BASE=http://127.0.0.1:3001/api/v1 \
bash scripts/verify-api-login-dockerexec.sh
```

注意：`verify-api-login-dockerexec.sh` 在 API 容器内部访问 `API_BASE`。即使宿主机映射端口为 13001，容器内部默认仍可使用 `http://127.0.0.1:3001/api/v1`。

## 10. 需要用户确认后才执行的有副作用命令

- `docker build`
- `docker compose up`
- `docker compose down`
- `docker compose down -v`
- `pnpm db:migrate`
- `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod`
- `pnpm db:bootstrap:admin`
- `pnpm db:check:init`
- `bash scripts/verify-api-login-dockerexec.sh`
- GitHub Actions 手动触发 `release-smoke`
- 给 PR 添加 `run-release-smoke` label

执行有副作用命令前必须说明：

- 使用的 `COMPOSE_PROJECT_NAME`
- 使用的端口覆盖
- 使用的 DB 名称
- 是否会创建或删除 Docker volume
- 日志路径
- 清理命令

## 11. 风险与回滚

### 11.1 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| apt mirror 配置错误 | Docker build 仍失败 | 默认保留 Debian 官方源，仅在 `APT_MIRROR` 非空时替换 |
| 网络抖动 | 下载 `gcc-12` / `g++-12` 失败 | apt retry / timeout / `--fix-missing` / 短循环重试 |
| 本地端口冲突 | compose 启动失败 | 使用 15433 / 13001 / 13000 覆盖 |
| 误删 volume | 丢失本地数据 | 只对隔离 project 清理，不碰原始 Postgres |
| PR 范围膨胀 | 审查难度上升 | 不混入 WP2 unit / coverage / CI gate |
| CI 与本地行为不同 | 本地通过但 CI 失败 | 同时验证默认源和可选 mirror；保留 release-smoke artifact |

### 11.2 回滚

1. 回滚 Dockerfile commit。
2. 如果修改了文档，只回滚对应文档 commit。
3. 如果本地启动过隔离 compose，确认 project 名后再清理：

```bash
COMPOSE_PROJECT_NAME=smartpark-wp1-smoke \
docker compose -f infra/docker/docker-compose.prod.yml down
```

仅在确认隔离 volume 无需保留时，才考虑：

```bash
COMPOSE_PROJECT_NAME=smartpark-wp1-smoke \
docker compose -f infra/docker/docker-compose.prod.yml down -v
```

不得对原始 `jinhu-smart-park-postgres` 或非 WP1 隔离 project 执行 `down -v`。

## 12. PR 描述模板

```markdown
## Summary

- Stabilize API Docker apt dependency installation for WP1 / R2.
- Add optional `APT_MIRROR` build arg instead of forcing one Debian mirror.
- Add apt retry / timeout / `--fix-missing` and short retry loop.
- Keep `node:22-bookworm-slim` and existing `python3 make g++` dependency semantics.
- Sync Web Dockerfile only if it still has the same apt install pattern.

## Scope

- WP1 / R2 only.
- No business code changes.
- No package or lockfile changes.
- No database migration or seed changes.
- No WP2 unit / coverage / CI gate changes.

## Verification

No-side-effect:

- [ ] `git diff --check`
- [ ] `docker compose -f infra/docker/docker-compose.prod.yml config`
- [ ] `git status --short`

Docker / release-smoke, with explicit approval:

- [ ] API Docker build with default Debian source
- [ ] API Docker build with `APT_MIRROR=https://mirrors.aliyun.com`
- [ ] Isolated local release-smoke using `COMPOSE_PROJECT_NAME=smartpark-wp1-smoke`
- [ ] `scripts/verify-api-login-dockerexec.sh`
- [ ] GitHub Actions `release-smoke`

## Risk

- Docker build network instability may still occur, but apt retry and mirror configurability reduce one-shot failures.
- Local validation must use isolated ports: 15433 / 13001 / 13000.

## Rollback

- Revert the Dockerfile commit.
- Stop only the isolated WP1 compose project if it was started.
```

## 13. 完成定义 DoD

WP1 完成需同时满足：

1. `infra/docker/Dockerfile.api` 不再无条件强制替换 Debian 源。
2. API Docker build 支持可选 `APT_MIRROR`。
3. apt 安装包含 retry / timeout / `--fix-missing` / 短循环重试。
4. API Docker build 成功。
5. 如同步修改 `Dockerfile.web`，Web Docker build 或至少 compose config 验证通过。
6. `docker compose -f infra/docker/docker-compose.prod.yml config` 通过。
7. 使用隔离端口的本地 API health/login smoke 通过，或明确记录未执行原因。
8. GitHub `release-smoke` 通过，或明确记录仍阻塞的位置和日志 artifact。
9. 未修改业务代码、package、lockfile、migration、seed。
10. PR 描述记录 R2 / P0、验证命令和有副作用命令影响。

## 14. 本计划阶段交付

本计划阶段仅交付：

- `docs/release/smartpark-review-remediation-wp1-plan.md`

本计划阶段不交付：

- Dockerfile 修改
- CI 修改
- compose 修改
- 业务代码修改
- package / lockfile 修改
- DB migration / seed 修改
- Docker build 结果
- release-smoke 运行结果

建议后续实现分支：

```text
fix/release-smoke-api-docker
```

建议后续实现 commit message：

```text
fix: stabilize api docker release smoke build
```
