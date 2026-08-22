# 技术设计
- 新建下一可用编号的 forward migration；先核对重复 000136 历史及最新 main 编号。
- preflight 输出具体表、父子 ID、tenant/park，不包含秘密；发现异常直接抛错。
- 父表复合 unique → drop 明确旧 FK → add NOT VALID 复合 FK → validate。
- 更新 Track-B required migration/constraint 集合和 PG regression；migration 不承担 seed 职责。
- 已应用后只能用新 forward fix 回滚语义，不能编辑旧迁移。
