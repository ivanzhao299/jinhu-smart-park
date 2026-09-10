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
- shared build、API build、Web typecheck、Web lint PASS；定向 lint 清理原测试已有未使用变量后复验。Web build / PR CI / Release Smoke / main CI / 自动 Deploy：待记录，不作 PASS。
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
