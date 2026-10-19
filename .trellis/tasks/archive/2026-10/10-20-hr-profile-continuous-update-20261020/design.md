# 设计与边界

从现有通用增量入口扩展已规范化profile字段，复用正式DTO和列定义，先读完整service/DTO/entity/producer/baseline/permissions/tests，消除重复字段列表漂移。保持v1 marker-free包的canonical digest/replay兼容；若确需版本变化必须先回报原因，禁止静默破坏旧包。

33字段含证件类型/加密号码、日期、数值、联系方式和remark。验证需覆盖JSON原始类型、长度、真实日期、金额无关数值范围和数据库numeric读取规范化；不要用宽松Number转换吞掉非法类型。证件type与号码fingerprint兼容、空值、脱敏及权限需完整核查。未知字段拒绝，列名只来自白名单。

原T5 witness/immutable certificate范围不扩大；普通dbo.profile新来源与已认证原core_residue分别处理。已接受原基线中不存在的字段不得自动赋基线。实际原ASP字段映射不明时保留pending，不能编造映射换取33/33旧源覆盖。

复用preview/commit权限、scope、三方比较、来源加密事实和CAS，不另造writer。接口描述从既有recipe生成并同步必要文档；冻结prepared fingerprints不能动态放开，应独立回归现有兼容性。

独立loopback数据库与合成数据，明确所有权和清理，不接触15432/32882/32883或其他任务容器。不读取真实.env/凭据，不产生外部通知。生产部署和真实岗位验收在本地实现/独立审核之后分别记录。
