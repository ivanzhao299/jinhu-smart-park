# 合同提醒上海业务日期

基线f0af8abb，生成器使用数据库会话current_date，与合同连续性检查的上海业务日期不一致。实际生成服务在Etc/GMT+12会话中只生成1条，应生成2条，已取得修复前失败证据。现仅将窗口截止表达式改为timezone('Asia/Shanghai',now())::date。

隔离回环PostgreSQL随机schema执行原000238/000244/000272/000277合同迁移及审计触发器。生成器额外依赖原基线pgcrypto；若缺失，将真实扩展置于本次拥有的schema，最后DROP SCHEMA CASCADE移除，不替换digest实现。既有public扩展保留，其他schema的扩展明确拒绝；清理后直接比较原pgcrypto的OID、namespace、version，证明原扩展未被替换及本次扩展无残留。用户及角色为最小合成依赖，不计为完整数据库迁移或真实权限验收。

实际生成器在UTC、Etc/GMT+12和Pacific/Kiritimati事务会话执行：昨日/今日窗口产生两条，明日不产生，重复运行新增0，同范围outbox2条。使用精确run权限，缺权限拒绝、异园区生成0。每次回滚事务，验证范围内提醒和outbox均为0，最终schema清理。修复后初次14项PG通过，0失败/0跳过；审查新增权限/扩展清理断言后需由主会话运行最终PG。失败准备阶段分别为缺真实pgcrypto和测试保留字别名，修正后才取得有效业务失败证据。

独立审查通过；审查后最终14项PG全部通过，包含精确RUN权限、缺权限拒绝、异园区0、scoped outbox回滚0及pgcrypto原始OID/namespace/version恢复。API typecheck、聚焦lint、构建通过；审查后的typecheck/lint和5项提醒静态/查询检查通过。应用表达式审查后未再修改，因此复用该构建。没有Web、DDL、策略、权限或生产通知动作，不执行生产生成器，不修改历史导入数据。该技术证据不证明生产岗位使用、通知送达或原玉舟完整提醒规则等价。
