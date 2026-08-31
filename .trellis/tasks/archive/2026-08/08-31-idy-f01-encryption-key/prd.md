# IDY-F01 敏感数据加密密钥 fail-closed 与版本化轮换

## Goal

消除 Party 敏感数据四级密钥回退，使 API 在专用密钥配置缺失/非法时启动失败，并建立可验证、可审计、兼容既有 v1 密文的版本化轮换能力。

## Confirmed Facts

- 生产 `ConfigModule.validate` 已检查 `PARTY_DATA_ENCRYPTION_KEY` 长度，但运行时仍回退到 IoT/JWT/固定开发 secret。
- 新写入固定标记 `party-data-v1`；snapshot/draft 有 key id，`biz_party` 主表无 key id。
- 仓库 fixture 存在非 canonical 假密文，故不能声称所有历史数据均可证明为 v1。
- snapshot 投影当前未读取 key id，所有解密都使用当前单一 key。

## Requirements

- 所有运行环境的敏感数据服务只接受显式 Party 专用 key 配置，不得读取 IoT/JWT/硬编码回退；生产启动必须 fail-closed。
- 配置包含显式 active key id 和按 key id 索引的 keyring；现有 `PARTY_DATA_ENCRYPTION_KEY` 作为兼容 v1 输入，历史 key 仅用于双读，新写入只用 active key。
- `biz_party` 增加 key metadata；snapshot/draft 读取 key id 后选择对应历史 key解密。
- 提供按 tenant/park 确定性顺序、可恢复、幂等的轮换执行入口；逐行解密后用 active key 重加密，保持 HMAC/脱敏语义一致。
- 轮换审计使用 required 语义，记录 actor、scope、旧/新 key id、计数和结果，不记录 key、明文、密文或 hash。
- forward-only migration 只补 metadata/约束和轮换审计所需结构；不把不可解密 fixture/历史数据伪造为成功轮换。
- 生产 smoke/契约断言缺 key/短 key/非法 keyring 启动失败、无回退、旧密文双读、新写入 active key、轮换审计无泄漏。
- 同步 env examples、生产部署/架构文档和相关部署契约。

## Acceptance Criteria

- [ ] 缺失 Party 专用 key 时服务/生产启动失败；IoT/JWT/固定开发值均不能兜底。
- [ ] active=v2 时 v1 密文仍可解密，新密文 metadata 为 v2；未知 key id fail-closed。
- [ ] Party、draft、snapshot 三类密文都按 metadata 双读并可逐租户轮换。
- [ ] 同一轮换请求可安全重试，不跨 tenant/park，审计失败则轮换事务失败。
- [ ] 迁移为新编号 forward-only；存量 v1 metadata 回填有明确前置检查，非 canonical 行被 guard/报告而非伪造。
- [ ] 单元、迁移/生产契约、API typecheck/lint/build 与相关 property 回归通过。
- [ ] 文档明确轮换顺序、回滚边界、秘密禁入证据和逐租户语义。

## Out of Scope

- 引入外部 KMS/云厂商 SDK；本 PR 提供可替换的版本 keyring 合同。
- 住宿业 P0-02/P0-03/P0-04、同意/留存/reveal/住房门槛。
- 对无法用声明历史 key 解密的遗留伪密文进行猜测或强制改写。

## Open Questions

无。配置和迁移技术选择由现有安全目标与仓库部署合同约束，用户已批准实施。
