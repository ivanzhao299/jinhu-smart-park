# Design

复用 HrTalentService.access/employeePredicate；新 GET employee-options 与 options 同控制器权限，active员工最小投影、计数及稳定 code/id 分页。DTO沿用培训已验证的严格标量校验形式。审计复用已有 required read helper，不记录检索词/人员值。

HrEmployeeSelection新增talent purpose调用专用API，无通用员工读取权限依赖。TalentEmployeePicker保留独立已选快照/隐藏ID，多选最多500。父视图按完整用户上下文key重挂载；五表单独立已选状态；行动负责人选择仅展开时加载。失败保留草稿，成功关闭并清除选择。
