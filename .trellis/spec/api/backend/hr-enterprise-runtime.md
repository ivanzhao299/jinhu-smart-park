# 同内核独立 HR runtime 合同

- `APP_RUNTIME_MODE` 严格服务端 enum；默认 integrated。保留旧无mode JWT仅集成兼容，独立 JWT/refresh/ticket与集成隔离。AuthService/Controller、IdentityDirectory、JWT/Permission/Module guards、审计/幂等和 HRModule共用；只装配适配边界，禁止复制 HR 规则、fake park、请求 trusted/scope bypass。
- 企业 scope UUID公开、generated hex32仅旧park_id存储桥；实时有效租户/企业/成员是每个主体必要条件，super也不能绕过。CurrentScope内部键不可由客户端任意写入。
- 独立 schema manifest前向有序/原子/强checksum/可重入，空库初始化不跑全园区DDL，不创建业务行。完整函数/过程ACL保留，未知历史/缺依赖硬失败。应用后只新增步骤，不能重新生成覆盖旧步骤。
- 企业管理既有权限复用；目录和分配均检查同企业、非super、具体权限子集、数据范围上界；受字段/命名范围策略限制的操作者不能委派身份或角色。scope/成员锁与必要审计使用同一EntityManager事务。严格DTO和membership版本；trueDB幂等放在live权限之后。
- 自己的持久化消息读取/标记共用UserMessageService。独立根不导入工单/安全仓库；没有消息时可以空结果，不能用固定空stub替代数据库查询。
- 文件root要求独立实际目录+模式/数据库marker，首启空目录，混用/符号链接失败。默认集成生产行为保留。
- 服务端中文菜单按canonical页面权限生成，一条route一个节点；API操作权限不能显示为页面label。企业入口any-of为USER_LIST或(USER_CREATE+USER_ASSIGN_ROLES)或(ROLE_CREATE+ROLE_ASSIGN_PERMISSIONS)，各读写仍单独鉴权。
- 必须实际双模式PG/HTTP与当前kernel流程、跨范围/字段/撤权/并发/审计失败/附件验证。静态图、配置、健康或单POST不能证明独立可运行。参见 docs/testing/hr-enterprise-runtime.md 与 docs/deployment/hr-enterprise.md。

受任何有效字段策略、旧字段授权或命名数据范围规则限制的管理员不得新建角色、新建成员或重分配角色；这些办理需由已经具有对应权限且不受该限制的管理员执行。服务在同一事务锁定实时角色/策略进行检查，不能凭创建无策略身份洗掉限制；成员状态维护不新增权限，仍按原能力办理。

- 独立复合用户范围外键引用历史企业成员关系；实时资格由同一 scope port 验证。精确前向清单只替换旧三列 home 引用，保留单列身份外键及集成迁移。当前负责人/收件人要求 live 成员；已有事实的历史作者按租户身份显示，不因成员停用丢失。
- 密码认证成功后独立模式选择有效 home 或稳定排序的有效企业；显式指定企业必须有效。无成员拒绝，集成默认园区路径不变。成员列表沿用 UsersService 的 tenant DataScope 和 FieldPolicyService，不能手工重建被隐藏字段。
- 独立提醒角色为显式企业目录配置，非 HR 收件类型不能携带角色代码；实际运行按当前企业的有效角色和成员解析，不依赖身份 home。
