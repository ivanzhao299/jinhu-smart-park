# B-2a C3-0 / 000195 最终数据库门禁签署

日期：2026-08-01  
结论：PASS  
范围：`000195_property_mutation_receipt_contract_v2.sql` 独立 schema Gate；不包含 C3 receipt port 业务实现，也不授权开启任何运行控制。

## 签署输入

- migration SHA-256：`9b89f6dbfdec8cfcaa278dffb58677f8b9ccd3032f30f0f264155b6c656198f4`
- contract spec SHA-256：`a886d58740fbbbaa896d89a43f8f8f5414ccf88b37b4a4a7f9a95f713d049d71`
- runner SHA-256：`3619e7a8f6e0bc4e20b9625693d70cfe4c307fc84603ccad4b47dfa0ac21bcd7`
- 正式 runId：`b2ac30_formal_20260801f`
- candidate SHA-256：`5dfd0e69ae6f5974d6c3f80ebd8160abbab066da4907a3d33aed24824d1281ba`
- detached manifest SHA-256：`c1683da295b60deb480fb1ea9ffd0519263eefc2911f0bb7bffd75210c2821aa`
- 000195 后 catalog grammar SHA-256：`3497ea75133947e46422f9bc17546711c3825717b98acd6aa6925774de74689a`

## 门禁结果

- 13/13 动态合同测试通过，0 跳过、0 失败。
- 7 类双迁移历史异常全部失败关闭并精确回滚。
- 11 类迁移、控制、审计、未知动作、partial schema 与 writer 漂移负例全部失败关闭并精确回滚。
- 13 个 legacy action 的 started/completed/failed 共 39 条历史收据迁移前后逐字节一致。
- 13 个 legacy action 的 omission/default 与显式 `legacy-v1` 写入兼容；8 个 `port-v2` action/identity/result 分支通过。
- 两个有效 scope 共 24 个控制项保持 disabled，形成 24 条 000195 审计；未开启任何控制。
- 000195 重跑前后完整状态 SHA 均为 `181e7341614635d1dcb640c6caee577adbabbb9bc869804149baa95d7009890a`，为 exact no-op。
- 000191/000192 保持预留，迁移和门禁对其零依赖。
- 专属容器、匿名卷和临时 wrapper 均已清理并证明不存在。

## 独立复审

- 数据库 / 架构：PASS，P0/P1/P2 = 0/0/0。
- 测试 / 安全：PASS，P0/P1/P2 = 0/0/0。
- 产品兼容 / 运营：PASS，P0/P1/P2 = 0/0/0。
- `open_P0_P1=[]`。

失败 run `a` 至 `e` 均保留为不可采纳的诊断证据，状态为 `failed` 且 `candidate_admissible=false`；只有 run `f` 为正式 PASS 候选。

## 阶段释放

000195 schema Gate 已关闭，释放 C3 窄 `PropertyMutationReceiptPort` 业务实现及 B-1、foundation、AppModule v2 重认证。C3 业务实现独立 Gate 通过前，C4 继续封锁。
