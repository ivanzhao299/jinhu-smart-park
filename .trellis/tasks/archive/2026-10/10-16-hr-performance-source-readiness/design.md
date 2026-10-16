# 设计

基线main9ed1e4b8/工作树a1bfe8ce，复用diagnose-hr-payroll-readiness.mjs的自包含transport、严格parse和readonly事务形状，不修改其旧统计。

## SQL与输出
用六表UNION ALL统一kind/id/batch/map/identity/rowHash，原始固定scope计数；可见集合完全沿hr-performance-legacy.service.visibilitySql；exact map状态独立统计。receipt与resolution先按batch/master聚合或EXISTS，绝不直接乘法JOIN。309两路resolved且comparison_status=matched为一个证据交集，不能据此宣布所有来源资格成立。310receipt必须succeeded及无rollback，scope/batch/hash绑定按实际列；308/309不同层不能混为一个成功。subject employee关联沿当前resultSubjectIdentityJoin的确切T0身份条件，仅观察不调用锁写helper。

scopedSourceFactsSha256对原始六表(kind,id,batch,map,identity,rowHash)排序JSON数组digest sha256，空集合有确定性digest，外scope不影响；不含个人值/金额，不代替完整父manifest。只返回固定非负safe-int键与64hex hash和固定UNVERIFIED/无业务写标记。具体count键/子集不等式实现前在research/output-contract.md记录，必须覆盖所有分母及missing分区且禁止重复key/unknownkey。

## 生产通道
在.github/workflows/deploy-production.yml添加diagnose_performance_source_readiness:boolean defaultfalse，仅runtime-revision mode调用/上传新observer；其他部署路径不变。固定错误白名单。沿既有Docker compose+psql只读运行，不引入依赖/env/角色/权限。

## 兼容与风险
只添加可选诊断；不改API/shared/数据库/mode分类/导入资格/已应用迁移。schema不匹配、超时、形状或计数矛盾均固定错误失败，不能写零。生产事实数量不由fixture推断，完整正式承接另待父写路径/页面验收。
