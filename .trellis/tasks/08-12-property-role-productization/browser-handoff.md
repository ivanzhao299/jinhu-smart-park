# 本地真实 Chrome 验收交接

状态：`PASS`（2026-08-13）

原 Computer Use 的 `sandboxCwd is not a local file URI` 限制已通过隔离浏览器方案绕开。
实际使用 Windows Chrome 151 `--headless=new`、随机 CDP 端口、独立临时
`user-data-dir`，通过 Chrome DevTools Protocol 操作真实页面 DOM 和设备指标；
没有使用 Playwright，也没有访问生产。

已完成：

- 管理员角色页、用户页 desktop/390px 路由、文本、截图和横向溢出检查；
- 七个复制后的普通岗位角色各自使用独立非超级管理员账号登录；
- 七个岗位在 desktop/390px 共 14 个工作面均进入预期路由、出现工作面文本、
  未出现 403/无权访问，并且 `scrollWidth === clientWidth`；
- 权限包角色完成 merge 预览/应用（保留额外权限）与 sync 预览/二次确认/应用，
  两次写入均形成 `sys_op_log` 成功审计，最终收敛为 bundle 的 18 项权限；
- maker/checker 负向：经营管理员审批决策 403，经营审批人发起经营模式变更 403；
- 停用经营管理员角色后，旧账号下一次页面重水化跳转 `/403`，预置的
  `jinhu-property-drafts-v1` IndexedDB 被清除；重新启用形成独立审计写入。
- 证据位于 `evidence/chrome-cdp/summary.json`、
  `evidence/chrome-cdp/non-super-role-matrix.json` 及对应 PNG。

最后两项已完成：跨租户与跨园区真实角色目标均统一返回 404 `Role not found`，
响应不包含目标名称；用户管理抽屉保存后，`s1_user` 的最终集合保留原
`S1_NORMAL` 并新增 `PR262_USER_ASSIGN`。完整本地真实 Chrome 门标记为 `PASS`。

## 约束

- 仅连接本任务隔离的 PostgreSQL/API/Web；禁止生产 URL、账号、秘密或数据。
- 使用本地临时非超级管理员账号；验收后删除测试账号和容器卷。
- Chrome 记录版本、localhost URL、viewport、角色代码、操作结果和脱敏截图。

## 必验矩阵

1. 七个模板各复制为普通园区角色并分配独立账号；模板本身不可直接分配。
2. desktop 与 390px：角色页权限包预览、merge 保留额外权限、sync 显示删除项并二次确认、最终权限集合可展开。
3. 用户页显示当前与最终角色集合；模板、系统、内置、停用和跨 scope 角色不可选且不会被替换删除。
4. 正向：各岗位菜单、页面和允许动作；API/action 权限不进入菜单。
5. 负向：缺页面权限、缺动作权限、经办不能审批、审批不能发起经营变更。
6. 跨园区/跨租户返回非泄露式拒绝；空 building/floor/unit scope 返回空集合。
7. 停用角色、删除权限、切换账号后，下一次请求重水化授权；菜单与离线房产草稿缓存不保留已撤销能力。

浏览器门只有完成上述真实 Chrome 操作并保存证据后才能从 `BLOCKED` 改为 `PASS`。
