# 精确上下文与所有权

工作树：/Users/mac/.codex/worktrees/hr-payroll-monthly-ingress-20261020/jinhu-smart-park；分支codex/hr-employee-date-reminders-20261020，基线24c4783099201100a049a2fe0acbb9c9ea46ac65。不是主checkout，不访问其dirty配置。

已证实：`dto/hr-contract-reminder.dto.ts`仅两个合同日期kind；`hr-contract-reminder.service.ts`绑定合同FK、合同policy、独立outbox及scope；不能往其中塞生日。`HrContractsClient.tsx`同样仅两个kind。`hr.dto.ts`已维护dateOfBirth；`hr.entities.ts`员工已有hireDate；profile列date_of_birth以正常service/迁移复核为准。

旧功能精确定位：GroupWeb mapping的legacyId=181，name=提醒设置，legacyUrl=configure/awoke/browse.asp，原表Con_tAwoke/视图Con_vAwoke，当前仅指向/hr/contracts。客户端原子ID=client.permission_log_reminder.004，观察仍pending；不能因本包补齐两个日期种类便宣称两端全部提醒规则等价。父母生日、证照等其他通用提醒仍保留后续范围；本包的新页面只作为181的新增现代承载证据，不改旧运行观察状态或刷整体完成率。

实施者需自行完整读取实际将改动的代码，尤其hr-access-policy、hr-notification.service、hr-contract-reminder的事务和状态、workflow消息入口/跳转规则、shared/hr权限及生产seed。代码不作为jsonl注入以免长行截断。

适用spec精确读取：
- `.trellis/spec/api/backend/hr-management.md`中的employee-to-payroll通用HR合同、sensitive read projection、date preservation与employee scope相关完整场景；不要把1500行工资/保险/绩效无关场景全部重复注入。
- `.trellis/spec/api/backend/index.md`的Module Shape、Scope/Permissions/Audit、Migrations And Seeds及Verification；按目录搜索定位完整相关段。
- `.trellis/spec/web/frontend/index.md`的Route And Client、API Calls And Idempotency、Stateful Business Action Entries、Permissions And Modules、Design System、Constrained Inputs、Verification。
- shared/backend/index.md全部；guides中的cross-layer边界和code-reuse；project-operations的迁移/生产seed/发布清理合同。索引较长时定向读取完整相关小节，不能把截断输出当完整规则。

产品文件全部归本包实施者（API/shared/Web、新迁移、必要seed/menu、相关测试）；root仅改本任务文档和受控证据。实施者不是唯一工作者，不回退他人改动。root是唯一DB/runtime/production writer。不能运行Docker或PG测试、不能重置已有HR库，不能查看私有真实工资、密码/会话配置；测试用合成fixture并交root执行DB路径。无DB focused tests/lint/typecheck可执行；不提交/推送/部署，不再派其他代理。

既有生产部署39352727491与只读观察39355045483成功，API/Web均基线SHA，7月93/64/2295完整。主CI39352727556仍由root跟踪，不重复启动。工资及真实岗位验收未完成；本包不触碰工资源或猜填历史日期。
