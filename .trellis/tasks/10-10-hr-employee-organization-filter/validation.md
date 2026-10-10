# 员工目录组织筛选验证

## 已完成

- 员工目录在具备员工管理权限、全域或团队目录读取权限且现有组织选项已加载时，显示“所属组织”下拉框；默认“全部组织”。
- 选择或清空组织保留姓名/编号和任职状态，回到第一页并清理已选员工详情；目录和导出请求均把非空 `orgId` 传给既有员工列表封装。
- `hrApi.employees` 仅在提供 `orgId` 时将其转换为 API 的 `org_id`；原有空过滤条件和经理候选搜索保持不变。
- 导出上下文键包含组织，组织变更会终止进行中的读取，所有导出分页和首尾复核共享同一组织条件。

## 验证结果

- `pnpm --filter @jinhu/web exec vitest run test/interaction/hr-employee-directory-export.test.tsx test/interaction/hr-employee-directory-export-api.test.tsx test/interaction/hr-employee-operation-continuity.test.tsx`
  - 通过：3 个测试文件，21 项测试。
  - 覆盖：组织切换后的分页归位、选中详情清理、关键词/状态保留、清空组织、组织目录加载失败时不展示虚构选择器、导出组织传播与取消、`org_id` URL 及无组织时的向后兼容调用。
- `pnpm --filter @jinhu/web lint`
  - 通过。
- `pnpm --filter @jinhu/web typecheck`
  - 通过。复核记录：`/Users/mac/.codex/artifacts/hr-employee-organization-filter-20261010/typecheck-final.log`；隔离工作树的既有 UI 链接已对齐，未改动本切片源码。
- `git diff --check`
  - 通过。
- 已由父任务在实际编译组件和合成 API 夹具中验证：初始 95 条；筛选“人力资源”后为 70 条且可进入第 2 / 2 页；切换“工程”后为 25 条、第 1 / 1 页；清空后恢复 95 条。桌面及 390px 截图保存在外部构件 `browser/desktop.jpg`、`browser/mobile.jpg`，移动端 DOM `clientWidth=scrollWidth=385`，无横向溢出。
- `pnpm --filter @jinhu/web exec eslint test/interaction/hr-employee-operation-continuity.test.tsx`
  - 通过（本次审核新增的失败目录选项回归）。

## 未执行

- 真实角色 UAT 仍未执行；上述浏览器检查使用合成 API 夹具。本子任务未启动生产操作。

## 上下文完整性

- `task.py validate` 对前端索引给出 33,331 字节自动注入上限警告；已直接分三段完整读取 `.trellis/spec/web/frontend/index.md` 的 584 行，并已读取 `file-upload-and-form-controls.md` 与本任务相关的员工目录导出规范。

## 父任务最终验证

- Web生产构建通过，日志：/Users/mac/.codex/artifacts/hr-employee-organization-filter-20261010/build.log。
- 原类型错误为隔离工作树依赖链接问题，补全忽略目录下的UI类型/依赖链接后通过，无依赖安装或业务源码修改。
- 浏览器直接编译实际HrEmployeesClient及全局CSS，使用合成API；截图和精确源码hash见外部browser/result.json。临时浏览器页与本地服务已关闭。
- API与数据库未改动，本片不重跑迁移或生产业务写入；真实岗位UAT仍独立待验收。
