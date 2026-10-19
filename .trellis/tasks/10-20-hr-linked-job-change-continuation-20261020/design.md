# Design

复用GET /hr/job-change-applications分页服务，在HrJobChangeListDto新增可选UUID定位筛选（建议application_id），与现有范围谓词AND组合；不添加绕过现有范围的裸detail读取。对应Web hrApi分页调用附加可选筛选参数，保留旧参数兼容性。

批准任职面板两处链接使用真实jobChange.id/receipt.id，URL建议/hr/lifecycle?job_change_id=<uuid>#job-change-applications。Server page校验定位参数（包括重复值）并传给HrLifecycleClient及JobChangeApplicationsPanel。不要借用employee_id离职筛选假装单据定位。参数不存在仍是完整台账；显式非法值显示明确参数错误，不默默退回全部。

目标列表仅呈现目标单据，在同一现有组件内办理，提供返回全部台账入口。取消旧读取并按目标和完整身份重置写草稿/待重试/确认缓存，不能把旧confirmed Map内容塞进新目标。读取错误可独立重试，不抹掉确认写成功的事实。保留API强制scope及审计，不增加管理权限。

无数据库结构变更、无迁移、无规则/金额/审批状态变更。回滚代码即可，已有URL可被旧页忽略但不执行任何写。目标参数只在本版本被校验收窄。
