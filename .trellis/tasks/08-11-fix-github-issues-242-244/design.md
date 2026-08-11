# Design: GitHub Issues 242-244 修复

## Boundaries

- #242 保持 Park DTO/实体的字符串字段不变，在 Web 层提供受控三级联动目录与历史值兼容。
- #243 在 API DTO 层扩大但不移除数组上限，角色服务原有租户范围和有效权限校验不变。
- #244 删除 Web 请求中服务端拥有的 `source_domain`，继续由 HousingTenantService 固定为 `housing_rental`。

## Compatibility

- 地区选择提交中文标签，兼容现有 varchar 字段；不认识的历史值只用于当前编辑态展示，不进入正常候选目录。
- 权限上限覆盖当前 532 条系统权限并预留租户自定义空间，同时限制异常超大请求。
- 不修改共享来源域枚举或数据库 CHECK，避免扩大非法数据面。

## Review and rollout

三项修复通过同一 Draft PR 交付；CI 与 Codex review 以最新 head 为准。任何反馈修复后重新运行目标测试并再次检查未解决线程。此次无迁移和生产数据写入，回滚为撤回对应代码提交。
