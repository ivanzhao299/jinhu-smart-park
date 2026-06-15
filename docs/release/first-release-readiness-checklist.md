# JinHu Smart Park first release readiness 总清单

## 1. 目的

本文用于首版发布前确认 release readiness。它不是新增功能设计，也不替代现有部署 SOP、回滚 SOP、生产初始化文档或测试脚本。

本文只整理发布前人工核对项和结果记录模板，不通过 checklist 自动更新 baseline。

Readiness gap analysis: [first-release-readiness-gap-analysis.md](./first-release-readiness-gap-analysis.md)

Target environment verification plan: [first-release-target-environment-verification-plan.md](./first-release-target-environment-verification-plan.md)

Target environment verification dry-run: [first-release-target-environment-verification-dry-run.md](./first-release-target-environment-verification-dry-run.md)

Target environment verification execution record: [first-release-target-environment-verification-execution-record.md](./first-release-target-environment-verification-execution-record.md)

Safety module full-open phase 1 record: [safety-module-full-open-phase-1-record.md](./safety-module-full-open-phase-1-record.md)

## 2. 使用方式

使用方式：

- 在 release candidate commit 确认后使用。
- 每次发布前按 checklist 核对。
- 只记录检查项和结果。
- 不通过 checklist 执行 `UPDATE_SNAPSHOTS=true`。
- 不通过 checklist 自动更新默认 baseline 或 numeric baseline。

## 3. 发布范围确认

发布范围检查项：

- [ ] 首版范围已冻结。
- [ ] 不追加新模块。
- [ ] 当前 release candidate commit 已确认。
- [ ] 只允许 P0 / release blocker 修复。
- [ ] 非首版功能已保持隐藏或未纳入本次发布验收。

## 4. 环境变量与密钥

环境变量与密钥检查项：

- [ ] `.env.production` 已配置。
- [ ] `JWT_SECRET` 不使用默认值。
- [ ] 数据库账号和密码已确认。
- [ ] `POSTGRES_HOST` / `POSTGRES_PORT` / `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` 已确认。
- [ ] `WEB_ORIGIN` 已配置为生产访问域名。
- [ ] 文件存储路径已确认。
- [ ] `AUTH_SMS_FIXED_CODE` 为空。
- [ ] `AUTH_SMS_CODE_VISIBLE=false`。
- [ ] `AUTH_WECHAT_MOCK_ENABLED=false`。
- [ ] 生产 mock auth / mock wechat 等危险 mock 已禁用。
- [ ] `.env.production` 未提交到仓库。

## 5. 数据库与 migration

数据库与 migration 检查项：

- [ ] 数据库连接正常。
- [ ] migration 可执行。
- [ ] migration 执行结果已记录。
- [ ] schema 初始化完成。
- [ ] 未使用开发污染库。
- [ ] 未运行 dev-only seed。
- [ ] 数据库备份策略已确认。
- [ ] migration 失败时的停止策略已确认。

## 6. seed 与初始化闭环

seed 与初始化闭环检查项：

- [ ] production core seed 已执行。
- [ ] dev-only seed 未进入生产。
- [ ] tenant 初始化完成。
- [ ] park 初始化完成。
- [ ] 权限树完整。
- [ ] 角色完整。
- [ ] 角色权限关系完整。
- [ ] SaaS module baseline 完整。
- [ ] tenant module 授权完整。
- [ ] `pnpm db:check:init` 结果已记录。

## 7. 管理员账号 bootstrap

管理员账号 bootstrap 检查项：

- [ ] `pnpm db:bootstrap:admin` 已执行。
- [ ] 至少存在一个可登录管理员。
- [ ] 管理员密码不是默认测试密码。
- [ ] bootstrap-admin 未打印明文密码。
- [ ] bootstrap-admin 未打印密码 hash。
- [ ] 重复执行 bootstrap-admin 不会创建重复用户。
- [ ] 登录链路验证通过。

