# PMA L-03 B 端工作台与全局导航

## Goal

为 B 端建立类型化 Web route registry、可扩展动态 breadcrumb resolver、权限感知导航 command palette 与按用户/园区隔离的列表偏好记忆，消除导航路径散落并保证窄权限和多园区不越权。

## Requirements

- 建立类型化 route registry，统一动态 route pattern、terminal 分类、breadcrumb 元数据与安全 href builder。
- `menu.ts` 保留后端菜单合并/授权职责，但动态 breadcrumb 与 terminal 判断改为消费 registry。
- Breadcrumb 支持详情对象的异步/显式 label resolver；加载失败、未知值或越权时只显示安全 fallback，不泄露对象数据。
- 新增键盘可访问 command palette（Ctrl/Cmd+K、方向键、Enter、Escape、焦点恢复），命令只来自当前用户已过滤菜单树和启用模块。
- Palette 是导航入口，不是对象数据搜索或授权边界；Dashboard route denial 与后端 API scope 继续最终裁定。
- 新增 versioned list-preference hook，以 user+tenant+park+list id 隔离 `filtersOpen/pageSize/viewMode/visibleFields`，处理旧/坏 storage 与允许值裁剪。
- 首批把共享 PropertyListShell 的 filtersOpen 接入偏好，并提供 mounted interaction tests；移动端仍优先 cards。

## Acceptance Criteria

- [ ] Registry 的动态 matcher、href builder、terminal routes 和未知 path 均有测试。
- [ ] Breadcrumb 动态 label、加载/未知 fallback 与权限过滤均有测试。
- [ ] Palette 不显示无权限/禁用模块/空 menu tree 命令；切园区上下文后结果重建，无旧结果残留。
- [ ] Palette 完整键盘交互及焦点恢复通过 mounted test。
- [ ] Preference 首次默认、重挂载恢复、scope 隔离、坏 JSON/版本/非法字段回退均通过 mounted test。
- [ ] user-facing 页面通过 desktop 与 390px 浏览器检查，不出现横向溢出。
- [ ] review ≤3、CI/merge/containing-main gate 与 Trellis 归档完成。

## Out of scope

- 不新增跨业务对象全文搜索 API，不在客户端缓存全量对象数据。
- 不改变后端 permission/data scope、菜单投影、financial 或 migration 行为。
- 不改 HR 文件或 HR smoke/fixture，不进行生产直操作。
