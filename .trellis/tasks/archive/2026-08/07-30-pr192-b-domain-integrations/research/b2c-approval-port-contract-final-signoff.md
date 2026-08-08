# B-2c approval port contract 最终签署

日期：2026-08-02  
状态：PASS / CONTRACT RE-FROZEN AFTER APPROVED CHANGE  
Owner：B-contract/shared-contract owner  
独立复审：QA GO；`P0/P1/P2=0`。

## 唯一合同

- Candidate：`b2c-approval-port-contract-candidate-20260802.md`
- bytes：`32939`
- `B2c approval port contract SHA`：
  `5ceaf6db80628e83a21bef12c25ed39aac952857b35e1f37f2b8522ef53a4a55`
- Approved change request SHA：
  `f91ad906733bab1808c8e48f044edb4e5dab6b44485f3e2f3536d08039ab1f35`

## 复审闭合

- 精确冻结 command/projection token、方法、字段、空值、scope/cardinality 与 legacy
  compatibility。
- Caller-owned transaction 不允许 nested transaction；唯一冲突采用受控 savepoint 与
  无目标 `ON CONFLICT DO NOTHING`，恢复后 caller transaction 必须仍可使用。
- Receipt 固定 actor/submitter、`legacy-v1`、request/result 双 hash grammar 与 replay
  双校验。
- Legacy draft 经 business intent 补提时，receipt key 固定为权威 request 已持久化
  `clientIdempotencyKey`；alternate incoming key 只用于定位/冲突，不写 request/receipt。
- Canonical payload 使用闭合 JsonValue 和递归手工 serializer；object key 按 unsigned
  UTF-8 bytes 排序，integer-index key 无特殊处理。
- 金额固定两位小数并按 cents 比较；所有非空版本限制在 `1..2147483647`。
- UTF-8 边界、九个 terminal 组合、非法组合、未知约束与冲突优先级 goldens 已冻结。

## 放行边界

本签署只释放 shared-contract owner 与 approval-runtime owner 实现并独立验证端口；不释放
000191/000192、property-foundation adapter、homestay/housing domain adapters、AppModule
wiring 或任何生产开关。Shared source 和 runtime 新 SHA 均须在实现 Gate 后另行发布。
