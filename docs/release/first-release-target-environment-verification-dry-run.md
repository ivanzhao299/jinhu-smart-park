# JinHu Smart Park first release target environment verification dry-run

## 1. 目的

本文用于在正式发布前预演目标环境验证流程，将 `docs/release/first-release-target-environment-verification-plan.md` 中的 P0 项转换成 dry-run 结果记录。

本文不是正式发布记录，不包含真实密钥、真实数据库密码、真实管理员密码或真实 token，不用于更新 baseline。

Execution record template: [first-release-target-environment-verification-execution-record.md](./first-release-target-environment-verification-execution-record.md)

## 2. 使用边界

使用边界：

- 适用于 release candidate 前的目标环境验证预演。
- 不执行 `UPDATE_SNAPSHOTS=true`。
- 不生成或提交 baseline。
- 不记录真实密钥、真实密码、真实 token。
- dry-run 失败不应继续发布。
- 真实执行命令前必须确认环境指向。

## 3. dry-run 前置条件

前置条件：

- release candidate commit 已确认。
- 操作人已确认。
- 目标环境名称已确认。
- `.env.production` 已由负责人配置。
- 数据库备份窗口已确认。
- 文件存储目录已准备。
- 本地或目标环境 shell 指向正确项目目录。
- 操作人已确认不会记录真实生产密钥、真实数据库密码、真实管理员密码或真实 token。

## 4. dry-run 执行顺序

建议顺序：

1. 环境变量与密钥核验。
2. 数据库连接核验。
3. migration dry-run / 实际验证。
4. production seed 验证。
5. 初始化闭环验证。
6. bootstrap admin 验证。
7. auth smoke 验证。
8. mock 禁用验证。
9. 文件存储验证。
10. 备份与回滚准备验证。
11. 常规 CI / release gate 结果确认。
12. 默认 API snapshot 结果确认。
13. `API Snapshot Numeric` 结果确认。
14. 发布后 smoke 项预演确认。

## 5. dry-run 结果表

| 编号 | 验证项 | 预期命令 / 检查方式 | 当前结果 | 是否阻塞 | 备注 |
| -- | -- | -- | -- | -- | -- |
| P0-1 | 环境变量与密钥 | 检查 `.env.production`、`JWT_SECRET`、DB 变量、`WEB_ORIGIN`、`FILE_STORAGE_LOCAL_ROOT`、mock 变量；确认 `.env.production` 未提交 | 待填写 | 待填写 | 不记录真实密钥 |
| P0-2 | 数据库连接与 migration | `pnpm db:migrate`，执行前确认连接指向目标环境 | 待填写 | 待填写 | migration 失败即停止 |
| P0-3 | production seed / 初始化闭环 | `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod`；`pnpm db:check:init` | 待填写 | 待填写 | 禁止 dev-only seed |
| P0-4 | bootstrap admin | `pnpm db:bootstrap:admin`，使用占位符记录账号配置 | 待填写 | 待填写 | 不记录真实密码 |
| P0-5 | auth smoke / mock 禁用 | `sh scripts/verify-api-login-dockerexec.sh` 或等价 API smoke | 待填写 | 待填写 | 不记录 token |
| P0-6 | 文件存储 | 检查 `FILE_STORAGE_LOCAL_ROOT`、目录、权限、挂载、上传 / 读取 smoke | 待填写 | 待填写 | 确认备份方式 |
| P0-7 | 备份与回滚 | 检查数据库备份、回滚 commit / 镜像、环境变量回退、日志位置 | 待填写 | 待填写 | 无备份则阻塞 |
| P0-8 | release gate | 常规 CI、默认 API snapshot、`API Snapshot Numeric` manual workflow | 待填写 | 待填写 | 禁止 baseline update |
| P0-9 | 发布后 smoke | `MODE=readiness pnpm prod:health`，Web 首页、管理员登录、`/auth/me`、核心页面和日志检查 | 待填写 | 待填写 | 发布后失败进入回滚判断 |

## 6. 建议命令清单

按仓库当前 `package.json` 和 release gate 文档，dry-run 可参考以下命令草案。实际执行前必须确认环境变量和连接指向目标环境。

```bash
pnpm db:migrate

ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod

TENANT_ID=10000001 \
PARK_ID=20000001 \
pnpm db:check:init

TENANT_ID=10000001 \
PARK_ID=20000001 \
ADMIN_USERNAME=<ADMIN_USERNAME> \
ADMIN_PASSWORD='<STRONG_PASSWORD>' \
ADMIN_NAME='<ADMIN_NAME>' \
ADMIN_EMAIL='<ADMIN_EMAIL>' \
ADMIN_PHONE='<ADMIN_PHONE>' \
ROLE_CODE=SUPER_ADMIN \
pnpm db:bootstrap:admin

sh scripts/verify-api-login-dockerexec.sh

node scripts/e2e/first-release-api-snapshots.mjs

MODE=readiness pnpm prod:health
```

`API Snapshot Numeric` 应通过 GitHub Actions manual workflow 执行：

```text
Actions -> API Snapshot Numeric -> Run workflow -> <release candidate branch>
```

禁止在 dry-run 中使用：

```bash
UPDATE_SNAPSHOTS=true
```

## 7. 通过标准

通过标准：

- P0 项全部通过，或有明确负责人和关闭时间。
- 无真实密钥、真实密码、真实 token 泄露。
- 未使用 dev seed。
- mock 已禁用。
- 文件存储可读写。
- release gate 通过。
- baseline 未被修改。
- rollback readiness 明确。

## 8. 失败停止规则

失败停止规则：

- migration 失败：停止。
- seed 失败：停止。
- `db:check:init` 失败：停止。
- bootstrap admin 失败：停止。
- auth smoke 失败：停止。
- mock 未禁用：停止。
- 文件存储不可写：停止。
- release gate 失败：停止。
- 发布后 smoke 失败：停止并进入回滚判断。

## 9. dry-run 记录模板

```text
Dry-run date:
Release candidate commit:
Target environment:
Operator:
ENV result:
DB migration result:
Production seed result:
Init baseline result:
Bootstrap admin result:
Auth smoke result:
Mock disabled result:
File storage result:
Backup / rollback readiness:
Default API snapshot:
API Snapshot Numeric:
Post-release smoke readiness:
Blocking issues:
Decision:
Next owner:
```

## 10. 阶段性结论

dry-run 通过后，下一步才进入实际 target environment verification 或 release candidate 执行。实际执行记录应填写 `docs/release/first-release-target-environment-verification-execution-record.md`。

如果 dry-run 中任一 P0 项失败或无法解释，不应继续发布。
