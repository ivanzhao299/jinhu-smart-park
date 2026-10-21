# 同内核独立企业 HR

`APP_RUNTIME_MODE` 只能为 `integrated`（默认）或 `hr_enterprise`。API 在启动时选择根模块；浏览器、请求体、header 或 JWT 不能选择部署模式。现有集成部署继续使用完整 AppModule、园区成员与模块规则，不自动切换。Web 构建/启动也设置相同 `APP_RUNTIME_MODE`，并通过 `NEXT_PUBLIC_API_TARGET` 指向对应 API；Web 配置仅决定品牌/页面展示，权限仍由 API 的实时上下文确定。配置模板见根目录 `.env.hr-enterprise.example`；集成 `.env.example`、`.env.production.example` 保持默认 integrated。

## 独立安装与升级

先安装现有锁定依赖并构建 shared/API。准备新的专用 PostgreSQL 数据库、私有密钥与独立绝对文件目录，加载独立配置后运行：

```sh
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/api build
node scripts/hr-enterprise/init-db.mjs
```

独立库使用 `database/hr-enterprise/install-manifest.json` 的有序步骤，不执行 `database/migrations` 全园区迁移。初次安装要求 public 空库；每一步和 checksum 在同一个事务及 advisory lock 下记录。重复运行核对已应用记录；未知历史、checksum 漂移或出现园区表失败。数据库 owner 需要创建扩展及既有 NOLOGIN 能力角色的权限。初始化不创建租户、成员、角色授权或业务行。完整 HR 及必要身份、组织、RBAC/字段/数据范围、文件、审计、幂等、字典和用户消息对象来自审核的仅结构快照；不包含园区、资产、租赁、安全等业务表。

首次企业配置是独立的显式操作：将严格 JSON 通过 stdin 交给以下入口，不能放到 shell 参数/历史或输出日志。字段恰为 `tenantId, enterpriseCode, enterpriseName, username, password`；密码12至128字符。不要使用固定密码、历史真实身份或生产测试账号。

```sh
HR_ENTERPRISE_BOOTSTRAP=yes node scripts/hr-enterprise/bootstrap-enterprise.mjs < /private/enterprise-bootstrap.json
node apps/api/dist/main.js
```

该入口事务创建真实企业/成员、非 super 的初始 HR 管理员、明确 HR/core 权限和模块，以及普通在线合同类型/标准30、60、90天合同提醒目录（HR收件角色为该企业安装时明确的管理员角色）；没有员工、工资或历史导入数据。企业成员与角色通过 `/enterprise` 正常办理。角色创建及既有角色分配均受当前具体权限子集和数据范围上界约束；受字段/命名范围策略限制的操作者不能委派身份或角色，由已有可委派管理员办理。不可创建 super、通配权限或跨企业角色。所有写入使用版本/幂等和必要事务审计。

发布后不得重新生成覆盖已应用的 `000001_kernel.sql` 或其他步骤。新的集成 HR/core schema 变化必须评估独立对象影响，新增独立前向步骤和 manifest checksum，验证旧版本升级与新空库初始化，并更新维护清单。`generate-schema.mjs`/`generate-acls.mjs` 是审核后的候选生成工具，不是生产自动同步器；历史迁移、ACL及独立历史 checksum 均不得改写。函数 ACL 清单来自完整集成迁移的真实 PostgreSQL catalog；同名函数/过程使用其原类型和 EXECUTE 边界，不能因只结构 dump 未带 ACL 而开放受限导入能力。NOLOGIN 能力角色不获登录、成员关系或新增业务表授权。

## 企业范围与隔离

公开企业身份为 UUID；数据库 `scope_key` 是 UUID 去连字符的 generated ALWAYS 32位小写键，一对一兼容既有 HR `park_id` 存储列。企业成员表提供同样的generated桥接列；员工当前账号绑定与角色分配的复合外键要求同租户、同企业的真实成员，未绑定历史员工保留null。这个旧键在独立模式表示企业范围，不表示园区，也不创建假园区。`business_scope={kind:'enterprise',tenantId,scopeId,parkId:null}` 与 `current_enterprise/accessible_enterprises`说明实际上下文；旧 `current_park/accessible_parks` 为空。切换仍复用受服务端验证的 `/auth/switch-context`，旧请求 `parkId` 携带企业 scope_key，不能伪造企业成员资格。

JWT 带部署模式；旧无模式 JWT 仅集成模式兼容。独立刷新令牌/登录票据使用独立命名空间，跨模式拒绝。每个请求重建实时身份/角色/权限；企业、租户、成员停用、到期及撤权不能被 super 或旧缓存绕过。当前上下文 `/auth/me` 是两模式共用入口。独立消息列表复用真实 `biz_user_message` 与共用本人收件人服务，不依赖工单模块。

文件目录必须绝对、真实且专用。首次启动要求空目录，写入0600模式/数据库身份 marker；后续启动核对归属。不同数据库、集成运行或符号链接目录不能复用。生产数据迁出/文件搬迁需要单独受控计划，不能删除 marker 绕过隔离。API `/ready` 核对真实数据库 marker，启动隔离也拒绝混用数据库；API `/health` 和 `/version` 标识运行模式。两个部署应使用各自密钥、cookie名及独立 origin。独立模式只开放密码登录。

## 验证与运维

实际合成双模式验证入口及 owned 配置见 [测试说明](../testing/hr-enterprise-runtime.md)。私有配置、日志和凭据必须0700/0600。测试身份、空库与浏览器证据不证明生产真实岗位、旧源等价、2026-07全量工资试算或迁出恢复/RTO；这些仍属于父任务独立验收。默认不会创建公网独立实例，也不会向当前集成生产写测试数据。

受任何有效字段策略、旧字段授权或命名数据范围规则限制的管理员不得新建角色、新建成员或重分配角色；这些办理需由已经具有对应权限且不受该限制的管理员执行。服务在同一事务锁定实时角色/策略进行检查，不能凭创建无策略身份洗掉限制；成员状态维护不新增权限，仍按原能力办理。

独立前向步骤 `000007_member_actor_references.sql` 按随附精确清单将97个 HR 三列用户范围外键改为企业成员历史存在外键，保留名称及引用动作；集成迁移和单列身份外键不变。成员停用由实时业务资格检查处理，不删除历史作者身份。`000008_reminder_role_scope.sql` 允许提醒目录显式指定该企业 HR 角色代码，仍要求其他收件类型的角色代码为空；运行提醒时同时检查当前企业的有效角色和有效成员。初始化迁移不新增权限或提醒数据，目录只在显式企业 bootstrap 时建立。

密码验证成功后，独立登录优先选择有效的默认企业；默认成员关系停用时按企业标识稳定排序选择其他有效企业。指定企业登录必须为该企业有效成员，没有有效成员时拒绝登录。集成模式继续原默认园区规则。企业成员列表沿用普通用户列表的租户数据范围及字段策略，组织负责人选择沿用字段策略并按当前企业实时成员筛选。

### Employee date reminder upgrade

Run the existing versioned independent initializer to apply the appended common382 and000009 steps; do not regenerate the old kernel or rerun integrated park migrations. The new step registers permission definitions and navigation metadata for existing HR tenants without granting additional roles/users access. New enterprise bootstrap uses the updated canonical catalog. Existing enterprises assign the new reminder capabilities through their authorized administration flow. A new database/files paired snapshot with the current installation manifest is necessary before claiming restored-version acceptance.
