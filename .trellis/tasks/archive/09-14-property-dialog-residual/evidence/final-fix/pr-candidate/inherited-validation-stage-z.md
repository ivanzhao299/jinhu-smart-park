# Stage Z 历史有效证据摘要（精选脱敏版）

此摘要继承此前主助手核验的隔离 UAT 结果，本次提交准备没有重跑真实业务写入。原报告与原封存不改。当前状态见 [review.md](review.md) 和 [固定15项矩阵](acceptance-matrix.md)。

## 真实服务与数据库结果（R）

| 范围 | 历史观察 | 边界 |
| --- | --- | --- |
| V11 四次首次金融竞争 | housing refund/waiver、homestay refund/waiver：每项两客户端首次 HTTP 201/409；每次 claim 一胜一拒；每项最终 executed、1 attempt、1 ledger、1 receipt、1 outbox | 隔离真实 API/DB，新请求/key；没有重放旧500赢家和六个旧失败。每项金额1.00，最终余额包含两次新效果，不能当作各步骤的即时余额 |
| V10 lease void 版本漂移 | 正式创建→申请→第二客户端合法推进版本→approve/claim/execute一次；execution_failed/business/approval-source-changed；attempt=1，receipt/outbox/领域审计为0，领域整行不变 | 只新增 void 的真实执行证明；approve/checkout 只补单测，不称三动作全R |
| V09 跨 scope | 三个有效非 super actor 的 L01/O01/A01 读写均404，原对象及审批整行不变 | 当时仅通过合法管理 API 配置可编辑测试角色；本次不改任何角色。其他映射继承更早证据 |
| V13 leasing 两动作 | X阶段真实结算/生效成功结果继承 | 本次没有再次真实结算/生效；当前浏览器样本全部 mock |

原始 DB/身份/凭据、完整请求与行数据不进入 Git。以上是历史审查摘要，远端读者不能仅凭摘要独立复验原始 R 数据；原材料仅本地私有封存，尚无远端持久副本。归档标识、字节数与 SHA256 见 [归档回执](inherited-archive-receipt.json)，回执不等于已上传证明。最终主助手仍需完成证据 review。

## 历史测试结果

| 验证 | 命令/范围 | 结果及限制 |
| --- | --- | --- |
| 幂等 PG | node --test --require ts-node/register src/shared/services/idempotency.service.pg.spec.ts；DATABASE_URL由私有环境传入 | 10/10，0 skip：真实等待/commit/cache/rollback，40001/40P01、非目标23505、TTL等值、cleanup gap409、TypeORM水合。测试内随机schema合成夹具，非生产 |
| API相关回归 | node --test --require ts-node/register；approval.execution、housing executor PG、finance balance/snapshot、purchase version、occupancy version、homestay currency PG | 127/127，0 skip；币种是合成fixture，无合法非CNY公开入口，不扩称真实非CNY API验收 |
| lease/version 与幂等 | 同node runner；lease-version、idempotency unit/PG | 原82项通过；与其他组重叠，禁止相加为唯一测试总数 |
| Web | 三消费者、dialog、Drawer、detail-query | 当时42项通过；当前49项日志见 [interaction.log](interaction.log)，取代旧 checkout 反例结论 |
| 类型/lint/build | API/Web typecheck、定向eslint、各一次build | 历史最终通过；当前Web命令及exit见 [commands.json](commands.json) |

当前源码封存见 [source-seal.json](source-seal.json)，预审封存见 [inherited-source-seal.json](inherited-source-seal.json)。两者只三文件不同，不能用最终hash冒充旧测试运行时hash。幂等TTL无owner fencing、leasing页面级回执和有限币种边界仍保留。

## 历史引用修正

原精选副本把 final-review.md、evidence/stage-z/*、v10-lease.json、real-effects-readback.json 等当作相邻文件，但这些原始材料没有随PR提交。此版移除这些失效入口，改为上面的可直接阅读摘要、同目录可访问封存及日志链接；不伪造可下载的历史原始证据。原报告全文仅在本地封存，字节未改。

V02 真机软键盘/触摸 OPEN；390px浏览器不能替代手机。本次手机探测0。V15 等待最终提交SHA的verify与实际Release Smoke，任何skip均不算通过。UAT保留，不部署、不merge、不关闭Issue。
