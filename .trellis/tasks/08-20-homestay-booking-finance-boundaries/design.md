# 技术设计

在 domain policy 中集中定义允许状态，普通登记和审批 effect 双重校验。`checked_out` 仅允许对既有余额收款；新增退房后费用在当前 DTO 尚无可验证业务来源时 fail-closed，待显式来源合同落地后再开放。候选至少输入两个字符并保持分页上限；住客新增在 booking 行锁事务内计数。现有更严格身份/审批规则保持下限。

兼容现有 API/DTO 时优先增量修复；任何 schema 变化使用新 forward-only migration。失败可按子任务 PR 独立 revert，已应用 migration 只做 forward fix。
