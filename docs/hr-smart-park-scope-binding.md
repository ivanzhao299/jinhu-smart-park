# HR P1-A：真实园区与中性业务范围绑定

## 交付与边界

这是 M0/P0/P1 的集成适配基础，不是独立登录、全库 scope 回填或生产迁移完成。
共同企业内核 `000001_core.sql` 不变，不增加园区依赖。
可选组件 `database/components/business-scope/000002_smart_park_binding.sql` 只由将来的
Smart Park 安装/升级 profile 显式执行，不在默认生产迁移清单内，不在应用启动时执行。
该 DDL 按安装历史恰好执行一次；不能重复执行 DDL 或复制进另一个组件。

## 精确身份约束

`sys_business_scope_park_binding` 同时引用：

- `(tenant_id, scope_id, scope_kind=park)`，所以不能把 enterprise scope 接到园区；
- `(park_row_id, tenant_id, park_id)`，所以真实行 ID、业务园区 ID 和租户不能混用；
- 同租户每个 scope 和 park 各只有一个绑定，数据库复合外键也保护反向归属修改。

显式函数 `backfill_smart_park_business_scopes(tenant_id)` 使用调用者权限、固定 search_path，
默认撤销 PUBLIC 执行权。它在一个事务中锁定源与绑定表，仅为指定租户的未删除真实园区
插入缺失 scope 和绑定，保留所有源业务数据。重复执行只复核已有绑定，源歧义、绑定漂移
或 scope code 冲突整次失败；不猜测已有 scope 的归属，不覆盖、不重启用已有 scope。

新 scope 的技术 code 为 `park:` 加 tenant/park 元组 JSON 的 MD5；这个 code 不是安全证明，
也不是园区身份，身份始终由精确复合外键决定。code 冲突直接报错，不合并。
新 scope 初始启用状态取自源园区；之后 scope 与 park 都必须分别有效才能解析，
重跑回填不会恢复已经停用的 scope。

**回填不授予成员关系、产品模块或 RBAC 权限**，不会回填用户、HR、组织、会话和审计表。
返回值只有来源园区数、新增 scope/绑定数和已有绑定数。

## 运行接线

Smart Park 组合入口可显式注册：

```ts
BusinessScopeCoreModule.register({
  parkAdapterProvider: { useClass: SmartParkBusinessScopeAdapter }
})
```

适配器只依赖 DataSource，不加载 ParksModule 或其他管理模块。共同 resolver 先验证
成员和模块，适配器再读取精确绑定，核验当前 scope、租户、用户、成员及真实园区活动性。
同业务园区出现多个未删除源行时拒绝。只返回 allowlist 中的 tenant/scope/park 元组，
缺失、歧义、异常或不一致均返回 null，不生成默认值。

独立企业入口继续不注册园区适配器；enterprise 由共同内核解析为 `parkId: null`。
本片没有把这些接口接到现有生产 Auth/JWT，也没有启用生产安装 profile。

## 验证（2026-09-05）

基线 `ccd99ff85f21488fb162a676ac28c10ff9dcaad6`。本工作树独立执行
`pnpm install --offline --frozen-lockfile --prod=false`，无依赖下载和 lockfile 改动；
构建本地 shared 后，API 的 `@jinhu/shared` 实际解析到本工作树的 `packages/shared`。

- 适配器定向单元测试 4/4 通过：绑定参数、输出字段白名单、输入与结果负例、安全拒绝。
- `node scripts/e2e/yuzhou-hr-business-scope-core-postgres.mjs --park-binding` 两次小型运行均 1/1 通过；
  第二次增加并验证园区源行和范围主键的反向修改拒绝，不是历史 A/B 演练。
  使用当前真实 `000008_s2_biz_park.sql`、共同 scope DDL 和本绑定组件；身份基础表为合成最小表。
  验证两园区守恒、重放零新增、另一租户不被写入、kind/tenant/park 复合约束及反向修改拒绝，
  以及后段冲突时前序插入回滚。真实只读 DB 角色和 Nest 适配器验证停用/删除、歧义、
  缺成员/模块拒绝；读者不能写绑定或执行回填函数。
- API typecheck、定向 ESLint、runner 语法与差异检查通过。

PG 使用单个随机 loopback 端口、512 MiB tmpfs 临时容器，启动前有宿主和 Docker 容量门禁，
结束清理仅作用于该随机 run 的容器。不访问玉舟源、生产数据或现有备份。
未运行全仓生产构建、全部历史迁移、生产现场回填、HTTP 登录或浏览器 UAT；
这些局部证据不能证明生产源已无歧义或整个 HR 已可独立运行。

下一段：完整身份/RBAC/session 的 scope 迁移闭包，以及 HR/Org/审计接线与真实登录闭环。
