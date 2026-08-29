# LEA 全链路上线后 UAT 复测与证据报告

## Context

LEA-001/002/003/004 已合并并部署。Issue #496 需要在隔离、可清理的环境中完成一次上线后全链路复测，并以报告 PR 固化证据。

## Requirements

- 验证 mode×用途矩阵：办公→长租候选→租约→active；办公→民宿拒绝并展示原因；住宅的住房与民宿链均正常。
- 验证 picker reasons/facet、改名后的菜单/权限显示名/无权限 403 全链。
- 验证住房 activate/terminate 与民宿 check-in/check-out 对 `rental_status` 的 10↔30 同事务同步，保存 DB 前后与业务审计证据。
- 抽查 G1-G7 与住房/民宿主链，确认本轮上线未回退。
- 全程执行 Phase 0/预检、独立浏览器、截图 manifest、Network 证据、表冻结、精确清理、teardown；不得记录敏感信息。
- 不直接操作生产数据库，不触碰主 Chrome、他人容器或 HR 范围。

## Acceptance criteria

- 每个矩阵项都有 PASS/FAIL 与可核验的浏览器/API/DB 证据引用；没有证据不得宣称 PASS。
- 390px 页面无横向溢出，改名菜单/标题可见，拒绝原因可见。
- 生命周期测试显示状态与审计成对提交；清理只作用于本轮 run-id 数据并有 teardown 证明。
- 报告 PR `Closes #496`，PR CI、merge、main CI/Deploy 均有终态记录。
