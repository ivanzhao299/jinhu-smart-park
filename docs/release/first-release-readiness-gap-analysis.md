# JinHu Smart Park first release readiness 差距分析

## 1. 分析目的

本文用于把 `docs/release/first-release-readiness-checklist.md` 转化为发布前缺口表。本文不是新增功能设计，也不替代部署、回滚、初始化或测试文档。

目标是明确当前哪些 release readiness 项已经完成，哪些仍需在目标环境验证，哪些属于发布阻塞，哪些可以发布后继续优化。

## 2. 分类标准

状态分类：

- 已完成：已有脚本、文档、workflow 或验证记录支撑。
- 待验证：机制已有，但需要在目标环境执行确认。
- 阻塞：不解决不能发布。
- 可延后：不影响首版发布，可进入发布后优化。

优先级：

- P0：发布阻塞。
- P1：发布前应完成。
- P2：发布后可优化。

## 3. 总体结论

当前初判：

- API snapshot / numeric workflow 线已完成。
- release readiness checklist 已完成。
- production env / auth hardening 和初始化闭环已有文档、脚本和 CI release-smoke 支撑。
- 主要缺口集中在真实目标环境验证、生产初始化执行、鉴权 smoke、文件存储、回滚与发布后 smoke。
- 当前不建议继续增加新功能。
- 下一步应进入目标环境验证计划。

## 4. 差距分析表

