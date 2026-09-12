# 发布阻断：不可合并、不可归档

PR #733，产品提交 `86f56297e290d15228e785fa7fd80deb1cf1cd54`。
CI run https://github.com/ivanzhao299/jinhu-smart-park/actions/runs/34452434760 ：
- Detect Release Smoke Scope：SUCCESS，必要 Release Smoke 已实际触发。
- Lint, Typecheck, Build：SUCCESS（包含完整单元测试）。
- Release Smoke：FAILURE；其 property API E2E 后续步骤 SKIPPED，不作PASS。
- Tear down release smoke containers：SUCCESS。
- 开PR同时标签事件导致旧run34452433620被取消，该run不计通过。

失败：`Verify Yuzhou production import v2 PostgreSQL controls` 内
`pnpm test:e2e:yuzhou-production-import-full-chain:pg`：
`bind message supplies 14 parameters, but prepared statement "" requires 12` / SQLSTATE08P01。
定向根因：`scripts/e2e/yuzhou-production-import-full-chain-direct-pg.mjs:69–72` 的sys_org INSERT仍只有$1–$12，参数用3个scope值加 `Object.values(fixture.orgBeforePayload)`；`scripts/e2e/production-import-full-chain-test-fixture.mjs:16` 已有11个字段（含legacy_hierarchy_level、legacy_manager_reference），合计14参数。
前一文件在本PR与origin/main的blob均为 `575db564e7f40aed4423e0e8c6432638a4e3be8d`，无本专项diff。未修改任何HR文件，没有重跑同一已知失败，没有取消或豁免门禁。

按用户限定范围，等待独立授权的HR修复进入main后，再核对漂移并以正常分支更新，重跑必要CI与Release Smoke。PR保持打开；本task保持in_progress并标记blocked。未squash merge，因此没有本修复的main SHA、main CI或自动Deploy，生产清理不适用；不是PASS。
本地独占API/DB/Next/浏览器已关闭，compose容器/卷无残留，相关三个端口无监听；0600临时凭据文件已移除。见local-cleanup.json。CI清理见pr-ci-result.json及release-smoke-cleanup.txt。

代码review累计3轮：首批G1/G2；浏览器反馈修正；最终范围/请求不变量与发布前检查。后续只做上述门禁根因点验，未开始第4轮产品修改。

## Cost Summary
Task: Issue732 房产弹窗G1/G2
Status: BLOCKED / 未闭环，PR733未合并，未部署、未归档
Files changed: 产品6文件+交互测试1；既有专项工件及本次证据，HR/API/DB/CI源码0
Tests run: 13定向契约、5交互、shared/API/Web build、Web lint/typecheck、1440/390mock、隔离真实API链路PASS；PR verify PASS，Release Smoke FAIL
Retries: busy Escape产品2次；民宿409与表格布局各1次；环境及脚本修正见下方记录；远端失败重跑0
Approx model rounds: 本续作约100（含环境、证据和远端观察），既有COST_GUARD持续
Repeated scans avoided: 未重扫145文件；无子代理/浏览器基础设施重建；未重建同一DB或重复真实写入
Blocked issues: main既有HR full-chain PG测试参数14/12不匹配
Next step: 独立HR修复进入main后续跑必要门禁，再合并与核验自动发布，最后归档

---

# Issue 732 实施与验证（尚未发布闭环）

## 审核范围
G1+G2 / D01 D02 D03 D05 D06 已实施。G3 保留取消清空原因契约、失败留输入、原表单不被取消重置。G4/G5 仅非违规建议，不纳入漏项；D12 未改。
D11 在基线 563af3a1 的三个原始共享文件与最终实现下分别运行原 leasing/checkouts 路由：1440/390 均 childClosed=true、parentStillVisible=false。是既有 Drawer Escape 风险，不是本改动回归；未改 Drawer。

## 产品变更
- ConsequenceDialog CSS/Parts：native dialog 居中、16px 视口边距、20px 内边距、DS 字段/错误/action、长标识换行、内部滚动、closed display:none；隔离表格文字继承、按钮至少44px。
- 原因策略校验 trim 后上下界，模式切换 2–500；保留原 API/payload/权限/指纹。
- 民宿未到店/遗失接父层 busy/error；仅这两个动作的409将当前内容标记 stale，避免 conflict 分支卸载弹窗并丢失有效原因。
- 占用释放错误局部显示并 return false，无未处理 rejection；刷新仍由原 load 的页面错误呈现。
- busy 禁用全部控件时将焦点留在 dialog，并阻止 Escape 默认关闭；保留 native showModal/cancel 和单飞锁。

