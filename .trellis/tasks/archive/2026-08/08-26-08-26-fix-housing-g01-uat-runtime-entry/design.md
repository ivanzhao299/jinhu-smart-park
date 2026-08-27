# Technical Design

## Shape

新增一个 Node.js UAT 命令作为唯一入口。命令负责环境/参数 fail-closed 校验，并通过显式的 `docker compose -f <file> -p <project> exec -T <postgres-service> psql -X -v ON_ERROR_STOP=1` 执行固定 SQL；调用者不能注入任意 SQL、表名或 runtime key。

## Safety boundary

- 写入要求专用 allow flag 与 `local|disposable|test|ci` target。
- 拒绝 production-like Node/app target、数据库名、host、compose/project 标记；compose 文件必须显式存在，project/container 必须由调用者精确给出。
- 仅处理调用者给定 tenant/park 下唯一 `approval.enforce`，并校验 signed contract hash、disabled 状态和 expected version。

## Transaction and audit

SQL 在一个事务中锁定 control 行，捕获 before JSON，执行 version CAS，验证恰好一行，捕获 after JSON，随后写一条 `sys_op_log`。审计 action/resource/biz id/request id 固定命名；detail JSON 保存 scope、approval reference 与 before/after。事务提交后回读两行，以制表符安全摘要输出，不打印数据库 URL、密码或 token。

## Compatibility

不修改表结构、seed、迁移、API 或 Web。生产默认 disabled 合同完全不变；命令不被 production deploy 调用。回滚是删除该命令、测试、package script 与文档，不需要数据回滚；UAT 数据由隔离环境整体清理。

## Test strategy

契约测试执行命令的纯校验路径并注入假 docker executable 捕获 stdin：断言 production 在 spawn 前拒绝；disposable 写路径生成固定 psql 调用；SQL 包含事务、CAS、恰好一行检查、`sys_op_log` 插入与回读。测试不依赖本机 Docker 或 PostgreSQL。