## 8. 鉴权与生产 mock

鉴权与生产 mock 检查项：

- [ ] `/auth/login` 通过。
- [ ] `/auth/me` 通过。
- [ ] token 签发正常。
- [ ] token 校验正常。
- [ ] 生产环境 mock auth hard-fail 生效。
- [ ] mock 配置未泄露到生产。
- [ ] SMS 验证码登录仍按首版范围禁用。
- [ ] WeChat QR-code 登录仍按首版范围禁用。

## 9. 文件存储

文件存储检查项：

- [ ] `FILE_STORAGE_LOCAL_ROOT` 已配置。
- [ ] 文件存储目录存在。
- [ ] 文件存储目录有读写权限。
- [ ] 发布用户有访问权限。
- [ ] Docker volume 或宿主机挂载路径符合部署预期。
- [ ] 上传路径符合部署预期。
- [ ] 读取路径符合部署预期。
- [ ] 文件目录或 volume 备份方式已确认。

## 10. CI 与 release gate

CI 与 release gate 检查项：

- [ ] 常规 CI 通过。
- [ ] release smoke 策略已确认。
- [ ] 默认 API snapshot 通过。
- [ ] `API Snapshot Numeric` manual workflow 已按需触发。
- [ ] numeric workflow 仅 `workflow_dispatch`。
- [ ] 未运行 `UPDATE_SNAPSHOTS=true`。
- [ ] 未自动更新 baseline。
- [ ] workflow 日志或 artifact 已检查。
- [ ] release gate 结果已记录。

## 11. API snapshot 与 baseline

API snapshot 与 baseline 检查项：

- [ ] 默认 API snapshot 使用 schema snapshot。
- [ ] `workorders.list` 使用稳定结构快照。
- [ ] `workorders.stats` 默认路径为 schema snapshot。
- [ ] `workorders.stats.numeric` 使用独立 numeric baseline。
- [ ] fixed dataset 正确。
- [ ] `SNAPSHOT-BLD-001` 存在。
- [ ] `SNAPSHOT-FLR-001` 存在。
- [ ] `SNAPSHOT-UNIT-001` 存在。
- [ ] `SNAPSHOT-WO-001` 存在。
- [ ] baseline 如有变化已走单独 PR。
- [ ] baseline diff 已人工审查。

## 12. 回滚与故障处理

回滚与故障处理检查项：

- [ ] 数据库备份方式已确认。
- [ ] 发布失败回滚步骤已记录。
- [ ] 服务日志位置已确认。
- [ ] Docker Compose 状态检查方式已确认。
- [ ] 环境变量回退方式已确认。
- [ ] API 启动失败排查入口已记录。
- [ ] migration 失败时不继续 seed / bootstrap / deploy。
- [ ] 文件存储目录或 volume 的回滚边界已确认。

## 13. 发布后 smoke

发布后 smoke 检查项：

- [ ] 服务健康检查通过。
- [ ] API readiness 通过。
- [ ] Web 首页可访问。
- [ ] 管理员登录通过。
- [ ] `/auth/me` 通过。
- [ ] 核心页面可访问。
- [ ] 关键 API 可访问。
- [ ] API snapshot / smoke 结果已记录。
- [ ] 日志无明显启动错误。

## 14. 发布结论记录

发布结论记录模板：

```text
Release candidate commit:
Release date:
Operator:
CI result:
Default API snapshot result:
API Snapshot Numeric result:
Bootstrap admin result:
Auth smoke result:
Rollback readiness:
Final decision:
```

## 15. 阶段性结论

该 checklist 可作为 first release 前人工 release readiness gate。

发布前应优先确认环境、数据库、production seed、bootstrap admin、鉴权、文件存储、CI、API snapshot gate、manual workflow、回滚和发布后 smoke 均有明确结果。任何 baseline 变化都应脱离 checklist，走单独 PR 和人工审查。
