# JinHu Smart Park first release target environment verification plan

## 1. 目的

本文用于把 first release readiness P0 缺口转成目标环境验证步骤、通过标准、失败停止条件和结果记录模板。

本文不是部署脚本，不替代 `docs/deployment/production.md`，不写真实密钥、真实数据库密码或真实管理员密码。

Dry-run record template: [first-release-target-environment-verification-dry-run.md](./first-release-target-environment-verification-dry-run.md)

Execution record template: [first-release-target-environment-verification-execution-record.md](./first-release-target-environment-verification-execution-record.md)

## 2. 使用边界

使用边界：

- 适用于 release candidate 确认后。
- 适用于目标环境首次发布前。
- 只做验证计划。
- 不允许自动更新 baseline。
- 不允许在目标环境运行 `UPDATE_SNAPSHOTS=true`。
- 不允许记录真实生产密钥、真实数据库密码或真实管理员密码。

## 3. 验证前置条件

验证前置条件：

- release candidate commit 已确认。
- 目标服务器 / 容器环境已准备。
- `.env.production` 已由运维或负责人配置。
- 数据库实例已准备。
- 文件存储目录已准备。
- 操作人有必要权限。
- 有数据库备份窗口。
- 发布失败时的停止和回滚负责人已确认。

## 4. 验证顺序总览

建议顺序：

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

## 5. P0-1 环境变量与密钥验证

检查项：

- `.env.production` 存在。
- `JWT_SECRET` 非默认值。
- `POSTGRES_HOST` / `POSTGRES_PORT` / `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` 已配置。
- `WEB_ORIGIN` 已配置。
- `FILE_STORAGE_LOCAL_ROOT` 已配置。
- `AUTH_SMS_FIXED_CODE` 为空。
- `AUTH_SMS_CODE_VISIBLE=false`。
- `AUTH_WECHAT_MOCK_ENABLED=false`。
- `.env.production` 未提交到 git。

通过标准：

- 必要变量均存在。
- 不使用默认弱值。
- mock 不处于生产可用状态。
- 没有真实密钥进入 git diff 或日志。

失败停止条件：

- 缺少必要变量。
- 使用默认密钥。
- mock 仍启用。
- `.env.production` 被提交。

## 6. P0-2 数据库连接与 migration 验证

检查项：

- 数据库可连接。
- migration 可执行。
- migration 失败立即停止。
- 不连接开发污染库。

命令草案：

```bash
pnpm db:migrate
```

执行前必须确认 `ENV_FILE`、`.env.production` 或数据库连接变量指向目标环境。

通过标准：

- migration 命令成功退出。
- migration 日志无失败项。
- migration history / checksum 未出现冲突。
- 目标数据库确认不是开发污染库。

失败停止条件：

- 数据库不可连接。
- migration 失败。
- migration history / checksum 冲突。
- 数据库指向不明或疑似开发污染库。

## 7. P0-3 production seed 与初始化闭环验证

检查项：

- production core seed 执行。
- dev-only seed 禁止。
- tenant / park 初始化。
- 权限树完整。
- 角色完整。
- 角色权限完整。
- module 授权完整。
- `db:check:init` 结果记录。

命令草案：

```bash
ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod

TENANT_ID=10000001 \
PARK_ID=20000001 \
pnpm db:check:init
```

通过标准：

- production seed 成功。
- `db:check:init` 在 bootstrap admin 前的预期结果可解释。
- bootstrap admin 后 `db:check:init` 为 `PASS`，或只有明确可接受的 `WARN`。
- 没有 dev seed 污染。
- 至少具备后续 bootstrap admin 条件。

失败停止条件：

- production seed 失败。
- dev-only seed 进入目标环境。
- tenant / park / 权限 / 角色 / module 授权缺失且不可解释。
- `db:check:init` 出现不可接受的 `FAIL`。

## 8. P0-4 bootstrap admin 验证

检查项：

- 执行 bootstrap admin。
- 管理员账号存在。
- 密码不使用默认测试值。
- 不在日志打印密码 / hash。
- 幂等执行结果可接受。

命令草案：

```bash
TENANT_ID=10000001 \
PARK_ID=20000001 \
ADMIN_USERNAME=<ADMIN_USERNAME> \
ADMIN_PASSWORD='<STRONG_PASSWORD>' \
ADMIN_NAME='<ADMIN_NAME>' \
ADMIN_EMAIL='<ADMIN_EMAIL>' \
ADMIN_PHONE='<ADMIN_PHONE>' \
ROLE_CODE=SUPER_ADMIN \
pnpm db:bootstrap:admin
```

通过标准：

- 至少一个管理员可登录。
- bootstrap-admin 不创建重复用户。
- 日志中无明文密码和密码 hash。
- 登录 smoke 通过。

失败停止条件：

- bootstrap admin 失败。
- 管理员无法登录。
- 使用默认测试密码。
- 日志泄露密码或 hash。

## 9. P0-5 auth smoke 与 mock 禁用验证

