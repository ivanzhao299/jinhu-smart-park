# Implementation Plan

1. 在 shared 新增 mobile contract 与 capability manifest。
2. 新增 MobileModule、controller、service，复用 UsersModule。
3. 将 MobileModule 注册到 AppModule。
4. 增加 capability projector 和 controller contract 测试。
5. 运行 shared build、API 单测、typecheck、lint、build 和 diff check。

## Risk Points

- 不把 Web menu_tree 转换为 capability。
- 不让 super 绕过 module availability。
- 不因内部工单权限误判 owner 身份。
- 不新增 migration、seed 或生产配置。
