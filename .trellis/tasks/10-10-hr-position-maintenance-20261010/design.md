# Design

新HrPositionMaintenanceController/Service复用HR_POSITION_MANAGE、DataScopeService(org)、AuditService.recordOperationRequired、IdempotencyInterceptor和lockOrgHierarchy。GET positions/:id/maintenance读取版本及15业务字段和本范围组织/上级选项；PATCH positions/:id只允许DTO字段，先角色/租户园区、再目标组织范围、事务层级锁与目标FOR UPDATE、expectedVersion、同范围依赖、完整合并状态、CAS保存和审计。新旧岗位不区分；既有只读positions保持兼容。

关键并发调查：普通员工创建的校验目前在全局repository，不能仅凭新岗位端点FOR UPDATE加引用先查宣称覆盖全部并发；调岗assertTarget已有FOR SHARE，但创建/其他写者仍需覆盖。正式组织迁移/停用发布前，须补统一数据库关系防线并在真实PG双连接验证；现有历史行只保留，不回填/重写。是否允许停用有在职人员岗位应按引用规则明示，不能猜测。

前端独立编辑组件用新上下文，不依赖directoryOptions（其含users且属于员工管理），使用既有useHrResource/DS。字段上下文有版本且来源无差别。新增表单亦补全部业务字段和正确max。代码保持一个候选，API、数据库、页面未齐不得合并发布。

Implementation decision: additive migration000352 uses employee position FOR SHARE plus position structural-reference triggers; no history rewrite. New assignment and structural edit transactions serialize on the position row. Structural edits under fixed snapshots fail40001, avoiding stale snapshots after waiting. Departed history can retain inactive positions; rehire validates active same-org assignment. Existing unchanged historical relationships remain editable for unrelated fields. The real PostgreSQL fixture has verified both lock orders, CAS, required audit rollback and historical preservation. The complete fresh-schema release check and modern page are still pending.