检查项：

- `/auth/login`。
- `/auth/me`。
- token 签发与校验。
- production mock hard-fail。
- SMS / WeChat 首版禁用策略确认。

命令草案：

```bash
sh scripts/verify-api-login-dockerexec.sh
```

如目标环境不能使用 docker exec 验证，应使用等价的 API 登录 smoke，并记录请求入口、执行人和结果。

通过标准：

- 登录成功。
- `/auth/me` 返回当前用户。
- token 签发与校验正常。
- mock 不能绕过真实鉴权。
- SMS / WeChat 登录仍按首版范围禁用。

失败停止条件：

- 登录失败。
- `/auth/me` 失败。
- token 校验异常。
- mock auth 或 mock wechat 仍可在生产绕过真实鉴权。

## 10. P0-6 文件存储验证

检查项：

- `FILE_STORAGE_LOCAL_ROOT` 指向存在目录。
- 发布用户有读写权限。
- Docker volume / 宿主机挂载路径一致。
- 上传 / 读取路径符合预期。
- 文件备份方式已确认。

通过标准：

- 目录存在。
- API 运行用户可写入。
- 容器内外路径与部署文档一致。
- 至少一次上传 / 读取 smoke 成功。
- 文件目录或 volume 备份方式明确。

失败停止条件：

- 目录不存在。
- 无写权限。
- 容器内外路径不一致。
- 上传或读取失败。
- 无备份策略。

## 11. P0-7 备份与回滚验证

检查项：

- 发布前数据库备份。
- 回滚镜像 / commit。
- 环境变量回退。
- migration 失败处理。
- 文件存储回滚边界。
- 服务日志位置。

通过标准：

- 能明确回滚到上一个可用版本。
- 数据库备份文件存在且可定位。
- 操作人知道 API / Web / PostgreSQL 日志位置。
- 文件存储恢复边界明确。
- migration 失败时不会继续 seed / bootstrap / deploy。

失败停止条件：

- 无数据库备份。
- 回滚目标版本不明确。
- 环境变量无法回退。
- 日志位置不明确。
- 文件存储恢复边界不明确。

## 12. P0-8 release gate 验证

检查项：

- 常规 CI 通过。
- release smoke 结果确认。
- 默认 API snapshot 通过。
- `API Snapshot Numeric` 可按需手动触发。
- numeric workflow 不更新 baseline。
- 不运行 `UPDATE_SNAPSHOTS=true`。

默认 API snapshot 命令草案：

```bash
node scripts/e2e/first-release-api-snapshots.mjs
```

numeric workflow 使用 GitHub Actions 手动入口：

```text
Actions -> API Snapshot Numeric -> Run workflow -> <release candidate branch>
```

通过标准：

- 常规 CI 通过。
- release smoke 按发布策略通过或已有明确结论。
- default snapshot 通过。
- numeric workflow 如用于 release candidate 检查，结果为 `succeeded`。
- 无 baseline diff。

失败停止条件：

- 常规 CI 失败且无明确豁免。
- default snapshot 失败。
- numeric workflow 失败且原因不明。
- 出现 baseline 自动更新或 `UPDATE_SNAPSHOTS=true`。

## 13. P0-9 发布后 smoke 验证

检查项：

- health。
- readiness。
- Web 首页。
- 管理员登录。
- `/auth/me`。
- 核心页面。
- 关键 API。
- 日志无明显启动错误。

命令草案：

```bash
MODE=readiness pnpm prod:health
```

通过标准：

- health 通过。
- readiness 通过。
- Web 首页可访问。
- 管理员登录通过。
- `/auth/me` 通过。
- 核心页面和关键 API 可访问。
- API / Web 日志无启动级错误。

失败停止条件：

- health 不通过。
- readiness 不通过。
- 管理员无法登录。
- `/auth/me` 失败。
- 核心页面不可访问。
- 日志出现启动级错误。

## 14. 总失败停止规则

任一情况出现时，应停止发布或进入回滚判断：

- migration 失败：停止发布。
- seed 失败：停止发布。
- `db:check:init` 失败：停止发布。
- bootstrap admin 失败：停止发布。
- auth smoke 失败：停止发布。
- 文件存储不可写：停止发布。
- mock 未禁用：停止发布。
- release gate 失败且原因不明：停止发布。
- 发布后 smoke 失败：停止发布并进入回滚判断。

## 15. 结果记录模板

```text
Release candidate commit:
Target environment:
Operator:
Date:
ENV verification:
DB migration:
Production seed:
Init baseline:
Bootstrap admin:
Auth smoke:
File storage:
Backup:
Rollback readiness:
Default API snapshot:
API Snapshot Numeric:
Post-release smoke:
Final decision:
Blocking issues:
Follow-up owner:
```

## 16. 阶段性结论

本文完成目标环境验证计划。

下一步可进入 target environment verification dry-run 或实际目标环境验证。任何 P0 项不通过，都不应继续发布。