## 本地结果
- 13 项原状态/源码契约 PASS。
- 首次 interaction 命令带 `-- consequence-dialog` 实际跑完整 interaction 7文件16测试 PASS；随后精确 `NODE_ENV=test pnpm --filter @jinhu/web exec vitest run --config vitest.config.ts test/interaction/consequence-dialog.test.tsx` 5测试 PASS。
- shared build、API build、Web typecheck、Web lint PASS；定向 lint 清理原测试已有未使用变量后复验。Web build PASS；远端门禁结果见本文顶部，Release Smoke失败，不作PASS。
- types 初次缺 shared dist：确认 workspace 依赖 realpath 均在本 worktree，构建 shared 后通过；未修改依赖版本。
- 精确 vitest 初次忘设 NODE_ENV=test 导致 production React 测试失败，修正命令后通过；不是产品缺陷。

## 浏览器证据（mock，仅前端）
复用既有 Chromium 1234、独立 profile 和 /tmp/phoenix-pw-deps.kivq6l 运行库；没有重建浏览器基础设施或连接他人 Chrome。
- browser-audit / browser-focused：1440/390 原列表→详情→选择模式→失败重试成功；民宿未到店400及忙态；housing租约作废失败；Tab/Shift+Tab、关闭回焦、取消原因清空。
- browser-extended：1440/390 原路径、凭证遗失、人工占用释放、采购付款长内容，各400/403/409/network、本地 alert、保留输入、busy Escape、单次请求、成功关闭和 closed hidden。32项错误响应均模拟，不代表真实业务状态。
- 采购400px短屏内部 scrollHeight > clientHeight；200%采用宽度减半的等效CSS重排（720/195 CSS px），不是操作系统缩放或手机软键盘。检查横溢与滚动后 footer 可达。
- browser-finance：退款审批400、取消后金额50及原凭证仍在，原因重新打开为空；1440/390截图；桌面44px按钮断言。
- 无 pageerror；D11如上登记，不能记为父层保持PASS。
- 扩展脚本首次650ms响应计时疑似竞争，改显式挂起后仍复现连续busy Escape关闭；焦点从禁用按钮退到外部导致dialog键盘拦截不生效。两次产品修正（键盘拦截、busy焦点）后四类连续错误通过；停止继续扩展同根因。

## 隔离真实 API/DB 证据
独占 compose `jinhu-housing-uat-20260910-732`，数据库 `jinhu_housing_uat_20260910_732`，loopback PostgreSQL55432/API3418/Web3417。全新 migration、production seed、bootstrap、baseline、health、ready 成功；复用现有 property-api-e2e-fixtures.sql 创建隔离审批运行条件。所有凭据只在0600 /tmp文件，不纳入工件。
- bcrypt 缺原生binding（前期ignore-scripts）：pnpm rebuild没有执行安装；直接运行该依赖已有install脚本后恢复。没有重新初始化DB。
- bootstrap随机密码首次缺大写，补合规前缀；随后暴露同一bcrypt缺失，依赖恢复后成功。
- browser-real.mjs 不拦截任何请求，真实账号通过浏览器键盘登录，观察到POST。
- 占用释放501字得到真实400，原因长度501仍在，占用回读active；有效原因后201，回读released。
- 列表定位首次命中桌面/手机两个链接，停止在模式写入之前；改可见链接后以 `--mode-only` 续跑，未重复已完成的释放写入。
- 原路径模式提交201，唯一申请 `b0b55f57-21fe-447f-b4bf-e263c28b5f30`，回读pending_approval/not_started；经营模式提交前后均none，未批准、未执行、未改变配置。
- real-results.json 为合并后的已核验链路；real-release-results.json 保留首次失败中断记录，不能单独称整批PASS。

## 边界与跳过
真实业务验收覆盖模式创建/回读及修改caller占用释放失败/成功；没有宣称民宿、财务、采购或全部金融路径真实PASS。真实403/409/network故障没有人为破坏服务构造；这些反馈使用mock分级。触发点被删除后的回焦、真手机软键盘、所有145调用文件、全路径审批执行均未验证。无生产手动操作。

## Cost Summary
Task: Issue732 房产弹窗 G1/G2
Status: 代码及定向验收完成，发布门禁待验证
Files changed: 共享弹窗3、caller3、交互测试1及专项工件
Tests run: 上述定向/浏览器/真实API；发布门禁待记录
Retries: busy Escape产品修正2；民宿409修正1；表格继承布局修正1；环境与脚本定位错误分别记录，无盲重建数据库
Approx model rounds: 本实施约60工具轮；既有COST_GUARD持续
Repeated scans avoided: 未重扫145文件、未派重复代理、复用原浏览器及脚本
Blocked issues: 发布门禁尚未完成；D11既有风险保留
Next step: 精确提交PR门禁、必要Release Smoke、批准条件满足后squash merge及核验自动发布/清理
