# 设计：租户登录设置幂等写入闭环

## Failure Model

`saveLoginSettings()` 使用统一 `apiRequest()` 发起 PATCH，但漏传 `idempotencyKey`。全局 `IdempotencyKeyGuard` 在认证后的所有写方法上先于控制器运行，因此请求直接返回 400，后端事务、套餐解析和权限同步逻辑均未执行。截图中的英文错误正是 Guard 的固定错误信息。

## Request Contract

1. Web 每次用户主动点击“保存配置”时调用 `createIdempotencyKey("tenant-login-settings-update")`。
2. `apiRequest()` 继续负责把 option 映射为 `X-Idempotency-Key`，页面不手写 Headers。
3. 全局 Guard 保持不变，缺键请求仍被拒绝。
4. 租户登录配置 PATCH 增加现有 `IdempotencyInterceptor`：
   - 首次请求登记 processing 并执行现有事务；
   - 同键同指纹的已完成请求返回缓存响应；
   - 同键仍处理中或同键不同指纹返回 409；
   - 失败请求记录失败状态，不把失败响应伪装为成功。

## Boundaries

- 前端只负责生成并传递键，不复制 header 拼装逻辑。
- 控制器只声明幂等拦截器，不改变 service 的事务和授权算法。
- service 仍是套餐、模块、配额、多园区角色权限同步的唯一业务实现。
- 此路由继续要求 `TENANT_MANAGE` 和审计日志；不得标记为公开路由。

## Compatibility

- 每次明确的用户提交使用新键，不会把两次有意的配置修改误判为重放。
- 网络代理或调用方使用同一请求头重放时受后端缓存保护。
- 已有客户端若传合法键继续工作；缺键客户端仍按全局契约返回 400。
- 不涉及数据库 schema 变更；复用既有幂等请求存储。

## Validation Shape

- Web 单元测试验证该 PATCH 与幂等键生成绑定，避免以后再次漏传。
- API 控制器契约测试验证该路由声明 `IdempotencyInterceptor`。
- API/E2E 验证缺键 400、首写成功、同键同体重放、同键异体 409。
- 真实隔离数据库/API/浏览器验证存量 system-only 修复与新租户套餐修改后的首管菜单/API。

## Rollback

代码回滚只会移除该路由的真实重放保护和 Web 请求键；无迁移需要逆转。生产回滚仍应使用上一稳定镜像，不能关闭全局 Guard 作为应急手段。
