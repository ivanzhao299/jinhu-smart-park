# HR M4 实施计划

## 1. 固化与基线

- [x] 从已部署 `origin/main` 创建隔离分支，确认工作区无并行脏文件。
- [x] 归档 M3 并创建 M4 子任务。
- [x] 记录当前 HR 首页、员工页和 390px 壳层的契约测试基线。

## 2. 移动端壳层修复

- [x] 为移动导航增加显式打开状态类，分离桌面折叠偏好。
- [x] 移动 CSS 改为默认隐藏侧栏，仅显式打开时显示。
- [x] 路由切换/点击导航后关闭，补充布局契约测试。
- [x] 验证加载骨架、鉴权水合与普通页面均无首屏遮挡。

## 3. HR 角色工作台

- [x] 建立权限到可见业务区/请求的集中映射。
- [x] 并行加载授权的数据源，区分 unavailable/empty/error/success。
- [x] 用真实数据生成待办、概览和常用入口，删除产品介绍与路线图。
- [x] 增加局部重试、准确空状态和桌面/移动响应式布局。

## 4. 员工目录生产化

- [x] 重排为列表优先，增加姓名/编号检索和用工状态筛选。
- [x] 把新增员工表单放入显式展开区，保留原校验与权限。
- [x] 将员工详情、任职办理、敏感档案和附件组织为选中后工作区。
- [x] 处理选择变化、刷新、空列表与数据级 403。

## 5. 验证与发布门禁

- [x] 运行 HR/布局定向测试、Web lint/typecheck/build、全仓必要门禁和 diff check。
- [x] 浏览器验证桌面和手机断点：首页、员工目录、导航默认关闭、无横向溢出；生产浏览器实际宽度为 406px。
- [x] 复核原子权限、敏感投影、严格审计和玉舟兼容测试无回归。
- [x] 提交前重新 fetch，判断远端并行提交，安全合并主线后再推送独立 PR。
- [ ] CI、部署 SHA、健康检查和 Docker 清理均已通过；生产管理员只读验收通过。HR 负责人、部门负责人、员工三类受保护账号仍需专门配置并完成角色差异验收。

## Validation commands

- `pnpm --filter @jinhu/shared build`
- `pnpm --filter @jinhu/web lint`
- `pnpm --filter @jinhu/web typecheck`
- `pnpm --filter @jinhu/web build`
- HR 与 DashboardLayout 对应的 Node 契约测试
- `pnpm lint && pnpm typecheck && pnpm build`
- `git diff --check`

## Risk and rollback points

- `DashboardLayout` 是全站共享壳层：必须先用定向测试锁定桌面折叠与移动抽屉，再跑全 Web 构建。
- 工作台不得请求没有对应权限的数据；任何新增聚合请求都需有精确权限映射测试。
- 员工页保留 M3 的 self/team/full/none 数据范围，不允许客户端筛选替代服务端范围。
- 本阶段没有数据库变更；出现回归时可独立回退 M4 Web 提交。
