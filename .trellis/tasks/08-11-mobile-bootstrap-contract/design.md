# Mobile Bootstrap Contract Design

## Boundaries

`MobileController -> MobileService -> UsersService.getCurrentUserContext -> capability projector`

MobileService 只做移动投影，不直接访问用户、角色、权限或模块表。既有 `/users/me` 仍是基础上下文；bootstrap 为原生端提供稳定的移动语义。

## Capability Projection

每个 capability 由 manifest 定义 portal、module 和 any-of permissions。能力成立条件为：目标 module 已开通，且用户是 super/含 `*` 或拥有任一要求权限。owner portal 还需要角色身份提示（`TENANT_USER`、`CUSTOMER`、`PARK_TENANT`）或明确的 owner service capability，避免普通内部员工因工单读取权限自动获得业主入口。

## Compatibility

首版 contract 为 `mobile-bootstrap-v1`。新增 optional 字段允许向后兼容；删除、改名或改变现有字段语义必须发布 v2。client policy 首期使用安全默认值，不引入环境变量或数据库配置。

## Rollback

MobileModule 可从 AppModule 移除且不影响现有 Web、Android v1 或数据库。Android 原生客户端在依赖该接口前不得发布生产。
