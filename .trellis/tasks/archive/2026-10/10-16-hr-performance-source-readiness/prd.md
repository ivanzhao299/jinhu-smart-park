# 正式绩效承接生产预检

## 目标与边界
为父任务完整正式承接取得当前生产计数和摘要，选择后续有业务影响的数据。只读预检不是正式数据承接完成；父任务全部读写/页面/幂等/增量验收保持。原导入及000309/310信用不改变。

## 需求
1. 固定tenant10000001/park20000001，同一REPEATABLE READ READ ONLY事务，statement_timeout5s、lock_timeout2s，固定SQL，不接受用户SQL或调用源builder/计算/可能FOR SHARE的校验函数。
2. 统计六种源事实的scope原始数和当前服务可见数；exact map进一步核对source_table、identity/row hash、batch/target/verified/active。分别统计308成功关系回执、310成功事实回执、309成功person-assessment operation；不把任一计数说成完整sourceQualified。
3. master统计000309 resolution缺失/两路resolved/两路matched交集，subject身份解析到当前scope未删除employee，既有正式review/version链接。严禁JOIN fanout。记录正式five_channel定义/输入数量辅助区分已有正式承接。
4. 输出仅严格固定键的非负安全整数及确定性scopedSourceFactsSha256；哈希是原始六表id/batch/map/identity/rowHash排序摘要，不是完整数学manifest证明。状态固定formalContinuationReadiness=UNVERIFIED、productionBusinessWrites=0；不输出人名/人员代码/分值/金额/逐人行。
5. 沿现有runtime-revision诊断模式增加默认false显式开关及成功artifact；不用新部署模式，不部署/迁移/seed/导入/算薪。SSH stdin自包含模块，固定错误码，绝不打印原始DB/SSH错误或用0代替失败。

## 验收
- 合同验证shape/cross-count约束、hash、失败闭合、scope和workflow默认false/ops-only。
- 必需实际owned PostgreSQL完整SQL投影夹具：空、有源、回执失败/回退、map错hash/外scope、resolution缺失/歧义/不匹配、员工失效、重复关联防fanout、正式链接、摘要稳定/变化。说明只是查询投影，不冒充全schema业务guard验收。
- 自有tmpfs PG实例清理且确认无残留；Node syntax/git diff check；文档/spec同步。
- root独立review后从功能分支运行一次只读生产诊断，绑定observer code和API/Web9ed运行证明，确认Deploy skipped。实际计数用于父设计下一步，不生成任何正式业务数据。

## 授权
用户已批准长任务继续实施与只读生产取证；不重复请求登录/范围/批准。生产仅root一个执行者。
