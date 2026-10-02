# 玉舟现代社保政策版本

本切片基于4e5de950主干，新增不可变的现代政策定义，保留历史政策和金额。它是社保确认闭环的前置部分，不等于当前政策已启用或当前月份已业务验收。

接口：`POST /hr/insurance/policy-versions` 创建定义，`GET /hr/insurance/policy-versions` 分页目录，`GET /hr/insurance/policy-versions/:id` 读取明细。保存要求明确起止月份、方案、业务依据，以及六险种四类费率/固定金额；也可从明确的历史政策版本复制。缺少费率不能自动补零。

定义保存后禁止更新、删除和清空表。新版本单独保存；同一请求编号、创建人和规范化输入的重试复用原UUID，输入或创建人不同报冲突。内容hash由PostgreSQL生成，审计与保存使用同一事务。历史来源的政策、版本、方案和分项hash随定义保留，历史来源以后变化不会改写已保存定义。

创建权限独立于读取权限。本切片没有增加生产权限目录、角色绑定或种子授权：既有模块授权会按权限目录推导管理员权限，需在下一步页面/权限登记中一起检查，不能将登记权限误当成不会扩权。真实岗位授权和业务启用保持单独验收。

本地验证入口：

```sh
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/api typecheck
pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-insurance-policy-version.spec.ts src/modules/hr/hr-insurance-calculation.spec.ts src/modules/hr/hr-insurance-preview.spec.ts
pnpm --filter @jinhu/api build
pnpm --filter @jinhu/web typecheck
```

实际数据库测试入口为`hr-insurance-policy-version.pg.spec.ts`，要求`HR_INSURANCE_POLICY_VERSION_PG=1`、`HR_INSURANCE_POLICY_VERSION_ISOLATED=yes`、127.0.0.1地址和`jinhu_hr_migration_lab_*`隔离库；使用完整原迁移和真实AuditService。普通测试中的skip不能作为通过证据。

尚未完成：政策维护页面、权限目录受控登记、期间预览/确认/关账/更正、工资引用、真实角色及实际月份核对。该切片单独不宣称完整现代运营或原玉舟业务等价。

## 本地实测证据

- 政策、精确计算、参考试算与全局审计共21项聚焦测试通过，0失败、0跳过。真实全局审计拦截器在两个社保控制器的成功/失败路径均不记录请求体，服务必需审计继续保留元数据。
- 专用回环PostgreSQL空库执行全部原迁移到000322，通过6项服务测试，0失败、0跳过；真实AuditService写入和失败回滚、并发版本/重试、SQL不可变保护、来源漂移和子项插入幻读均有实际断言。临时容器已删除。
- 测试runner启动时的汇总断言仍预期5项，实际6项通过后报AssertionError。因此原runner回执保留FAIL；独立复核原始TAP/迁移日志确认数据库与服务证据通过，没有把runner整体伪报PASS，也未为修正计数重跑完整迁移。后续runner预期已改为6项，但修正后的runner未重新执行。
- 补充最小结构SQL测试证明新增迁移保留已存在的源政策，并拒绝直接SQL构造的跨范围、过期来源版本；该测试不替代完整原结构服务测试。
- shared构建、API类型检查/构建、Web类型检查和修改文件lint通过。没有修改前端页面，浏览器验收留给后续页面切片。

本地证据不代表生产迁移已执行。本切片尚未发布，下一步将政策页面、受控权限目录和期间操作接齐后进行对应发布及生产验收。
