# 合同三类协议标记的现代承载

原compact.bmxy、compact.jyxzxy、compact.pxfwxy已由T2映射写入000238的confidentiality_agreement、non_compete_agreement、training_service_agreement。此次补已有列的Entity、DTO、API详情/动作快照及现代草稿页面，不新增迁移、不重放历史数据。

来源flag明确接受true/1/字符串1/是及false/0/字符串0/否；其余值在原导入投影报T2_LEGACY_FLAG_UNRESOLVED，不默认为false。页面称协议标记，不将它当作法律签署、附件原件或签署日期证据。

现代输入只接受boolean或省略。null、字符串及数字均拒绝；省略的更新保留原标记，显式false可清除现代标记。新建沿用现有数据库false默认。历史合同不开放编辑，本人简化投影继续省略三字段；其他组织范围和薪资权限沿用现有合同访问链。详情只展示API实际返回字段，不把属性缺失显示为false。

页面复用ds-panel、ds-mobile-record和checkbox-row；合同局部CSS仅限制checkbox尺寸，防止HR通用全宽输入规则把标签挤成竖排。1280和390合成浏览器检查分别scroll1275/385，无横向溢出；真实岗位验收另行记录。

验证：API协议DTO/实体/省略语义3项，加合同前序4项；实际服务PG覆盖保存读回、无关编辑保留、明确false、历史不变以及已有合同状态/并发/回滚场景；Web三标记4项及合同汇总6项。类型、lint、API/Web生产构建通过。PG使用本地随机entity-synchronized schema并清理，不证明完整生产迁移触发器或真实HR验收。精确重绑受影响文件及依赖manifest，契约状态/兼容计分不提升。

发布完成另需CI、合并/运行版本、健康和Docker清理证据；合同累计期限及签订历史维护不由三标记替代。
