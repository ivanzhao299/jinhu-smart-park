# Issue740 最终逐文件矩阵

39文件；本轮3文件，其余36按相同hash继承预审，未重复审查。source hash：`8e7617c2f811e0a48a7588145c973b6f497e021a60f4b2be37751233b1758221`。完整固定15项状态见acceptance-matrix.md。

| 文件 | 结论 | 依据与边界 | 最终SHA256 |
|---|---|---|---|
| `apps/api/src/modules/homestay/homestay-finance-currency.pg.spec.ts` | 继承预审/保留所述边界 | V06：随机 schema 合成币种，refund/waiver 零效果及合法执行；有限集成边界。 | `f95bc9decfebbfb7194e46b383f195d458efba517ccb5bb700fddf55c7cbd6fe` |
| `apps/api/src/modules/housing/housing-approval-executors.pg.spec.ts` | 继承预审/保留所述边界 | V04/V05：既有事务集成追加合成 USD mismatch，全领域快照相等；不等于真实非 CNY API 验收。 | `4fe922c318e2f65476da4e703ba9f4be868702aef70d6584a3c096a4d842f61e` |
| `apps/api/src/modules/housing/housing-finance-approval-balance.spec.ts` | 继承预审/保留所述边界 | V01：public approved execution 余额拒绝零写、正常单效果，直接 policy 409 response 兼容。 | `a18931a4aabf0e5f0a3c9e45ae14d4db85056aa57245715c41cc40c07f8f35e9` |
| `apps/api/src/modules/housing/housing-finance-approval-snapshot.spec.ts` | 继承预审/保留所述边界 | V01：refund/waiver/deposit-refund 全快照谓词漂移，SQL 错误对象/CAS 不重新分类。 | `96ff626c28b0908832db1b28d9e2ccbb903c53fe44d387eeb440d8065a094854` |
| `apps/api/src/modules/housing/housing-finance-command.service.ts` | 继承预审/保留所述边界 | V01：只在已批准执行快照/精确余额错误处分 business；原 SQL、CAS、锁顺序未改。 | `19bcc4de31d2dc8c470f001a866bdde34a9097ca73f16ef53c2b720693f4a11a` |
| `apps/api/src/modules/housing/housing-finance.policy.ts` | 继承预审/保留所述边界 | V01：专用余额异常仍继承 ConflictException，直接调用 HTTP 409/message 保持。 | `e4c3147c92dcac3c9d3f689988d64a55008812bd67ff0bc26ef5cac94dae4863` |
| `apps/api/src/modules/housing/housing-lease-approval-executor.service.ts` | 继承预审/保留所述边界 | V10：已锁且存在的租约版本漂移先 business；缺失/状态/CAS 与 checkout 前置校验保持。 | `0f2b3202e1b85777f8dd2dfb6a2dffd4117365f967b41b86a1f3600ac51ff018` |
| `apps/api/src/modules/housing/housing-lease-approval-version.spec.ts` | 继承预审/保留所述边界 | V10：67 例三动作版本/状态/前置/SQL/CAS；仅 void 有新增 stage-z R。 | `683e0a1c4cc61e5e55f98225e7e854f0767557724d705d2deb29c811b44bac02` |
| `apps/api/src/modules/housing/housing-purchase-approval-executor.service.ts` | 继承预审/保留所述边界 | V04：只改已锁 lease 版本漂移分类；币种、缺失、状态和 item/receivable CAS 不扩大分类。 | `94df8cafc1e32ec02b8f99f8be80694262df113c2a8f197655a9cbbacaa5fccc` |
| `apps/api/src/modules/housing/housing-purchase-approval-version.spec.ts` | 继承预审/保留所述边界 | V04：合法状态/版本漂移/缺失币种/CAS 和数据库错误对象边界。 | `415180a2c94c45bce0745225f0d6f788b345dc01c0d08012786d72983634e154` |
| `apps/api/src/modules/property-approvals/property-approval.execution.spec.ts` | 继承预审/保留所述边界 | V01/V03/V10：显式 business 终态；40001/40P01 含 driverError 保留 infra，零 receipt/outbox。 | `af91c0fdfb1240a5aaabc74ab6789adf56c83befa1fc7b76bdf3745a66d84bde` |
| `apps/api/src/modules/property-operations/property-occupancies.service.ts` | 继承预审/保留所述边界 | V03：已锁 occupancy 版本漂移 business；scope/source 校验和 release CAS 保持。 | `fd843b82114dc7f915c39f53557437f75c321a2607f2ec9f520c46f5593b2691` |
| `apps/api/src/modules/property-operations/property-occupancy-approval-version.spec.ts` | 继承预审/保留所述边界 | V03：版本漂移零领域写、匹配 release/audit，其他谓词/SQL 维持。 | `4afba9a55e9b1b870eaba9e7432af9863a0695f7a989b311a9e24a6f0585542a` |
| `apps/api/src/shared/services/idempotency.service.pg.spec.ts` | 继承预审/保留所述边界 | V11：产品 TypeORM 真实 lock wait、winner commit/cache/rollback、RR、非目标 unique、deadlock、TTL/cleanup；10/10 复用主助手已核 PG，不重跑。 | `2e7eb48a8067c8a6781ad4733406af15a58a21fb3963903f4d3928f9cf62d9be` |
| `apps/api/src/shared/services/idempotency.service.spec.ts` | 继承预审/保留所述边界 | V11：替身匹配精确 constraint；首次竞争模拟仅单元证据，真实竞争以 PG/R 为准。 | `aa86cc062e7848b70a6a2c3710a24547343b45aab54b4673a193cc53a0642357` |
| `apps/api/src/shared/services/idempotency.service.ts` | 继承预审/保留所述边界 | V11：精确 ON CONSTRAINT；READ COMMITTED 下一语句锁定并 TypeORM 水合。非目标 unique/40001/40P01 不吞；cleanup gap 409。TTL 无 owner fencing 为既有保留边界。 | `9d31d13856062aa91841a97e97bad4c408e5ea266771acbae99cb877bd2ca642` |
| `apps/web/app/homestay/_components/HomestayDetailClient.tsx` | 继承预审/保留所述边界 | V06/V14：stay no-show 授权 fallback；check-in/out 409 保层，caller 标题回焦；未改业务 payload。 | `d83742b7c6e65d885c45c329ac862a8b7cf9ec35fcd92d31560af1cb8bedbd2b` |
| `apps/web/app/homestay/_components/HomestayStayActions.tsx` | 继承预审/保留所述边界 | V06/V14：lost/no-show 仅传所属标题 fallback，原确认/原因/权限不变。 | `9ca7c776a008e713d758bf77d0bb76b9ebe59df4e85f996526ffb1fd63cfb5ba` |
| `apps/web/app/homestay/_components/homestay-detail-query.ts` | 继承预审/保留所述边界 | V06：仅 stay+booking-read+404 fallback，返回 no_show 才接受；403/其他状态原错误保留。 | `bc1c771045b3c3707131ec04a8bbd07163da650ce6f6f50bdd8aee37b31142c0` |
| `apps/web/app/housing/_components/HousingCollectionPage.tsx` | 继承预审/保留所述边界 | V12：新增可选 completionFeedback/stale gating，其他调用默认保持。 | `234d7e02cf079c1cf1117680d9bb3816ff05df8f901f974d855605d1f721100b` |
| `apps/web/app/housing/_components/HousingCollectionView.tsx` | 继承预审/保留所述边界 | V12：receipt 放在 PageState 外；仅 opted-in 消费者非 ready 隐藏行动作。 | `90e9d943d078e7a6206f70064e919025cb17adc18971cceeb2377b838ba1cee5` |
| `apps/web/app/housing/_components/HousingCostSurfaceClients.tsx` | 继承预审/保留所述边界 | V12：finance scope remount；回执由父级持有，不随行卸载丢失；相同 scope 分页保留。 | `3eea1c218ba031922498195cfad8cd9c79ebe29e81d3bb228d78a1d9d1c500e6` |
| `apps/web/app/housing/_components/HousingFinanceActions.tsx` | 继承预审/保留所述边界 | V12：POST 成功先发布回执再 reload；失败保表单，idempotency key/payload 不变。 | `fa2cf7c3c566eb8f6c12a44ace1fd46ce1db963bac4fb9d83adf1c406ca471d1` |
| `apps/web/app/leasing/checkouts/page.tsx` | 本轮已修/待独立review | V12已修待独立review：选择代次+请求捕获隔离；持久回执/stale/payload保持；DS直接按钮数组；15组件case和两宽度B。 | `7a822792c36d32d3baa695b72f9cfbdec9177cb3b8bb3e15b6add96a9e071866` |
| `apps/web/app/leasing/contract-changes/page.tsx` | 继承预审/保留所述边界 | G5/V14：Drawer 内 alert 与编辑清错；局部 table CSS，不改 payload。 | `b748fb718ed653679c1b9a547ebec52a9798e7cc0093b377ff8caba13566b698` |
| `apps/web/app/leasing/contracts/page.tsx` | 继承预审/保留所述边界 | G5/V14：首 prompt 取消早返回，保留双字段 payload；局部 table CSS。 | `c21192961ae05c14d1e85dcc54ca66a61b03cde494f0eb2fbaa2e06fdac9298b` |
| `apps/web/app/leasing/leasing-record-actions.module.css` | 继承预审/保留所述边界 | V07/V14：三 leasing 列表局部动作换行/移动列尺寸；未新增颜色按钮系统。 | `73aea2149ccbec175d908d27d9a1ab0c4d61be81df5926dda0bfd5bd99a21acf` |
| `apps/web/components/property/PropertyApprovalClient.tsx` | 继承预审/保留所述边界 | V12：requestId+完整 capability scope key remount；sequence 抑制旧 GET，POST成功独立回执，stale 禁动作；后端 allowedActions 仍权威。 | `3e8ccd5a8e5975da5bc47fac0378d124e1f794fe3d727b04284d458cdc71899f` |
| `apps/web/features/property-shared/dialog/ConsequenceDialog.tsx` | 继承预审/保留所述边界 | D11/V14：原生 Escape 所属层截断；busy preventDefault；Tab 排除子 dialog/inert；关闭回焦重验连接/disabled/可见性及 active modal。busy 焦点仍依赖浏览器 native inert，jsdom 不能替代。 | `8fc0e0da20e37e8dddfb0cb2a2fdee6310729c0fc788f10dfe7051a58d8eb472` |
| `apps/web/features/property-shared/dialog/dialog-contract.spec.ts` | 继承预审/保留所述边界 | D11：删除旧 trigger.focus 文本匹配，由 mounted 回焦断言接替；不是删除行为要求。 | `737a722b101e15a382bae29207115227c95e278aef5b5f5b31916d7f640f8760` |
| `apps/web/features/property-shared/dialog/useOwnedScrollLock.ts` | 继承预审/保留所述边界 | D11：opt-in symbol owner，最后 owner 恢复原 overflow/priority；不覆盖后来外部 important 锁。 | `99d754fbc1131815db93d4c3e05db9d0cb3c04df2a368475b13cb1dfe58f66ea` |
| `apps/web/test/interaction/consequence-dialog.test.tsx` | 本轮已修/待独立review | V14 act定向定位：await textarea change提交、busy rerender及异步release；13/13，无warning。 | `8637523c211a5efab51cdef35bc0f11a4e199cb18e5918104cb644d7e4e8e193` |
| `apps/web/test/interaction/drawer-ownership.test.tsx` | 继承预审/保留所述边界 | D11：4 例 StrictMode、父子初始挂载、callback 更新、non-dismissible/defaultPrevented/unmount。 | `c06818e5b6fcfb78ddd59452367555feda1db0d4b64d120d7ce1a97d92bc2330` |
| `apps/web/test/interaction/homestay-detail-query.test.tsx` | 继承预审/保留所述边界 | V06：5 例真实 helper/API mock 权限与状态边界。 | `05b7d7a48e977494d5ff06953c880eaeab5e8c5c404394323353b2679438be94` |
| `apps/web/test/interaction/housing-finance-refresh-receipt.test.tsx` | 继承预审/保留所述边界 | V12：4 例成功+GET失败/删除行/POST失败/换scope；不证明真实金融单效果。 | `9bcf50f892c2335280168358c7523fb66232bb58ffbe28605965f7261e9a151d` |
| `apps/web/test/interaction/leasing-checkout-refresh-receipt.test.tsx` | 本轮已修/待独立review | V12正式15/15：原8项+7选择生命周期；包含旧checkout-retarget反例、late GET/scope/同A恢复、payload与草稿断言。 | `36ea826ec21fda1277959e45c72f1fdf4ae69f4f54e1c802f3a3e2f0cb88346e` |
| `apps/web/test/interaction/property-approval-refresh-receipt.test.tsx` | 继承预审/保留所述边界 | V12：8 例三动作、原因保留、初次失败、requestId/迟到 GET 和 scope remount。 | `6529de5bbaeecc6e13177f0841ceb04aaa480d0efbae35e2f096e2d0c49b97db` |
| `packages/ui/src/components/Drawer/Drawer.tsx` | 继承预审/保留所述边界 | D11/V14：每个 mount 注册一次，layout effect 更新 callback；业务/API/权限未进入 UI 包。 | `3e74d671c4034a3f07dcfdf910b24dba90b3f6f9f6f6a5fa178b68ad78ded61e` |
| `packages/ui/src/components/Drawer/drawer-escape-owner.ts` | 继承预审/保留所述边界 | D11/V14：每 Document 一个监听，父排子下，最后连接 owner；native :modal 优先；非关闭顶层不穿父；不是全局 focus trap。 | `037b3ec45fc398f483f81a237d27b2dc460c638fbe51b73f605ba832f94e28b4` |
