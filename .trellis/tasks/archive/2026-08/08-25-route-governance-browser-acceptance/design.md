# Design

## Boundaries

- 单独 Docker Compose project 和 PostgreSQL 端口；API 3101、Web 3100，冲突时选择未占用端口并记录。
- 数据库按生产初始化顺序 migration → production seed → baseline check → bootstrap admin → baseline check。
- API fixture 创建遵循现有 tenant/user/role/park 接口和服务契约；必要的非公开 fixture 调整可直接写隔离数据库，但必须带统一前缀并可精确回收。
- 浏览器仅连接已配置的 Windows 专用 Chrome CDP；不启动/关闭其他 Chrome。

## Evidence contract

每个 case 记录账号角色、viewport、操作、最终 URL、关键渲染文本、期望、实际、结论与 PNG。截图采用无密码、无 token、无 `.env` 的页面状态。Chrome DOM/URL 是页面行为的权威来源。

## Fixture model

- bootstrap 超管；API 创建租户得到 `contact_user_id` 指向首管。
- 后建 TENANT_ADMIN 与首管共用角色但不具备 contact pointer。
- 工程权限账号、窄权限账号、双园区账号。
- 双园区账号在 park A 有工程模块/路由权限，在 park B 无对应模块；同时保留 park B 的合理落点权限。

## Failure and rollback

- 环境错误最多修复重试两次；仍失败则停止并如实报告，不宣布 PASS。
- 产品 FAIL 保留原始证据并继续其他独立 case，不修改产品代码。
- 所有数据仅存在隔离数据库；最终 down compose 即物理回收，仍额外执行前缀与文件 residual 查询作为审计证据。
