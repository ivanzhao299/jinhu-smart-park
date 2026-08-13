# Validation Log

Date: 2026-08-12

## Passed

- `pnpm -r lint`（Linux Node 22 容器）
- `pnpm -r build`；API Nest build 与 Web Next build（169 routes）
- shared build + 全量 shared test：28/28
- API typecheck；PR262 定向 API tests：19/19；角色复制/作用域补充组：11/11
- Web typecheck；system unit tests：46/46
- Track-B seed source contract、PR262 role-template source contract
- `git diff --check`
- `task.py validate`：implement/check JSONL 均通过
- 隔离 PostgreSQL 首轮空库完整 207 migration：双历史/checksum/prerequisite 全部 succeeded
- production seed 首跑、兼容修正后重跑：7 模板 version 均为 1；87 permission links、7 current_park links 均无版本漂移；25/25 visible 正确；双历史差异 0
- Windows Chrome 151 `--headless=new` + 随机 CDP 端口 + 独立临时 profile：
  管理员角色/用户页 desktop 与 390px，以及七个非超级岗位角色 desktop/390px
  共 14 个工作面；预期路由和文本均命中，无 403/无权访问，无横向溢出。证据见
  `evidence/chrome-cdp/`。

## Limited / Blocked

- API 全量 unit：1173 项中 1159 pass、13 skip、1 fail。唯一失败是 Node 容器无法解析宿主 worktree `.git` 绝对指针，`git rev-parse HEAD` 报 non-repository；相关 PR262 定向测试全部通过。
- 最终 000207 将 visible metadata 更新改为不增加 permission definition version 后，第二次从空库完整 runner 已启动但耗时较长；首次完整 runner 和修正后 source contracts 均通过。
- release-smoke 与 first-release 浏览器链路尚未完成。
- 原 Windows Computer Use 初始化限制已由直接 CDP 隔离方案绕开。真实 Chrome 门为
  `PARTIAL PASS`：merge/sync 写入、maker/checker 403、停用后的授权重水化和离线
  IndexedDB 清除已通过；跨 scope 真实目标拒绝与用户管理抽屉实际保存仍待完成，
  见 `browser-handoff.md`。
- Chrome 验收发现并修复：权限包预览 POST 原先遗漏 `X-Idempotency-Key`，真实 API
  返回 400。Web 现使用 `role-property-bundle-preview` 专用幂等键，并增加源码契约测试。
- 修复后 Web system unit 46/46、Web typecheck、Web lint 均通过。
- 2026-08-13 最终 Chrome 门：跨租户、跨园区真实角色目标均返回统一 404 且不泄露
  目标名称；用户管理抽屉实际保存最终集合 `S1_NORMAL + PR262_USER_ASSIGN`，截图与
  `final-gates-summary.json` 已保存。浏览器门由 `PARTIAL PASS` 更新为 `PASS`。
- 浏览器专用数据库按 SQL 顺序快速装载，并明确跳过依赖正式 migration history
  阶段审计的 production seed `000008`；该快捷库不计作正式迁移/seed 质量门。

未访问生产 URL、账号、秘密或数据；未 push、未创建 PR、未合并、未部署。
