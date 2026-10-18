# 部门复核审批工作台与实际页面连续性

## 目标
让已有部门复核权限的负责人从现代工作台进入审批，并读取后端已授权的本部门待审；页面许可撤销时不挂载读取业务组件。不授予账号权限、不修改后端范围、不改变审批流。

## 已验证基线
main e5f7bc789b38ba6bf6319f7b5283d48598fd9d4d，独立代码副本。当前生产恢复发布39090915888仍由root跟踪，禁止本任务提前发布或改其冻结副本。可复用research/prior-bounded-audit.json定位，但改动前核实精确代码及权限字面量。
HR_APPROVAL_REVIEW和HR_APPROVAL_PARK_REVIEW都是hr:approval:park_review：园区HR已有待审批，不能误报或误改；真正遗漏HR_APPROVAL_TEAM_REVIEW=hr:approval:team_review。pending后端允许park或team，me允许selfmanage。

## 范围
仅HrWorkbench.tsx、HrApprovalsClient.tsx、现有workbench/approval聚焦交互及必要路由合同、两份相关前端spec。保留既有park/HR优先待审核及selfmanage-only本人申请语义，避免虚构跨范围求和或全量统计。新核实：hr.service.pendingApprovals只返回status=submitted，projectHrApproval保留status；原工作台过滤pending会显示假零，必须改为submitted。本人进行中按draft/submitted计数，不扩大到其他状态或新增指标。本人/团队混合角色遵循现有review优先，不新增第二套审批指标。任务元数据由root维护。

## 验收
- 页面许可+TEAM_REVIEW-only工作台可进入人事审批，并调用已有pending而非me。
- PARK_REVIEW及兼容REVIEW别名行为不退化；SELF_MANAGE-only继续已有me；mixed self/team走pending，工作汇报新双范围不退化。
- 工作台相关审批读取/入口必须有审批页面许可，无页面许可不发审批读取。
- 实际审批页外层guard在业务hooks挂载前，HR模块/页面拒绝或撤销时可见fallback且零新读取；现有身份范围key和过期请求保护保留。
- 当前审批办理、原请求重试/版本冲突/回执/历史逻辑保持，no account/API/grant/DDL变动。
- 聚焦交互、相关路由合同、Web lint/typecheck；真实组件桌面和390px校验由root负责。合成验证不替代生产真人岗位。
- 不重跑历史导入，不计算/支付工资，仍保留全量7月吴恩国验收。

- 新取证状态回归：团队及园区用真实submitted待审计数非零；本人draft/submitted正确，混合角色仍review优先。
