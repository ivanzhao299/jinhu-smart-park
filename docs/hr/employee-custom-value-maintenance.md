# 员工扩展档案正式维护

当前候选新增 migration 000332、普通员工扩展字段读写 API 和员工详情编辑器。已完成本地合成页面1440/390px验收，尚未合并和部署，不能视作生产已可编辑。

原始 hr_employee_custom_value 和原回执保持不变。当前维护值按 tenant/park/employee/definition 唯一，value_encrypted 使用现有 Party 敏感数据加密。维护值存在时优先投影；显式 null 表示清空，不回落来源；原值类型无效可更正。变更记录追加、不可更新或删除。

GET /api/v1/hr/employees/:id/custom-fields 返回当前员工启用定义及有效值、definitionId、version。即使员工没有基础档案行，仍能取得扩展档案。读取要求正常档案管理权限、同园区员工并完成敏感读取审计。完整 profile 也带相同字段；脱敏 profile 不携带扩展私密值。

PUT /api/v1/hr/employees/:id/custom-fields/:definitionId 接收 expectedVersion 和 value。首次维护 version=0，成功后递增。value 必须显式提供字符串或 null；空文本、数值0及布尔false与null区别保留。数字最多20整数位和8小数位，不接受指数、NaN或隐式精度截断；日期须合法日历日期；布尔采用true/false字符串。字段必须启用且在相同范围。

服务层检查管理权限，锁定同范围员工锚点，核对当前版本并同事务追加加密审计。首次并发创建仅一个成功；过期版本409，审计失败全部回滚。表单保留失败草稿，不盲目重试；切换员工或权限后旧响应无效。

本地已通过真实临时 PostgreSQL：首次创建并发、过期版本、空值有效读回、原始值不变、审计失败回滚、权限/外园区拒绝及禁用定义拒绝。临时数据库和测试容器均清理。CI复用已有postgres服务的55494映射，显式 HR_CUSTOM_VALUE_PG_REQUIRED=1；普通全套单元测试默认跳过该数据库测试，不将skip称作PG通过。

仍需部署前迁移及CI检查、生产健康与运行版本证据、真实角色业务验收。未来来源增量接入需同字段三方比较，不能覆盖维护值；本候选不实现新的来源批次导入。
