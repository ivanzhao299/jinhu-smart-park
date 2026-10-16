# Web实施设计

基线bb490388e80378a6f08cbf427c64e68a6bfaf08a，工作区父C未提交shared/API/372归后端writer。已释放的Web起步文件需保留接续，不能撤销：PerformanceChannelWorkflowPolicyEditor、hr-api类型/adapters、definition editor双CAS/published解析、PerformanceTemplates政策入口。其未typecheck/交互验收。

接口冻结以父C research/api-web-contract.md和实际DTO/service/共享类型为准，不从前端发明路由或响应。需要workflow history/correction options/input preview等缺件先与后端writer协调，仅其写API/shared。

复用HrPerformanceClient现有captured attempt/token/key/统一锁/identity/generation机制。可独立子组件封装五渠道输入与历史，正常表单保留准确字符串与明确NULL操作；显示服务端政策和可操作字段，禁止通过猜身份扩大scope。完整数组可分页，保存仅allowed字段变更，并引用expectedRevisionId。接受与校验回执后清理attempt再refresh，已提交但读失败保留成功提示，不重新写。

模板政策与定义分别修订、双CAS保证一致；历史读分页可用且不受可编辑字段禁用影响。新版本政策不从字母推断，首个业务可用政策必须由授权操作者明确填写。Grade完整500字说明等放可达详情，分数任意合法范围不套旧0..100，不用Number处理准确值。

父C完整阶段规则保持：阶段草稿可未填，阶段提交须当前阶段所有算分字段明确提供，required=false不是隐式NULL；后续字段尚未填时总分NULL，最终完整唯一等级。校准partial逐项回执和原请求重放生命周期可解释；申诉与纠正必须现有合法关系/选定目标。所有金额/输入revision历史JSON投影需先解码已授权shape，不将mask字段恢复。

所有权：Web writer仅apps/web绩效页面、hr-api、对应interaction/Web spec；后端writer独占shared/API/372/PG/API spec；root独占task metadata/私有发布证据/最终原生QA。不得改auth/provider/dependency/globalCSS/workflow、不commit/push/deploy。

员工prefinal不得通过preview泄露完整主管/校准结果。该场景preview:null；界面按缺省投影处理，不伪造未提供、0或complete=false；独立预览不开放超出同等结果可见性的路径。后台已收到同步变更，发布前需实际HTTP和组件反例。
