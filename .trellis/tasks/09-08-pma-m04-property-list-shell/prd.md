# PMA M-04 统一 PropertyListShell 首批列表页

## Goal

以一个房产业务共享列表壳层统一应收、收款、退租、房源四个高频列表的视觉层级、筛选反馈、分页和桌面/移动记录表达，使 390px 现场终端无需横向寻找关键字段与动作。

## Source And Confirmed Facts

- GitHub Issue: #700。
- `docs/reviews/property-modules-modernization-audit-2026-09-04.md` 的 M-04 指定首批 `receivables/payments/checkouts/units`，验收为 desktop + 390px 视觉/交互契约。
- `PropertyPageSurface`、`PropertyPanelSurface`、`PropertyResponsiveRecords` 与 `PaginationBar` 已存在，可组合复用；仓库尚无 `PropertyListShell`。
- 四页现有 API、写操作、权限和金融审计语义均不属于本任务的变更范围。

## Requirements

- 在 `property-shared` 建立 `PropertyListShell`，组合 hero/header、园区上下文位、可折叠筛选、显式应用/重置、已应用条件 chips、可选 bulk bar、responsive records 容器和分页。
- 桌面表格与移动卡片由同一组 record descriptors 投影字段与 formatter，避免两套业务显示逻辑。
- 首批迁移 receivables、payments、checkouts、units；保留各页既有数据加载、drawer、mutation、权限守卫和专属工具栏。
- 390px 下展示卡片记录与触摸友好动作，不出现页面级横向溢出；桌面维持可扫描表格。
- 筛选只在“应用”时生效，“重置”恢复该页默认查询；chips 描述当前已应用条件并可清除。查询状态与 URL 同步时必须保留已有深链兼容。
- bulk bar 仅作为 permission-aware 可选插槽；本期不凭空增加金融批量写操作。
- 使用共享 DS surface classes，不重建页面本地颜色、边框、阴影或按钮体系。

## Acceptance Criteria

- [ ] 四页均通过 `PropertyListShell` 呈现 header/filter/list/pagination 骨架，并复用 `PropertyResponsiveRecords` 或同一 descriptor 投影机制。
- [ ] receivables、payments、checkouts、units 在 390×844 下均以 card records 显示关键字段与可执行动作，无 document 横向溢出。
- [ ] 桌面列表字段、金额/日期/状态文案和原有动作能力没有退化；收款/应收删除与核销等金融行为未被放宽或改写。
- [ ] 四页具有显式筛选应用和重置，已应用条件可见；分页上一页/下一页具有正确禁用边界。
- [ ] 壳层契约测试覆盖 hero/filter/chips/bulk slot/responsive records/pagination；目标页契约证明接入与同源字段描述。
- [ ] Web 相关 unit tests、lint、typecheck、build 通过。
- [ ] 使用隔离浏览器/独立 evidence 目录验证目标路由 desktop 与 390px；不使用主 Chrome，不记录敏感凭据。
- [ ] PR review 不超过 3 轮，PR CI 通过，squash merge 后 main CI 与 Deploy Production 双绿，Issue #700 关闭并归档任务。

## Out Of Scope

- M-05 的 React mounted interaction harness、mutation 抽查与全面真实交互测试。
- 排序、列自定义或保存视图后端持久化；本期只提供可组合插槽和兼容 URL 查询状态。
- 新增任何批量金融写操作或调整 API/数据库/迁移。
- HR 页面、生产手工操作、他人容器与主 Chrome。

## Open Questions

- 无阻塞问题；用户已批准按总队列顺序实施并闭环。
