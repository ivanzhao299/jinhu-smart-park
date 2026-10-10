# 退回人事申请修改与完整审批轨迹

## 业务目标
补齐本人草稿/退回申请修改、查看退回意见、重新提交和全流程轨迹，保持原审批记录连续，不重新导入历史或制造工资/任职自动生效规则。

## 验收
1. 本人且SELF_MANAGE可修改draft/returned申请标题和说明；requestType、主体、申请人和状态不可由修改接口变更。submitted/approved/withdrawn不可修改。
2. POST /hr/approvals/:id/revisions，DTO expectedVersion整数>=1，title去首尾空白且非空<=200，description非空<=3000，reason非空<=1000。使用已有AuditableEntity.version，不新增平行版本列。锁定当前作用域行，核对申请人与expectedVersion，更新title及payload.description，保留payload其他字段。
3. 同一事务追加edit动作，记录beforeContent/afterContent（title、description、version），comment记录修改原因；失败整笔回滚；并发同版本只有一个成功。只新增forward migration 000353扩充动作约束和两个可空JSONB快照列，保留既有历史。
4. 写路由SELF_MANAGE、IdempotencyInterceptor及captureBody:false审计；服务层也验证权限和本人，不依赖UI。审批投影返回现有version。
5. GET /hr/approvals/:id/history，允许本人SELF_MANAGE或PARK/TEAM_REVIEW范围内记录；团队同时约束申请人和主体，审阅者不可读未提交draft。无权限/外园区/外租户/外团队不泄漏存在性。读取动作时仍核对父申请，按createTime+id稳定排序完整返回，并完成敏感读取审计。
6. history返回{request,actions}，actions只投影id/action/comment/beforeStatus/afterStatus/createTime/actorDisplayName/beforeContent/afterContent。名称如无可见关联用null，不伪造历史身份，不返回凭据或原始其他员工字段。新增编辑快照只含标题说明版本；既有动作快照null照实展示。
7. Web本人记录和待审记录均可展开办理记录。本人draft/returned可修改，显示退回意见和前后内容；受控表单失败保留，未知结果原body/key重试，同步互斥，上下文/晚响应不串资料。成功更新父列表，失败回读不得抹去成功；编辑与父级提交/审核不得并发。
8. 实测服务/DTO/权限/并发/回滚，真实隔离PG升级、旧动作保留和新约束；Web交互测试及桌面390px。生产只发布正式功能，不写生产测试申请或自动改动任职/档案/工资。

## 依赖与边界
PR924正在CI/发布，当前main d9223ab8d。开发可并行，整合及生产发布必须等待其实际运行核验并基于最新main。最终岗位验收与完整玉舟业务对等仍单独保留。