| 领域 | 检查项 | 当前状态 | 优先级 | 证据 / 依据 | 下一步 |
| -- | -- | -- | -- | -- | -- |
| 发布范围 | 首版范围冻结 | 待验证 | P1 | `docs/release/first-release-readiness-checklist.md` 已列入检查项 | release owner 确认范围冻结 |
| 发布范围 | release candidate commit 确认 | 待验证 | P0 | readiness checklist 已要求记录 commit | 发布前固定 commit 并记录 |
| 发布范围 | P0 / release blocker 规则 | 待验证 | P1 | readiness checklist 已列入 | 发布前确认只接受 blocker 修复 |
| 环境变量与密钥 | `.env.production` | 待验证 | P0 | `docs/deployment/production.md` 已要求复制模板并替换密钥 | 在目标环境逐项核验 |
| 环境变量与密钥 | `JWT_SECRET` 非默认值 | 待验证 | P0 | production 文档列为必填项 | 目标环境确认非默认、足够强 |
| 环境变量与密钥 | 数据库连接变量 | 待验证 | P0 | production 文档列出 PostgreSQL 变量 | 目标环境确认连接成功 |
| 环境变量与密钥 | `WEB_ORIGIN` | 待验证 | P1 | production 文档列为必填项 | 确认生产域名配置 |
| 环境变量与密钥 | mock auth / mock wechat 禁用 | 待验证 | P0 | production 文档要求 `AUTH_SMS_FIXED_CODE` 为空、`AUTH_SMS_CODE_VISIBLE=false`、`AUTH_WECHAT_MOCK_ENABLED=false` | 目标环境启动前核验 |
| 数据库 / migration | 目标数据库连接 | 待验证 | P0 | `pnpm db:migrate` 命令已存在 | 在目标环境执行连接检查 |
| 数据库 / migration | migration 执行 | 待验证 | P0 | `package.json` 提供 `pnpm db:migrate`，CI release-smoke 已覆盖该路径 | 在目标环境执行并记录结果 |
| 数据库 / migration | schema 初始化 | 待验证 | P0 | `pnpm db:check:init` 已存在 | production seed 后执行 baseline 检查 |
| 数据库 / migration | 备份策略 | 待验证 | P0 | production 文档要求初始化前备份 | 目标环境确认备份和恢复入口 |
| 数据库 / migration | 禁止污染库 | 待验证 | P0 | readiness checklist 已列入 | 确认目标库不是开发污染库 |
| seed / 初始化闭环 | production core seed | 待验证 | P0 | `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod` 已记录 | 在目标环境执行并记录 |
| seed / 初始化闭环 | dev-only seed 禁止 | 待验证 | P0 | seed README 明确区分 production seed 和 dev seed | 发布前确认未运行 dev seed |
| seed / 初始化闭环 | tenant / park | 待验证 | P0 | production seed / check-init-baseline 覆盖 | 执行 `pnpm db:check:init` |
| seed / 初始化闭环 | 权限树 | 待验证 | P0 | `check-init-baseline` 覆盖权限基线 | 执行并记录 PASS / WARN / FAIL |
| seed / 初始化闭环 | 角色权限 | 待验证 | P0 | `check-init-baseline` 覆盖角色和授权关系 | 执行并记录结果 |
| seed / 初始化闭环 | module 授权 | 待验证 | P0 | `check-init-baseline` 覆盖 tenant module baseline | 执行并记录结果 |
| bootstrap admin | 管理员 bootstrap | 待验证 | P0 | `pnpm db:bootstrap:admin` 已存在，production 文档给出顺序 | 在目标环境执行 |
| bootstrap admin | 至少一个可登录管理员 | 待验证 | P0 | bootstrap-admin 只创建首个登录管理员 | 执行登录 smoke |
| bootstrap admin | 管理员密码非默认 | 待验证 | P0 | production 文档禁止弱默认密码 | 发布操作人确认并保密记录 |
| bootstrap admin | 登录验证 | 待验证 | P0 | `scripts/verify-api-login-dockerexec.sh` 已记录 | 在目标环境执行登录验证 |
| 鉴权与 mock | `/auth/login` | 待验证 | P0 | production 文档和 release-smoke 覆盖登录验证 | 目标环境 smoke |
| 鉴权与 mock | `/auth/me` | 待验证 | P0 | readiness checklist 已列入 | 目标环境 smoke |
| 鉴权与 mock | token 校验 | 待验证 | P0 | auth smoke 需要覆盖 | 目标环境 smoke |
| 鉴权与 mock | production mock hard-fail | 待验证 | P0 | production 文档要求 dangerous mock fail fast | 启动前确认 mock 变量 |
| 文件存储 | `FILE_STORAGE_LOCAL_ROOT` | 待验证 | P0 | production 文档列为必填并说明本地存储 | 目标环境确认实际路径 |
| 文件存储 | 目录存在 | 待验证 | P0 | readiness checklist 已列入 | 创建并检查目录 |
| 文件存储 | 读写权限 | 待验证 | P0 | production 文档说明 API 容器挂载 | 执行上传 / 读取 smoke |
| 文件存储 | Docker volume / 挂载路径 | 待验证 | P0 | production compose 存储路径已记录 | 目标环境确认挂载 |
| 文件存储 | 备份方式 | 待验证 | P1 | production 文档要求备份文件目录或 volume | 发布前确认备份策略 |
| CI / release gate | 常规 CI | 待验证 | P1 | `.github/workflows/ci.yml` 有 verify job | release candidate 上确认通过 |
| CI / release gate | release smoke | 待验证 | P1 | `.github/workflows/ci.yml` 有 release-smoke job | 按策略触发或确认已通过 |
| CI / release gate | 默认 API snapshot | 已完成 | P1 | API snapshot schema / release gate 文档已收口 | 发布前记录一次结果 |
| CI / release gate | `API Snapshot Numeric` | 已完成 | P1 | `.github/workflows/api-snapshot-numeric.yml`，Run `#1` succeeded | release candidate 前按需再触发 |
| CI / release gate | baseline 不自动更新 | 已完成 | P0 | baseline policy 和 workflow 边界均禁止 `UPDATE_SNAPSHOTS=true` | 发布前确认无 baseline diff |
| 回滚与故障处理 | 数据库备份 | 待验证 | P0 | production 文档要求备份 | 发布前实操或确认备份可用 |
| 回滚与故障处理 | 服务回滚 | 待验证 | P1 | production rollback SOP 存在 | 发布前确认回滚步骤 |
| 回滚与故障处理 | 环境变量回退 | 待验证 | P1 | readiness checklist 已列入 | 记录回退方式 |
| 回滚与故障处理 | 日志路径 | 待验证 | P1 | production 文档和 workflow artifact 说明日志入口 | 确认目标环境日志路径 |
| 回滚与故障处理 | API 启动失败排查 | 待验证 | P1 | production troubleshooting / readiness docs 已存在 | 发布前确认排查入口 |
| 发布后 smoke | health | 待验证 | P0 | production 文档有 `pnpm prod:health` 和 readiness URL | 发布后执行 |
| 发布后 smoke | readiness | 待验证 | P0 | production 文档记录 `/api/v1/ready` | 发布后执行 |
| 发布后 smoke | Web 首页 | 待验证 | P1 | readiness checklist 已列入 | 发布后访问验证 |
| 发布后 smoke | 管理员登录 | 待验证 | P0 | bootstrap admin 和 auth smoke 文档支撑 | 发布后登录验证 |
| 发布后 smoke | `/auth/me` | 待验证 | P0 | readiness checklist 已列入 | 发布后 token smoke |
| 发布后 smoke | 核心页面 | 待验证 | P1 | 首版菜单范围已在 production 文档说明 | 发布后抽查 |
| 发布后 smoke | 关键 API | 待验证 | P1 | first-release regression / API snapshot 文档支撑 | 发布后抽查 |
| 发布后 smoke | 日志检查 | 待验证 | P1 | readiness checklist 已列入 | 发布后检查启动日志 |
| 发布自动化 | checklist 自动报告 | 可延后 | P2 | 当前为人工 checklist | 发布后评估 |
| 发布自动化 | 更完整 artifact 汇总 | 可延后 | P2 | workflow 已上传日志，但未统一汇总 release report | 发布后评估 |
| API snapshot 扩展 | 更多 numeric baseline | 可延后 | P2 | 当前仅 `workorders.stats.numeric` | 发布后按需设计 |

