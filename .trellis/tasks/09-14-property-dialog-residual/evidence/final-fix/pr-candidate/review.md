# Issue740 Draft PR 审查入口

关联 #740。主助手已核对 final-fix 选择代次核心逻辑，认可限定修复进入 CI；这不是最终可合并结论。**V02 真机 OPEN，最终主助手 review 待完成；V15 以 PR 正文中 exact commit SHA 的 verify 和实际 Release Smoke 为准。**

## 可访问证据

- [逐文件范围和39个源码hash](review-matrix.md)、[最终源码封存](source-seal.json)、[固定15项状态](acceptance-matrix.md)。
- [命令与exit](commands.json)、[49/49交互测试](interaction.log)、[lint](lint.log)、[测试lint（成功空输出）](test-lint.log)、[typecheck](typecheck.log)、[build](build.log)。这些是本次commit之前已封存的本地运行，源码hash匹配，不冒充新SHA的CI。
- [原选择错配反例](inherited-checkout-retarget-failure.log)、[act根因trace](act-origin.log)保留失败背景；[当前浏览器12例](browser.json)、[执行脚本](browser.mjs)、[稳定截图补采4例](browser-capture.json)记录修复后结果。
- [1440px B刷新](B-refresh-1440.png)、[390px B刷新](B-refresh-390.png)、[1440px新建刷新](create-refresh-1440.png)、[390px新建刷新](create-refresh-390.png)。真实构建页面，但API与身份均合成；0真实金融写。遮罩后刷新由DOM click触发handler，不能证明真实指针可达，也不是手机软键盘/触摸验收。
- [历史R与PG验证摘要及限制](inherited-validation-stage-z.md)、[历史归档回执](inherited-archive-receipt.json)。原始R材料仅本地私有封存，未提交、未远端持久化；摘要不等于可独立复验的原始R证据。

## 提交准备审查

逐文件核对39个源码/测试与已有review矩阵，原内容hash全部匹配；聚合SHA256为 `8e7617c2f811e0a48a7588145c973b6f497e021a60f4b2be37751233b1758221`。本轮不改产品或测试，仅整理精选副本。已逐张检查4张合成截图。源码凭据候选为环境变量读取、接口字段或明确测试值；证据不包含真实凭据。最终暂存检查和CI结果记录于PR正文。

原 commit-files.txt 在本地未随整个task提交，以下内嵌其完整67路径白名单作为远端可访问清单。manifest记录精选副本最终字节hash及整理前hash；原封存不改。

<details><summary>显式 stage 白名单：39代码/测试 + 28精选证据</summary>

