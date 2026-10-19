# 旧GroupWeb 36项实际缺口校准

代码基线：9e96fc106219ca2e849b7c0bb9ca43d866d3de53。本表只校准原mapped_only集合，不是完整HR功能分母，也不是整体完成率。

结论：7项是目录分组，2项已有正式实现，6项存在相关能力但不能视为原功能复现，21项业务闭环仍未证实。未知项保留，不能据此缩小完整复现范围。

| 原ID | 原功能 | 当前分类 | 证据及边界 |
|---|---|---|---|
| 240 | 事务管理 | 目录分组 | 旧入口为空的目录分组，不计为独立缺失CRUD。  |
| 184 | 建议管理 | 已有正式实现，待业务验收 | 已有持久化建议投诉办理；原规则等价和真实本人/HR操作未验收，旧/workflow映射已过时。 `apps/web/app/hr/employee-feedback/page.tsx:1`；`apps/api/src/modules/hr/hr-employee-feedback.controller.ts:12`；`apps/api/src/modules/hr/hr-employee-feedback.service.ts:17` |
| 185 | 投诉管理 | 已有正式实现，待业务验收 | 已有持久化建议投诉办理；原规则等价和真实本人/HR操作未验收，旧/workflow映射已过时。 `apps/web/app/hr/employee-feedback/page.tsx:1`；`apps/api/src/modules/hr/hr-employee-feedback.controller.ts:12`；`apps/api/src/modules/hr/hr-employee-feedback.service.ts:17` |
| 119 | 信息发布 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 120 | 论坛管理 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 3 | 文档管理 | 有相关能力，未证明等价 | 附件中心有HR文件权限与上传读取，不证明制度目录、发布、版本或阅读权限已复现。 `apps/api/src/modules/files/files.controller.ts:50`；`apps/api/src/modules/files/files.controller.ts:42` |
| 252 | 活动安排 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 253 | 行政接待 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 257 | 图书管理 | 目录分组 | 旧入口为空的目录分组，不计为独立缺失CRUD。  |
| 254 | 图书信息 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 256 | 图书借还 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 244 | 会议管理 | 目录分组 | 旧入口为空的目录分组，不计为独立缺失CRUD。  |
| 241 | 会议室 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 242 | 会议安排 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 295 | 办公用品 | 目录分组 | 旧入口为空的目录分组，不计为独立缺失CRUD。  |
| 296 | 物品入库 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 297 | 物品出库 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 298 | 库存查询 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 299 | 物品清单 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 302 | 车辆管理 | 目录分组 | 旧入口为空的目录分组，不计为独立缺失CRUD。  |
| 303 | 驾驶员 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 304 | 车辆登记 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 305 | 日常费用 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 306 | 车辆杂费 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 307 | 车辆维修 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 308 | 用油登记 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 309 | 车辆保险 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 310 | 车辆申请 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。 `apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 311 | 通讯录 | 有相关能力，未证明等价 | 员工名录不是公共通讯录；外部联系人、目录及维护规则仍未知。 `apps/api/src/modules/hr/hr.controller.ts:19` |
| 174 | 流程定义 | 有相关能力，未证明等价 | 已有固定HR审批与工单消息，不证明存在可配置流程定义设计器。 `apps/api/src/modules/hr/hr.controller.ts:110`；`apps/api/src/modules/hr/hr.controller.ts:119`；`apps/api/src/modules/workflow/workflow.controller.ts:14`；`apps/api/src/modules/workflow/workflow.controller.ts:18` |
| 117 | 个人办公 | 目录分组 | 旧入口为空的目录分组，不计为独立缺失CRUD。  |
| 125 | 个人信息 | 目录分组 | 旧入口为空的目录分组，不计为独立缺失CRUD。 另有本人档案投影，不能将此分组视为本人资料缺失。 `apps/web/app/hr/employees/HrEmployeesClient.tsx:100`；`apps/api/src/modules/hr/hr.controller.ts:21`；`apps/api/src/modules/hr/hr.service.ts:261` |
| 149 | 我的监控 | 有相关能力，未证明等价 | 已有本人申请及办理轨迹；尚未证明等价于旧Con_vMonitorList监控语义。 `apps/api/src/modules/hr/hr.controller.ts:110`；`apps/api/src/modules/hr/hr.controller.ts:119` |
| 259 | 内部论坛 | 实际闭环未证实 | 仅确认旧入口/资源名。未证实当前有同等业务闭环；不得由目标通用入口推断已实现，也不得仅凭本次未找到推断全局不存在。  |
| 300 | 日程安排 | 有相关能力，未证明等价 | 组织考勤工作日历不是个人日程，提醒、共享、重复规则等旧行为仍未知。 `apps/api/src/modules/hr/hr-attendance-work-calendar.controller.ts:12` |
| 301 | 通讯录 | 有相关能力，未证明等价 | 员工名录不是个人通讯录；私人联系人、分组和共享规则仍未知。 `apps/api/src/modules/hr/hr.controller.ts:19` |

## 下一工作包选择

优先收口核心“批准申请→正式档案/任职→员工本人回读”流程，不先开发行政车辆、论坛或个人日程来提高目录分数。理由：它直接验证历史数据成为可持续维护的正式数据，以及用户已经明确的不同岗位正常操作目标。工资并行保留2026年7月两账套全量只算不发，不重复询问月份、负责人、范围。

下一步先用当前API、页面和真实隔离数据库验证批准申请关联正式办理、仅修改提交字段、状态生效与本人回读；核查已有测试是否已覆盖这些组合。已有完整证据则复用，缺少关键环节才实施，不写镜像测试、不重复全量测试。生产真实岗位无会话时仅该验收保留待办，开发不等待。

必须保留的最终要求：Windows与GroupWeb原规则和报表分别验收；真实HR/部门/本人角色；真实工资金额核对；后续增量导入保护现代修改；恢复与模块切换演练；独立HR产品验收。

本次未取得原ASP源码位置，只有原入口/表视图名及既有源审计契约。未重新提取备份或运行历史A/B，也未将未知旧行为推定为新需求。
