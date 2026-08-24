# HR M4 技术设计

## Boundaries

- Web 端为本阶段主变更层：`DashboardLayout`、HR 工作台、员工档案页、HR 页面样式与契约测试。
- API/数据库默认不变；工作台复用现有授权端点。只有发现无法安全表达的必要只读投影时，才单独设计最小 API，且不得返回敏感正文。
- 角色不是新的硬编码枚举。界面依据 `UserContext` 中的原子权限组合产生能力视图。

## Mobile shell

- 现有 `sidebarCollapsed` 同时承载桌面折叠和移动抽屉关闭，首屏默认值导致移动水合闪现。
- Dashboard shell 增加明确的 `mobile-navigation-open` 表面状态；移动 CSS 默认隐藏 `.app-sidebar`，仅显式打开状态显示固定抽屉。
- 关闭条件包括：点击菜单项、路由变化、视口切换到移动端；桌面折叠偏好仍只在桌面持久化。
- 加载骨架在移动 CSS 下同样默认隐藏侧栏，避免鉴权/水合阶段遮挡。

## Role-aware workbench

数据流：`AuthUserContext -> permission-derived capabilities -> allowed read calls -> normalized section states -> KPI/task cards -> domain route`。

- 权限推导是唯一入口；每个请求都对应现有精确权限。
- 多个数据源独立结算。可选能力的 403 映射为 unavailable，不伪装成 0；真正错误显示局部失败并允许重试。
- 数字仅从返回集合计算。卡片链接到对应业务列表，避免“死指标”。
- 敏感员工档案、工资明细与 360 原始评价不进入聚合工作台。
- 首屏结构：紧凑页头、待办优先区、业务概览、常用入口；移除路线图和宣传性能力卡。

## Employee directory

- 保持现有员工 API 和办理动作不变，重排为目录/详情/动作层级。
- 搜索和状态筛选在已获授权结果上执行；不通过筛选参数改变服务端范围。
- 新增员工表单默认关闭，通过“新增员工”动作打开；选中员工后才展示详情与办理区。
- 敏感档案和附件继续由原权限组合控制，不进入列表字段。

## Compatibility and security

- 玉舟迁移记录按现有 `HrEmployee`/任职事件投影读取；不改变历史键和状态语义。
- 不缓存未经授权的敏感响应，不通过 dashboard 聚合绕过审计。
- 现有分层 403：路由拒绝去 `/403`，业务数据拒绝由局部状态承接。

## Rollout and rollback

- M4 作为独立分支和 PR 发布；不与后续 schema 里程碑混合。
- 回滚只需回退 Web 发布提交；无数据库回滚需求。
- 正式发布后使用生产管理员做全页面只读验收，另以部门负责人/员工受保护账号验证角色差异；不提交生产表单。