```text
apps/api/src/modules/homestay/homestay-finance-currency.pg.spec.ts
apps/api/src/modules/housing/housing-approval-executors.pg.spec.ts
apps/api/src/modules/housing/housing-finance-approval-balance.spec.ts
apps/api/src/modules/housing/housing-finance-approval-snapshot.spec.ts
apps/api/src/modules/housing/housing-finance-command.service.ts
apps/api/src/modules/housing/housing-finance.policy.ts
apps/api/src/modules/housing/housing-lease-approval-executor.service.ts
apps/api/src/modules/housing/housing-lease-approval-version.spec.ts
apps/api/src/modules/housing/housing-purchase-approval-executor.service.ts
apps/api/src/modules/housing/housing-purchase-approval-version.spec.ts
apps/api/src/modules/property-approvals/property-approval.execution.spec.ts
apps/api/src/modules/property-operations/property-occupancies.service.ts
apps/api/src/modules/property-operations/property-occupancy-approval-version.spec.ts
apps/api/src/shared/services/idempotency.service.pg.spec.ts
apps/api/src/shared/services/idempotency.service.spec.ts
apps/api/src/shared/services/idempotency.service.ts
apps/web/app/homestay/_components/HomestayDetailClient.tsx
apps/web/app/homestay/_components/HomestayStayActions.tsx
apps/web/app/homestay/_components/homestay-detail-query.ts
apps/web/app/housing/_components/HousingCollectionPage.tsx
apps/web/app/housing/_components/HousingCollectionView.tsx
apps/web/app/housing/_components/HousingCostSurfaceClients.tsx
apps/web/app/housing/_components/HousingFinanceActions.tsx
apps/web/app/leasing/checkouts/page.tsx
apps/web/app/leasing/contract-changes/page.tsx
apps/web/app/leasing/contracts/page.tsx
apps/web/app/leasing/leasing-record-actions.module.css
apps/web/components/property/PropertyApprovalClient.tsx
apps/web/features/property-shared/dialog/ConsequenceDialog.tsx
apps/web/features/property-shared/dialog/dialog-contract.spec.ts
apps/web/features/property-shared/dialog/useOwnedScrollLock.ts
apps/web/test/interaction/consequence-dialog.test.tsx
apps/web/test/interaction/drawer-ownership.test.tsx
apps/web/test/interaction/homestay-detail-query.test.tsx
apps/web/test/interaction/housing-finance-refresh-receipt.test.tsx
apps/web/test/interaction/leasing-checkout-refresh-receipt.test.tsx
apps/web/test/interaction/property-approval-refresh-receipt.test.tsx
packages/ui/src/components/Drawer/Drawer.tsx
packages/ui/src/components/Drawer/drawer-escape-owner.ts
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/B-refresh-1440.png
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/B-refresh-390.png
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/acceptance-matrix.md
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/act-origin.log
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/browser-capture.json
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/browser-capture.log
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/browser.json
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/browser.log
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/browser.mjs
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/build-before.json
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/build.log
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/commands.json
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/create-refresh-1440.png
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/create-refresh-390.png
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/inherited-archive-receipt.json
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/inherited-checkout-retarget-failure.log
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/inherited-source-seal.json
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/inherited-validation-stage-z.md
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/interaction.log
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/lint.log
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/manifest.json
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/preservation.json
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/review-matrix.md
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/review.md
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/source-seal.json
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/test-lint.log
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/typecheck.log
.trellis/tasks/09-14-property-dialog-residual/evidence/final-fix/pr-candidate/web-process.json
```

</details>

## 历史 final-fix 交付记录

以下“未提交/待review”等描述是当时的快照；本次授权与门禁状态以上方入口和PR正文为准。文中 source-seal、acceptance-matrix、日志均指此精选目录；pr-candidate/commit-files 的本地操作入口已由上述可点击链接及完整内嵌白名单替代。

# Issue740 V12 定向修复交付

三处批准修复完成，待主助手独立最终复核。未提交、未 push、未 stage；固定15项不扩，V02/V15仍OPEN。本轮只改变1个产品文件及2个正式测试文件，其余36个候选源文件与最终预审一致。

## 修复与证据

- checkouts：完成同步指针携带选择代次；load发起时捕获该指针，回包后同时验证请求序号、指针身份与选择代次。openCreate/openEdit/Drawer关闭（含取消、Escape、删除后关闭）切断旧同步资格，不清空完成提示。当前完成对象不在刷新结果时保留对象并维持stale禁写，避免草稿配空target转成新建。原确认结算/生效payload、持久回执、scope remount与同步金融锁保持。
- DS：renderActions改成有key的按钮数组。DataTableActions给直接子按钮加className，桌面flex-wrap与手机直接按钮布局保持；没有新增包裹按钮的视觉容器，没有修改共享DataTable。
- act：定向临时trace定位React act→RTL eventWrapper→user-event prepareDocument blur/change路径。busy effect把焦点从textarea移走时，user-event的待提交change进入内部同步act；仅await rerender不足。测试先await user.tab提交输入再await busy rerender；异步确认release也正常await act。无console吞噬；临时依赖插桩在finally恢复，正式验证使用原依赖。

