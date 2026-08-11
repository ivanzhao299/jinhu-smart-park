# 公寓模块基础与角色权限

## Goal

建立 apartment 模块、权限、菜单、数据模型基础，并为吴恩国绑定公寓管理员角色。

## Requirements

- 建立独立 `apartment` 模块和首期数据库基础，不改写商业住房出租表。
- 建立房间、床位、申请、审批决定、入住、交接、模板和文档档案表。
- 将 `apartment` 加入共享占用域，后续入住可与民宿/住房出租统一防冲突。
- 定义公寓菜单、页面和动作权限，新增 `APARTMENT_MANAGER`、`APARTMENT_APPROVER`、`APARTMENT_AUDITOR` 角色。
- 生产安全 seed 将 `APARTMENT_MANAGER` 绑定给现有 `wu_enguo`；不存在该用户时必须安全 no-op，不创建密码账户。
- 注册 NestJS 模块和最小只读 bootstrap/summary 契约，为后续子任务提供稳定边界。

## Acceptance Criteria

- [ ] 新鲜数据库可按顺序应用 migration 和 production seed。
- [ ] 所有表具备 tenant/park scope、审计列、软删除和必要唯一/检查约束。
- [ ] 权限常量、权限目录、模块和菜单契约一致。
- [ ] 吴恩国仅通过业务角色取得公寓权限，seed 不扩大其他账号权限。
- [ ] API 未授权、缺模块、缺权限三种访问均被拒绝。
- [ ] Shared/API/Web 类型与构建验证通过。

## Out of scope

- 本子任务不实现完整表单、状态动作、文档生成和生产业务数据导入。
