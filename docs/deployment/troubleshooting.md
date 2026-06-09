# JinHu Smart Park 运维排障手册

本手册用于整理当前首发基线下最常见的 API、数据库、文件存储、migration 和回归脚本问题排查入口。

## 1. API 无法启动

优先检查：

- 环境变量是否完整
- PostgreSQL 连接是否可用
- 生产态 auth mock 相关变量是否正确禁用
- 文件存储路径是否存在且可写
- migration 是否已经执行

建议关注：

- `.env.production` 是否遗漏 `POSTGRES_*`、`JWT_SECRET`、`FILE_STORAGE_LOCAL_ROOT`
- `AUTH_SMS_FIXED_CODE` 是否为空
- `AUTH_SMS_CODE_VISIBLE` 是否为 `false`
- `AUTH_WECHAT_MOCK_ENABLED` 是否为 `false`

## 2. `/ready` 失败

优先检查：

- 数据库 schema 是否完整
- `production seed` 是否已执行
- `bootstrap-admin` 是否已执行
- 文件存储目录是否可访问
- 必要基线是否已初始化

建议动作：

- 执行 `pnpm db:check:init`
- 检查 migration 是否存在 `failed` 或 `running` 状态
- 检查 API 日志中的数据库和文件存储错误

## 3. 登录失败

优先检查：

- `bootstrap-admin` 是否已创建首管账号
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` 是否与当前环境一致
- 生产态 mock 是否已禁用
- `JWT_SECRET` 是否已配置

补充说明：

- 首发口径仅支持用户名密码登录
- SMS 和 WeChat 登录在首发生产口径下不应作为可用链路

## 4. Migration 失败

先参考：

- [../release/production-migration-execution-policy.md](../release/production-migration-execution-policy.md)
- [../release/migration-history-checksum-design.md](../release/migration-history-checksum-design.md)

重点排查：

- checksum conflict
- `failed` 状态残留
- `running` 状态残留
- 历史重复编号 warning
- 数据库备份是否可用于恢复

处理原则：

- 不要在生产上盲目继续执行后续 migration
- 不要随意修改已执行历史 SQL 后直接重跑
- 仍然采用 forward-only 策略，严重问题优先按备份恢复处理

## 5. 文件上传失败

优先检查：

- `FILE_STORAGE_LOCAL_ROOT`
- Docker volume / bind mount 是否正确
- API 进程对存储目录是否有写权限
- MIME allowlist 是否命中
- 文件大小限制是否命中

补充说明：

- 当前首发使用单机本地文件存储
- 本地目录不可写会直接影响上传能力
- 文件恢复需要和数据库备份一起考虑

## 6. 回归脚本失败

优先检查：

- `API_BASE_URL` 是否正确
- 管理员账号是否可登录
- `TEST_RUN_ID` 是否需要更新
- 数据库是否已完成 `production seed`
- `X-Idempotency-Key` 是否冲突
- 文件存储目录是否可写

建议入口：

- 测试运行手册：[../testing/how-to-run-tests.md](../testing/how-to-run-tests.md)
- 首发回归设计：[../testing/first-release-regression-plan.md](../testing/first-release-regression-plan.md)

## 7. Docker / 端口冲突

常见场景：

- PostgreSQL `5432` 已被占用
- API `3001` 已被占用
- Web `3000` 已被占用

处理建议：

- 使用 `.env.production` 中的 published port 配置调整端口
- 启动前先执行 `docker compose config` 确认实际生效配置
- 不要轻易执行 `docker compose down -v`

补充说明：

- `down -v` 会删除命名 volume
- 这可能同时破坏 PostgreSQL 数据和本地文件存储
- 需要保留问题现场时，优先保留容器和日志，再做后续处置
