# 身份同意、留存与主体权利基础

本文说明 IDY-F02/F03 的工程边界和上线前置条件，不构成法律意见。

## 同意事实

- `biz_party.consent_status` 仅是兼容投影，通用 Party 新建和编辑不得直接写入授权状态。
- 有效同意必须通过独立同意事实动作记录处理目的、合法性基础、告知文本版本、生效时间、渠道、操作人和幂等键。
- 历史 Party 只记录迁移时观察到的旧枚举；事实状态为 `pending_evidence`、来源为 `legacy_unknown`，不补造告知版本、时间、渠道或操作人。
- 民宿入住仅接受当前、未撤回、`operator_recorded`、`consent` 基础且目的为 `accommodation_checkin` 的事实。历史 `granted` 投影本身不能放行。
- 住房入住交接仅接受当前、未撤回、已生效、`operator_recorded`、`consent` 基础且目的为 `housing_move_in` 的事实。门槛覆盖租约主承租人及全部 occupant，任一主体缺少当前 verified snapshot、证据文件漂移、受处理限制或同意无效时，整个 `move_in` 事务拒绝。
- 住房门槛只在 handover `move_in` 节点执行；建租约、提交、审批、签署与 activate 保持不阻断，以便先完成业务准备、在实际入住前补齐实名和同意。

## 留存和主体权利

- 四类对象分别配置：submission、不可变 snapshot、identity photo、protected audit。
- 默认 730/1825 天只是占位值；新 scope 的策略状态为 `pending_legal_review`。法务未批准前不得运行历史分类。
- `classify-legacy` 依据对象实际创建时间计算到期日，不推断未知时间。
- `execute-due` 按 tenant/park 加锁并幂等执行。有效 legal hold 会将对象标为 held；不可变或被引用证据不做物理删除，实际结果记录为 `processing_restricted`。
- 数据主体删除或限制请求必须经历 submitted → approved/rejected → completed。当前基础能力将获批请求完成为 `processing_restricted`，不得报告未实际发生的物理删除。
- legal hold 的创建和释放都要求 reason code、真实操作人、幂等键和 required audit。

## 运行顺序与安全边界

1. 执行 forward-only migration `000287_party_consent_retention_rights_foundation.sql`。
2. 核对 legacy fact 数量、`legacy_unknown` 字段空值语义及 pending retention assignment。
3. 由法务/数据合规负责人逐 tenant/park 审批具体留存期限和动作后，再更新策略并运行 `classify-legacy`。
4. 到期执行、主体权利和 legal hold 只能由对应独立权限触发；这些权限不授予敏感明文 reveal 或文件下载。

审计和报告只保留 ID、状态、类别、结果与计数，不写入证件明文、密文、哈希、密钥或自由文本敏感叙述。F04 明文 reveal 审计与 F05 住房入住门槛已由后续独立变更闭环；住宿业专项 P0-02/03/04 仍不在本基础内。
