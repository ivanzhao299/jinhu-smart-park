# HR T6 技术设计

## Evolution Strategy

保留当前 HrModule 与 000231/000232 表作为兼容基础，使用新前向迁移增加版本、动作、模板和人才域表。旧行通过兼容投影继续读取；新写路径只写受控状态机。不得修改成功迁移，也不得以一次大迁移重建既有表。

## Service Boundaries

- `HrGoalExecutionService`：周期、目标版本、分解、进度与聚合。
- `HrWorkReportService`：周期口径、草稿/提交/审核动作、目标建议。
- `HrPerformanceReviewService`：模板、计划快照、自评/主管评/校准/签收/申诉。
- `HrFeedback360Service`：胜任力模型、问卷快照、提名、响应和匿名聚合。
- `HrTalentManagementService`：画像、盘点会、九宫格、继任与发展计划。

Controller 只负责 DTO、用户/园区上下文、精确权限、幂等和 body-free audit；范围解析、事务、锁、状态、投影和消息都在 Service。

## Database Shape

建议分片新增：目标/汇报动作与版本；绩效模板、维度、动作、校准和申诉；胜任力模型、360 问卷/提名/响应聚合；人才盘点、九宫格、继任、发展计划。

所有业务表含 tenant/park，复合 scoped FK 与完整非 partial 子 FK 索引；版本/动作/响应/盘点决议 append-only；终态触发器阻止 update/delete。在线表使用 numeric/decimal 明确精度，禁止 float 参与评分或权重守恒。

## Transactions And Concurrency

- 目标分解锁周期、父目标和负责人；父子权重与日期在同事务复核。
- 汇报 submit/review 锁 report，动作与 Workflow Inbox 同事务；目标进度建议只追加，不在同动作隐式改目标。
- 绩效每个阶段锁 plan；评分动作、状态、消息和校准证据同事务。最终分数从冻结项服务端计算。
- 360 提交锁 assignment；数据库唯一键保证一次响应。匿名发布锁 cycle/subject aggregate，阈值不足不生成可读结果。
- 人才盘点锁 session/subject；九宫格决议与继任/发展引用使用精确来源版本。

## Scope And Projections

统一 `park | managed_org_tree | self | none` 范围解析，所有查询固定 tenant/park，客户端 employee/org 参数只缩小。每个角色使用字段 allowlist；禁止返回 TypeORM entity、tenant/park、actor、raw response、reviewer identity、内部 hash/version/soft-delete。敏感列表与详情在 return 前 required audit。

## Compatibility

旧 goal/report/performance/feedback 行标记兼容来源并通过新 projection 读取；没有动作历史的旧终态生成只读 baseline evidence，不伪造操作者。迁移前后记录数、关键字段与 hash 必须守恒。旧应用可容忍新增表/列；发布失败时回滚应用 SHA，不逆转成功前向迁移。

## Web Architecture

- `/hr/goals`：目标树、我的进度、风险与管理抽屉。
- `/hr/work-reports`：我的草稿/待提交、团队待审与历史。
- `/hr/performance`：员工自评/签收、主管评价、HR 周期/校准。
- `/hr/feedback-360`：我的评价任务、模型/周期管理、匿名结果。
- 新 `/hr/talent`：盘点、九宫格、继任与发展计划。

共享 DS 表面类优先；手机端只承载高频本人/主管动作，配置、批量校准、九宫格和继任矩阵限定桌面。

## Release Gates

每片开始前 fetch/全分支迁移扫描；实现后独立 Trellis check。数据库要求 template0 fresh、旧 000231/232 upgrade、replay、seed replay、双连接并发和终态不可变。发布要求候选/主线/生产三 SHA 一致、CI/Release Smoke、health/ready、受保护账号、桌面/390px 和 Docker cleanup。
