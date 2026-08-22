# Design

## Boundary

`POST /parks` 保持客户端表单合同，由 API 在当前 tenant 下生成新 `parkId`。授权仍基于当前
JWT；只有租户超级管理员或具备等价租户级园区创建能力的主体可以触发独立作用域创建。

## Transaction and lock order

在一个 TypeORM transaction 中依次获取稳定排序的 tenant/park provisioning、组织层级和
asset scope advisory locks。所有读取、唯一性检查、园区写入、关系初始化和投影写入均使用
同一 manager。任何后置条件失败均回滚。

## Provisioning

1. 生成全局唯一的新 `parkId`，创建 `(tenantId, newParkId)` 下唯一 active canonical park。
2. 创建该作用域的 `TENANT_ROOT` 根组织。
3. 复制当前租户已启用模块到新园区；复用 tenant-wide permissions，但创建/绑定新园区角色权限。
4. 将创建者对应的租户超级管理员身份加入 `rel_user_park(isDefault=false)`、新园区角色和根组织。
5. asset 模块启用时调用共享 provisioning，创建 projection、controls 和 audits。
6. 用后置查询断言 canonical source、关系和模块 exact-set 后提交。

## Compatibility

现有园区更新、停用、删除继续按实体作用域执行。列表在当前 tenant 的园区管理语义下返回同租户
园区；JWT 仍保持原 `parkId`。若现有查询实际上仅限当前 park，需显式新增 tenant-admin 管理查询，
不能把普通用户的数据读取范围一并放宽。

## Security

客户端不得提交 `tenantId` 或 `parkId` 作为可信作用域。创建权限与 tenant-admin 身份均在服务端
验证；普通 park-scoped 管理员不能借 `park:create` 创建跨作用域园区。

## Rollout and rollback

优先应用层原子 provisioning；若现有 schema 已能表达所有关系，不新增迁移。上线失败由事务自然
回滚；PR 合并后按生产 Deploy 门禁监控，禁止手工改库或绕过 canonical 检查。