正式checkout回归由8增至15：A完成→B→刷新、A完成→新建→刷新、晚到GET→B/新建、关闭重开同A切断旧生命周期、同A正确同步、scope替换后旧GET隔离。保留原失败回执、stale两金融动作禁用及POST失败契约，断言草稿与目标一致且仅原payload的一次mock写。

## 本轮验证

- before-dev/check执行：读取task PRD/design/implement、Web规范与共享operations指南，检查本轮三文件及原白名单hash。
- 精确6文件Vitest：49/49通过，最终日志无stderr、Fragment或act warning。
- `pnpm --filter @jinhu/web lint`、`pnpm --filter @jinhu/web exec eslint test/interaction/consequence-dialog.test.tsx test/interaction/leasing-checkout-refresh-receipt.test.tsx`、`pnpm --filter @jinhu/web typecheck`均exit0。
- `pnpm --filter @jinhu/web build`仅一次，exit0；保留既有Next ESLint plugin配置提示，不扩修工具配置。旧构建hash已另存，原3427 Web重启一次。API/DB容器与PID均保持，Web/API health/ready均200。
- 真实production-mode Web+专用Chromium，1440/390共12个B case通过，0页面错误/0console warning或error；B刷新、新建刷新、晚到B/新建、关闭重开A、同A恢复均覆盖。另4次只补采稳定动画截图，结果通过；人工查看4张图，字段/目标一致、手机无文档横向溢出。全部API由mock route处理，无真实结算/生效写。刷新按钮在Drawer遮罩后，脚本用DOM click执行真实刷新handler，明确不是可达的真实指针动作。scope生命周期用正式组件回归证明。
- 首轮B脚本label精确匹配被textarea默认文本影响而超时，运行中止exit130；只修选择器后重跑。原日志保留本地。首轮等待过程中有CSS preload warning，不属于Fragment/act；成功run日志与4个截图补采run均无console输出。
- `git diff --check`通过；1164个旧证据文件SHA256逐一相同。原35MB目录与私有归档不提交，不覆盖。最终39文件source hash见source-seal.json，算法为排序的path+TAB+SHA256+LF。

## 验证边界和交接

未重复PG10、四金融竞争、真实已完成结算、生效及旧失败；API/共享模块未变，沿用最终预审和stage-z证据。未执行HR、生产、protected-role写、设备探测或CI豁免。未重跑完整仓库测试/CI：本轮仅Web三文件变化，正式verify与实际Release Smoke必须由主助手在最终提交SHA上运行，不能以dirty bytes本地结果替代。V02没有手机重连，仍需真实软键盘/触摸验证，不豁免真机。

精简可提交材料在pr-candidate；commit-files.txt列39个代码/测试文件及明确精选证据，禁止git add整个task目录。精选包含脱敏日志、原失败反例、新结果/脚本、39行最终hash矩阵、固定15项矩阵及4张仅合成数据截图。完整历史证据仍仅在本地私有归档，归档ID/hash可追溯，不声称远端持久化已完成。

## Cost Summary

Task: Issue740 V12/Fragment/act精确修复
Status: 本轮完成待独立review；V02/V15 OPEN
Files changed: 1产品+2正式测试；新final-fix及精选证据；原39候选中36字节未变
Tests run: 精确49/49；Web lint+测试lint+typecheck；Web build一次；B12/12+稳定截图补采4/4；diff check；1164旧证据hash
Retries: 产品根因1次成功；act修复2次（第二次前定向trace审计）；B选择器1次；截图动画补采1次；真实金融重写0
Approx model rounds: 约40轮，单agent，COST_GUARD
Repeated scans avoided: 无全仓普查、无PG/金融旧成功重放、无手机探测、无重复build
Blocked issues: V02真机；V15最终SHA正式verify/实际Release Smoke；完整历史归档尚无远端持久副本
Next step: 主助手按白名单独立review，后续正常commit/push/CI；本worker不执行
