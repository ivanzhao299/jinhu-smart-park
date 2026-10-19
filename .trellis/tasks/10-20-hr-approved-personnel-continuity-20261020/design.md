# 设计

继续使用现有/hr/approvals、profile-fulfillment、job-change-applications/from-approval、actions/review/apply及现有profile/employee/history接口和页面，不增加平行审批系统或writer。先完整读取精确关联实现、DTO、权限scope和既有PG/交互测试，所有期望从当前业务契约导出。

在现有hr-enterprise-runtime及业务helpers中增加可聚焦的approved-personnel场景，沿用owned loopback/marker/文件目录/合成配置约束。两种运行模式各使用新资源，角色和员工绑定是真实持久化并正常密码登录；只用bootstrap管理员做fixture准备，业务阶段用最小明确角色。集成fixture不能借用integratedOperatorFactory的全权限结果冒充岗位验证。构造本部门树和外部门反例；转岗后可见性按当前scope契约，不编造旧经理持续读取政策。

档案申请描述仅是申请内容，不映射成正式字段；HR明确选定并提交字段，expectedApprovalVersion+profile expectedVersion绑定源和目标。履行使用patch语义，正常PUT原契约保持。

任职源固定员工/版本，建草稿只形成关联。用专用状态机完成审核/apply，验证exact application_id读、正式任职、employment event及历史单据；保留原幂等请求与回执。事件/应用编号不可串用；提交者与审核者按现有规则分离，不改变maker/checker来适应测试。

通过实际现代应用页面连接新隔离API检查交互，优先复用已有启动、fixture和共享组件。不以mock截图代替新HTTP链。显式合成env/独立空cwd避免读取真实.env和外部通知；所有临时文件0700/0600，按exact ownership清理，只保留脱敏截图/计数/结果/哈希。浏览器操作仅CUA；生产真实账号验收单独待办。

无已知数据库迁移需要，禁止预先添加迁移或扩展权限。如实际缺口需要改变业务契约，先依据代码/规格明确原因并修订设计；不猜源端新规则。