## 5. P0 阻塞项清单

当前需要在目标环境发布前确认的 P0 项：

- 目标环境 `.env.production` 已实际核验。
- `JWT_SECRET` 为非默认强密钥。
- 目标数据库连接成功。
- migration 已在目标环境执行确认。
- production seed / init baseline 已在目标环境验证。
- dev-only seed 未进入目标环境。
- bootstrap admin 已在目标环境验证。
- 至少一个管理员可登录。
- 生产 auth smoke 已在目标环境验证。
- mock auth / mock wechat dangerous flags 已禁用。
- `FILE_STORAGE_LOCAL_ROOT` 路径、挂载和读写权限已验证。
- 数据库备份 / 回滚方案已实操确认或由发布负责人签字确认。
- 发布后 health / readiness / 管理员登录 / `/auth/me` smoke 有明确执行人和停止标准。

## 6. P1 发布前应完成项

发布前应完成项：

- release candidate commit 记录。
- 首版范围冻结确认。
- release smoke 触发策略确认。
- 常规 CI 结果记录。
- 默认 API snapshot 结果记录。
- `API Snapshot Numeric` 按 release candidate commit 手动触发并记录。
- workflow 日志 artifact 检查。
- 文件存储备份策略确认。
- 服务回滚步骤确认。
- 发布后 smoke 记录模板准备。
- 核心页面和关键 API 抽查范围确认。

## 7. P2 可延后项

可延后项：

- 更完整的 release workflow 自动化。
- checklist 自动报告。
- 更多 numeric baseline 扩展。
- 更完整的 artifact 汇总。
- 将 release gate 结果汇总为统一 release report。

## 8. 下一步建议

建议进入 `first release target environment verification plan`：`docs/release/first-release-target-environment-verification-plan.md`。

目标：

- 按 P0 项设计目标环境验证顺序。
- 明确执行命令。
- 明确通过 / 失败判定。
- 明确不通过时停止发布。
- 明确每个验证项的负责人和记录位置。
