# B-2c 写前预检报告

日期：2026-08-02  
结论：RETURNED / 继续禁止领域业务代码  
范围：架构合同、迁移 QA、代码接入地图；未运行 Docker、未修改业务代码。

## 已关闭项

- B-extension fixture 与 validation 已分别形成唯一 SHA并通过架构、QA 双独立复算。
- Current authority locator 已禁止 B-contract 与 approval runtime 的历史摘要值。
- 工作树中不存在 000191/000192；C2 v11 证明两套隔离库在正式 run 时亦未执行它们。

## 仍开放的 stop-ship

1. 审批 runtime 缺冻结合同要求的 command/projection ports；现有 draft/submit 分事务，
   无法形成领域 pending 与 approval request 的同事务边界。
2. Task production source registry 固定为空且没有安全 composition seam，领域 resolver
   无法进入 PropertyTaskModule 的单一 production registry。
3. 民宿/住房 stop-ship 只在全局 HTTP guard，功能开关关闭时可放行，service 内部调用
   仍可能直执高风险事务。
4. 九个高风险 controller 尚未同时声明 `property_approval:create` 权限。
5. 000191/000192 仍缺当前目标数据库双 history 重扫与唯一 schema owner 正式 reservation。

前四项属于 runtime/change-request 回补，独立 Gate 通过前不得交给 homestay/housing owner
写 adapter。第五项只允许进入 reservation，不允许先创建 SQL。

## 进展更新

- 2026-08-02：第 3、4 项已通过独立门禁并关闭。唯一 runtime grammar SHA 为
  `188b38ddd7f9670d0498b51935c438f57452469a3e535b7d94fce6717eb8af0a`，
  handoff SHA 为
  `0e02572bb66f560961b9c697cc4713aae05a7339e739f3e2e7aab2a09a3def35`；
  独立复算 `P0/P1/P2=0`。
- 2026-08-02：第 2 项 task composition 已完成重签并通过架构、QA 双独立门禁。
  Shared grammar SHA 为 `af7ddf1462e31a7961324a75a12723a411c56a5e7bef3a0c98f400483b9e2f0d`，
  runtime SHA 为 `3256cdf11095f79b3a5bdbca12bafd72c55f3a4f679d240ea1e6eb7d71a95fe7`，
  final signoff SHA 为 `debaab4cda018f31083b5efd58b9bec0d8049e1b140166f759084b440b4bfaaa`；
  `productionEnablement=false`。
- 2026-08-02：第 1 项的合同、shared 与 runtime 代码门禁已通过双独立复审。当前合同
  SHA 为 `5ceaf6db80628e83a21bef12c25ed39aac952857b35e1f37f2b8522ef53a4a55`，
  shared v3 SHA 为 `fa76110b3329225d8c435c57697c226de5466f8110017d016ebe894080bf2eb6`，
  runtime v4 SHA 为 `4c8ea26dcb13379f4c83731dc2acf8d1a5331336f401301f855418c5f5c4d5ae`。
  真实 PostgreSQL Gate 尚未运行，必须先交付 000197 active-source index forward-fix；
  当前仍为 `SCHEMA-BLOCKED / PG NOT RUN / non-current`。
- 第 5 项及 approval PostgreSQL promotion 仍开放；领域业务 adapter 继续 blocked。
- 2026-08-02：000197 formal preliminary run `b2c197_prelim_20260802a` 在 A/B 成功
  应用迁移并完成数据库动态子门禁后，于 target A 的 approval-port PostgreSQL child
  非零退出。执行器未在抛错前持久化 stdout/TAP，底层 root cause 必须保持 UNKNOWN。
  FAILED artifact SHA 为 `452507c796060409a3e251100c35985f9a5d356a53e431db47df456f83a3244b`；
  A/B 双 history 均为 exact succeeded、无 build residue，但只可保留给
  `197-first -> later 191/192` 证据，严禁 absent-path retry。新尝试必须先修全子进程
  证据持久化与 run-scoped PG fixture，并使用新 runId、新容器/匿名卷和新授权链。

## 固定执行顺序

1. 唯一 schema-migration-owner 完成全 worktree、保留 reservation 与两张 history 扫描，
   正式预约并交付 `000197_property_approval_active_source_index_forward_fix.sql`，通过独立
   PostgreSQL Gate 后执行 approval runtime v4 的真实 PostgreSQL Gate。
2. Approval PostgreSQL Gate 通过并发布 current authority 后，同步扫描工作树、migration
   目录和两张 history，整批预约
   `000191_homestay_approval_effect_expand.sql` 与
   `000192_housing_approval_effect_expand.sql`。
3. 串行完成 000191、000192 各自独立 PostgreSQL Gate 与 handoff。
4. Property-foundation owner 仅实施 mode transition/force release adapter并独立签署。
5. 两份 schema SHA 与 adapter SHA 全齐后，才并行启动民宿/住房领域 API lanes。
6. 最后由唯一 integration owner 修改 AppModule；B-3 继续保持封锁。
