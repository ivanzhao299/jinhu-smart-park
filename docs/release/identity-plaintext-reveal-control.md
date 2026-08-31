# 身份证件明文受控查看

Party 列表与详情始终使用脱敏证件号；`party:sensitive_read` 只开放联系方式、证件类型和脱敏值，不再让普通响应携带证件明文。

确需查看明文时，操作者必须同时满足当前 tenant/park 的 asset 模块约束和独立权限 `party:identity_reveal`，并通过 Party 详情中的独立动作选择受控理由。API 为 `POST /api/v1/property/parties/:partyId/identity-reveal`，理由只允许：

- `BUSINESS_OPERATION`
- `LEGAL_COMPLIANCE`
- `DISPUTE_HANDLING`
- `DATA_SUBJECT_REQUEST`

每次动作都会重新校验权限、Party tenant/park、处理限制和密文 key id，并在返回明文前写入 required audit。审计只记录 Party ID、操作者、scope 和 reason code，不记录证件明文、密文、哈希或密钥。审计失败、密文不可解、Party 已受处理限制或越 scope 时均不返回明文。

该 POST 按全局规则携带 `X-Idempotency-Key`，但刻意不使用响应 replay cache：缓存会扩大明文驻留，并可能让重放绕过逐次访问审计。上线时需运行 forward-only migration `000288_party_identity_reveal_permission.sql`；migration 对每个 asset-entitled tenant 收敛一个权限，并为内置 super role 建立当前 park grant，重放不重复写入。

发布验收至少覆盖：普通详情无明文、无 reveal 权限拒绝、受控理由校验、成功审计不含敏感值、审计失败闭锁、跨 tenant/park 不可见、migration fresh/replay/多租户，以及桌面与 390px 页面动作可用性。
