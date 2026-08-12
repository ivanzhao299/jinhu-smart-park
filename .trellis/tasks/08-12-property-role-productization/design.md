# Technical Design

GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/262
Trellis PRD: `.trellis/tasks/08-12-property-role-productization/prd.md`

## Boundaries

- Shared：定义标准岗位模板清单、bundle 组合、版本/hash 与字段/动作矩阵，作为 API、seed 和测试共同契约。
- Database：新增前向 migration 承载模板/实例化所需 schema metadata；production-safe seed 仅收敛固定 bootstrap scope 的标准模板与绑定。
- API Roles：新增 bundle catalog/preview/apply 服务与 endpoint；复用角色 CRUD、权限替换、数据范围和审计设施，但不信任 Web 提交的权限 ID 集合。
- API Users：保留 PR #261 独立角色分配命令，增加模板/system/builtin 链接保护与候选过滤。
- Web Roles/Users：角色管理承载 bundle 预览/差异/创建更新；用户管理只分配已实例化、合法、启用的普通角色。
- Menu/Permissions：修正 frozen seed 的 visible 数据，并以 API `/users/me` 菜单投影和 Web route guard 做跨层契约。

## Standard Template Model

模板代码稳定、租户/园区作用域稳定、definition version/hash 可审计。模板与实例角色区分：模板不可直接分配用户；实例角色记录来源模板及 applied bundle signature。七个模板映射为：

- 房源经营管理员 → asset manager bundle（含发起，不含 decide）。
- 房源经营审批人 →审批读取/决定及必要任务摘要（不含 operation update/transition/create）。
- 民宿经办、住房经办 → 对应业务 operator bundles。
- 民宿财务、住房财务 → 分域 finance bundles。
- 房产业务审计 → 只读 audit/approval/task/operation 摘要，不默认敏感身份读取。

maker/checker 由权限集合与审批服务的 actor exclusion 双层保证。

## Bundle Preview And Apply Flow

1. 客户端提交目标 scope、bundle code/version/hash、模式 `merge|sync`、可选角色 ID/version。
2. 服务端按当前 tenant/park 重新读取启用 bundle 与成员，验证签名并规范化最终权限。
3. preview 返回 base、add、keepExtra、removeExtra、final、风险提示和 bundle signature，不写库。
4. apply 在事务内锁定角色和 bundle，重算 preview；提交签名或 role version 不一致返回 409。
5. `merge` 保留额外权限；`sync` 仅在显式确认 token/摘要匹配时删除预览中列出的额外权限。
6. 写入角色、permission links、模板来源与 current_park 数据范围，记录审计；幂等重放返回原响应，不同 payload 冲突。

## Reconcile And Upgrade

- production-safe seed 使用临时 expected tables 固定 scope、模板、bundle signature、权限集合与数据范围。
- preflight 先验证唯一 scope、bundle/version/hash、权限存在性和目标受管角色状态，再进行任何写入。
- 新模板 insert-only；已有受管模板仅允许从明确 predecessor signature 升级到当前 signature。
- 用户自定义角色和未带受管标识的同名角色都 fail closed，不接管。
- 对实例角色默认不删除额外权限；受管模板本身要求 exact set。升级记录 before/after signature、添加/移除集合和执行来源。
- 数据回滚不逆迁移；应用回滚必须仍能读取新 metadata。异常恢复依靠事务回滚、备份与显式数据库所有者决策。

## Scope And Field Security

- current_park 不是空泛字符串：角色 scope、tenant/park link 和必要数据范围规则必须共同解析到目标 park。
- scope resolver 对空集合、未知维度、缺列映射、actor/request scope 不一致一律 deny/empty；跨 scope 查找使用 NotFound/Forbidden 的既有非泄露语义。
- 字段读取继续复用 `FieldPolicyService` hidden/masked 与 `party:sensitive_read`；写动作由 endpoint permission + DTO/service 业务校验控制。
- 默认审计模板不含敏感读取；合规敏感读取作为显式附加能力，不能被标准模板 reconcile 自动扩大。

## Visible Compatibility

- canonical rule：menu/page 可见，button/api/action 不作为菜单可见。
- 新前向迁移/production seed 修正已存在 Track-B 行；不编辑已执行 000189。
- 角色权限树不得用 visible 隐藏可授权 API；动态菜单只消费 visible menu/page。
- 测试覆盖 type × visible × grant 矩阵，并验证页面路由和 API guard 分离。

## Rollout And Rollback

- 顺序：schema migration → production-safe seed/reconcile → API/Web release；seed 失败阻断后续启动。
- feature 可在 Web 入口层回滚，但数据库 metadata 保持向后兼容。
- 不自动向已有自定义角色扩权；管理员通过 drift preview 显式决定 merge/sync。
- 浏览器验收仅使用隔离本地 DB/API/Web 和非超级管理员账号；证据保存时脱敏。
