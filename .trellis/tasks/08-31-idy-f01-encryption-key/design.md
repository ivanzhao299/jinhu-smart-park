# Design: IDY-F01

## Boundaries

数据流：环境配置 → 单一 keyring parser/validator → Party sensitive service → Party/draft/snapshot metadata → tenant-scoped rotation transaction → required audit。

配置解析是唯一权威。业务服务不得直接读取备用业务 secret。Web/API 响应永不返回 keyring、密文或 key material。

## Key Contract

- 保留 `PARTY_DATA_ENCRYPTION_KEY` 作为 `party-data-v1` 兼容输入。
- 新增显式 active key id 与历史 keyring 配置；key id 使用受限格式且长度不超过 DB 128。
- active id 必须能在 keyring 中解析到至少 32 字符的专用 key；重复、未知、空白、非法 JSON/格式均 fail-closed。
- envelope 仍保持 `enc:v1`（算法/payload format 版本），key id 独立表达密钥版本；轮换密钥不冒充算法升级。
- encrypt/HMAC 使用 active key；decrypt 接收 key id 并从 keyring 选择。未知 id 或鉴权失败抛错，不返回伪成功。
- AES keyring 与稳定 identity fingerprint key 分离。首次升级 fingerprint key 与现有 v1 key 相同以保持历史 HMAC；fingerprint key 更换需要独立 hash migration。

## Storage And Compatibility

- 为 `biz_party.identity_number_encryption_key_id` 增加 metadata；有密文时必须有 key id，无密文时为空。
- 存量 Party 非空密文回填 `party-data-v1`，依据是应用历史唯一生产 profile；这是 metadata 归属声明，不是数据已成功解密/轮换的声明。
- draft/snapshot 保留已有 key id；新增约束只要求合法非空格式，不把所有历史强制改成 v1，以支持真实双读。
- 轮换前 inventory 必须按 tenant/park 检查未知 key id、非法 envelope 与不可解密行；任一异常使该 scope fail-closed。

## Rotation

- 管理入口使用独立命令/服务，不经普通 Party 更新 API，不暴露 key material。
- 以 tenantId/parkId + request key 定义一次 rotation；先锁 scope，再按稳定主键顺序读取三类密文。
- 仅重加密 key id 不等于 active id 的行；已完成行跳过，使 crash/retry 可恢复。
- 每个 scope 在一个事务内重加密并写 required audit/receipt；失败回滚该 scope，不跨租户形成半事务。
- audit 只含 scope、from/to key id、分类计数、request id、actor 与结果。

## Migration Semantics

- 新迁移编号高于当前最大编号且不重复，不修改 `000176/000185`。
- 先加 nullable metadata、按非空密文回填 v1、再加成对 CHECK；逐租户数据值不改变。
- 不执行全库 ciphertext rewrite；真实轮换由显式逐租户命令完成。
- rollback 是部署回滚继续保留新列/新 key；旧 key 在 inventory 全清零并过观察期前不得移除。

## Operations

- 部署顺序：配置 active+历史 keyring → 启动校验/双读 → migration → scope inventory → rotation → 验证旧 key 引用为零 → 延迟移除旧 key。
- `ensure-production-secrets.sh` 只生成/保持 v1 兼容 key，不自动制造轮换事实。
- 日志、CI、UAT、Issue、PR 和报告不得包含任何 key、明文、密文或 hash。
