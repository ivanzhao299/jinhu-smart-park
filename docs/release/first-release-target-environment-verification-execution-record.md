# JinHu Smart Park first release target environment verification execution record

## 1. 目的

本文用于记录 first release 目标环境验证的实际执行结果。它不是部署脚本，不包含真实密钥、真实数据库密码、真实管理员密码或真实 token，不自动更新 baseline。

## 2. 使用边界

使用边界：

- 仅用于 release candidate 目标环境验证记录。
- 不写真实密钥、真实密码、真实 token。
- 不执行 `UPDATE_SNAPSHOTS=true`。
- 不生成或提交 baseline。
- 不替代 `docs/deployment/production.md`。
- 不通过 P0 项不得进入发布。
- 不作为自动发布脚本使用。

## 3. 执行信息

```text
Release candidate commit:
Target environment:
Execution date:
Operator:
Reviewer:
GitHub Actions run:
Deployment host:
Database target:
Storage target:
Final decision:
```

说明：

- `Database target` 只记录环境标识，不记录密码或完整敏感连接串。
- `Storage target` 只记录环境标识或非敏感路径代号，不记录包含密钥的 URL。

## 4. 状态定义

状态定义：

- `PASS`：已执行并通过。
- `FAIL`：已执行但失败。
- `BLOCKED`：无法执行，且阻塞发布。
- `SKIPPED_WITH_REASON`：有明确原因跳过，不阻塞或已被接受。
- `NOT_RUN`：尚未执行。

## 5. P0 验证结果总表

| 编号 | 验证项 | 状态 | 证据 / 日志位置 | 是否阻塞 | 负责人 | 下一步 |
| -- | -- | -- | -- | -- | -- | -- |
| P0-1 | 环境变量与密钥 | NOT_RUN | 待填写 | 待填写 | 待填写 | 待填写 |
| P0-2 | 数据库连接与 migration | NOT_RUN | 待填写 | 待填写 | 待填写 | 待填写 |
| P0-3 | production seed | NOT_RUN | 待填写 | 待填写 | 待填写 | 待填写 |
| P0-4 | 初始化闭环 | NOT_RUN | 待填写 | 待填写 | 待填写 | 待填写 |
| P0-5 | bootstrap admin | NOT_RUN | 待填写 | 待填写 | 待填写 | 待填写 |
| P0-6 | auth smoke | NOT_RUN | 待填写 | 待填写 | 待填写 | 待填写 |
| P0-7 | mock 禁用 | NOT_RUN | 待填写 | 待填写 | 待填写 | 待填写 |
| P0-8 | 文件存储 | NOT_RUN | 待填写 | 待填写 | 待填写 | 待填写 |
| P0-9 | 备份与回滚 | NOT_RUN | 待填写 | 待填写 | 待填写 | 待填写 |
| P0-10 | release gate / deployment traceability | NOT_RUN | 待填写 | 待填写 | 待填写 | 待填写 |
| P0-11 | 发布后 smoke | NOT_RUN | 待填写 | 待填写 | 待填写 | 待填写 |

## 6. 详细记录：环境变量与密钥

记录模板：

```text
Status:
Checked by:
Checked at:
Evidence:
Blocking:
Notes:
```

检查项：

- `.env.production` 存在。
- `JWT_SECRET` 非默认。
- DB 变量完整。
- `WEB_ORIGIN` 正确。
- `FILE_STORAGE_LOCAL_ROOT` 正确。
- mock 相关变量禁用。
- 未提交真实 `.env.production`。

## 7. 详细记录：数据库 / migration

记录模板：

```text
Status:
Command:
Started at:
Finished at:
Evidence:
Blocking:
Notes:
```

检查项：

- 数据库可连接。
- `pnpm db:migrate` 通过。
- migration history 无冲突。
- 未连接开发污染库。

## 8. 详细记录：production seed / 初始化闭环

记录模板：

```text
Status:
Commands:
Started at:
Finished at:
Evidence:
Blocking:
Notes:
```

检查项：

