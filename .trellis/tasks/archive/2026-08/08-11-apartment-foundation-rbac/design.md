# 公寓基础与 RBAC 设计

- Migration `000202_apartment_management_foundation.sql` 仅负责 schema、索引、约束。
- Production seed `000011_apartment_management_rbac.sql` 负责模块、权限、菜单、角色和吴恩国角色绑定。
- API 模块目录 `apps/api/src/modules/apartments`，遵循 module/controller/service/entity/dto 分层。
- 首个接口 `GET /apartments/summary` 只返回房间、床位、待审批和在住数量，不返回敏感个人资料。
- Shared 定义状态、类型和 `SYSTEM_PERMISSIONS` / permission catalog；前端菜单通过模块+页面权限双门禁。
- 文件策略预注册申请、审批、消防承诺、入住交接、退房验收五类业务附件。
- 所有枚举通过数据库 CHECK 与 TypeScript 常量保持一致，并加静态测试防漂移。