- `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod`。
- `pnpm db:check:init`。
- tenant / park。
- 权限树。
- 角色权限。
- module 授权。
- 禁止 dev seed。

## 9. 详细记录：bootstrap admin

记录模板：

```text
Status:
Command:
Started at:
Finished at:
Evidence:
Blocking:
Notes:
```

检查项：

- `pnpm db:bootstrap:admin`。
- 管理员存在。
- 管理员可登录。
- 不记录密码 / hash。
- 幂等结果。

## 10. 详细记录：auth smoke / mock 禁用

记录模板：

```text
Status:
Command or check:
Started at:
Finished at:
Evidence:
Blocking:
Notes:
```

检查项：

- `/auth/login`。
- `/auth/me`。
- token 校验。
- `scripts/verify-api-login-dockerexec.sh`。
- mock hard-fail。
- SMS / WeChat 首版禁用。

## 11. 详细记录：文件存储

记录模板：

```text
Status:
Checked by:
Checked at:
Evidence:
Blocking:
Notes:
```

检查项：

- `FILE_STORAGE_LOCAL_ROOT`。
- 目录存在。
- 读写权限。
- Docker volume / mount。
- 上传 / 读取 smoke。
- 备份方式。

## 12. 详细记录：备份与回滚

记录模板：

```text
Status:
Checked by:
Checked at:
Evidence:
Blocking:
Notes:
```

检查项：

- 数据库备份。
- 备份文件位置。
- 回滚 commit / image。
- 环境变量回退。
- 文件存储回滚边界。
- 服务日志位置。

注意：

- 不记录包含密钥的完整路径。
- 不记录敏感 URL。
- 不记录数据库密码或完整连接串。

## 13. 详细记录：release gate

记录模板：

```text
Status:
Checked by:
Checked at:
Evidence:
Deployment release marker:
Blocking:
Notes:
```

检查项：

- 常规 CI。
- release smoke。
- 默认 API snapshot。
- `API Snapshot Numeric`。
- artifact / logs。
- baseline 未修改。
- 未运行 `UPDATE_SNAPSHOTS=true`。
- deployment traceability marker：`<production-deploy-path>/.release.json` 存在。
- `.release.json` 的 `commit` 等于本次 GitHub Actions 部署 commit。
- `.release.json` 只包含非敏感字段：`commit`、`ref`、`run_id`、`run_number`、`workflow`、`deployed_at_utc`。
- `.release.json` 不包含 secrets、数据库连接串、`.env.production` 内容、管理员密码或 token。

验证命令：

```bash
cd <production-deploy-path>
cat .release.json
```

阻塞规则：

- 如果 `.release.json` 缺失，P0-10 标记为 `BLOCKED`。
- 如果 `.release.json` 的 `commit` 与 GitHub Actions 部署 commit 不匹配，P0-10 标记为 `BLOCKED`。
- 如果 `.release.json` 包含 secrets、数据库连接串、`.env.production` 内容、管理员密码或 token，P0-10 标记为 `BLOCKED`。

## 14. 详细记录：发布后 smoke

记录模板：

```text
Status:
Checked by:
Checked at:
Evidence:
Blocking:
Notes:
```

检查项：

- health。
- readiness。
- Web 首页。
- 管理员登录。
- `/auth/me`。
- 核心页面。
- 关键 API。
- 启动日志。

## 15. 失败停止判断

记录模板：

```text
Failure item:
Impact:
Stop release: yes/no
Rollback required: yes/no
Owner:
Decision:
```

判断规则：

- P0 `FAIL` 且无豁免：停止发布。
- auth smoke `FAIL`：停止发布。
- migration `FAIL`：停止发布。
- mock 未禁用：停止发布。
- 文件存储 `FAIL`：停止发布。
- 发布后 smoke `FAIL`：进入回滚判断。

## 16. 最终决策

记录模板：

```text
Final decision:
Approved by:
Approved at:
Remaining risks:
Follow-up issues:
Release allowed: yes/no
```

## 17. 阶段性结论

本文提供 first release target environment verification execution record 模板。

下一步可按模板执行真实目标环境验证。不通过 P0 项不得进入正式发布。
