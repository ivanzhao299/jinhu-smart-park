# 实施计划

1. 抽取统一、串行化的 asset scope provisioning；TenantsService create/updateLoginSettings/assignModules、SaaS tenant-module assign/enable 及 AssetsService createPark 共用同一 tenant/park 事务锁，确定唯一有效园区来源、拒绝重复投影、恢复 disabled 投影，并初始化 12 controls/24 audits。
2. 扩展 000194 classifier 的严格 seed-reconcile 状态。
3. 更新 production seed 000007 的动态租户修复契约并触发本次生产 seed。
4. 在隔离 PostgreSQL 验证 missing asset → seed → ready_exact。
5. 执行单测、lint、typecheck、build、Release Smoke。
6. 中文 PR、Codex Review、合并并监控部署成功。
7. Review 生命周期补强：禁用/过期 asset assignment 后保留完整 signed history 为 validation-only scope；active/retained 均拒绝 disabled 非删除重复投影，并同步 diagnostic/000008/PG fixture。
8. Review 授权与审计补强：所有非删除园区同步模块/TENANT_ADMIN 权限，仅 active 园区 provision asset；retained 租户过期不误判；active/retained 的修正审计内容和 evidence 均严格校验。
9. inactive-only 租户仍以首个非删除园区作为授权参考 scope 完成模块与 TENANT_ADMIN 收敛，不把 inactive 园区当成资产 canonical source。
10. Review #5 补齐所有资产园区 mutation：create 执行完整 canonical provisioning，update/delete 共用 scope 锁且 active assignment 下禁止破坏 enabled 投影；inactive park 强制停用 asset assignment/权限；默认 scope 多来源时与 000007 一致选择全局唯一 JH。
11. Review #6 将 canonical biz_park create/update/delete 纳入同一锁并同步投影；active/retained history 均保护唯一 enabled 投影与 active source；资产投影 DTO 的派生字段改为 canonical 一致性断言；tenant disable/expiry 在 diagnostic/seed 中归入 retained scope。
12. Review #7 同步 000007 的 active tenant 过滤；跨 scope 的全局 JH fallback mutation 同时获取默认 scope 锁并同步默认投影；面积一致性按数值比较以兼容 numeric 标度。
13. Review #8：园区去重 active 优先；canonical 冗余来源允许安全清理；inactive 园区提供 system + park read/update 恢复通道；应用侧补审计时间链；retained scope 仅 final contract ready。
14. Review #9：所有非 active 园区状态统一触发 canonical survivor 校验；删除来源后立即重投影；inactive 园区强制保留 system assignment；租户 enable 事务性补齐潜伏 asset scope。
15. Review #10：统一识别租户 runtime inactive→active 边沿，覆盖 enable、通用更新、登录设置三条路径并复用同一 asset scope 收敛 helper。
16. Review #11：租户恢复直接遍历 assignment scope 以保留默认 JH fallback；投影编辑校验真实 biz_park canonical；允许非 active 冗余园区和默认 scope 按 resolver 语义逐步清理。
17. Review #12：投影更新执行完整 provisioning；园区 recovery API 以 park 权限为双模块共同权威并在 asset/system 菜单各提供入口；孤立 projection 只同步投影、不生成 runtime controls/audits。
18. 独立复核：同一路由存在 asset/system 双菜单时，DashboardLayout 按任一匹配节点可访问即放行，避免首匹配 asset 节点使 inactive system recovery 误跳 403。
19. Review #13：tenant-wide 登录授权与重新激活均按 parkId 字典序获取 scope advisory lock，消除多园区并发反序死锁。
20. Review #14：园区恢复接口使用显式 `asset OR system` 模块策略，避免空模块元数据绕过门禁；跨默认 JH fallback 的园区写入按共享 advisory-lock key 排序，并先锁定目标 `biz_park` 行，消除反序等待。
21. Review #15：inactive 园区将套餐选中的 asset assignment 标记为园区状态暂停；园区恢复 active 时仅恢复该标记的 assignment、TENANT_ADMIN 权限与资产控制，显式模块禁用会清除恢复标记。默认 scope 唯一 exact JH 改码仍保留 canonical 来源，不再按 cross-scope fallback 删除误判。
22. Review #15 边界：园区停用期间显式从套餐或模块中移除 asset 时清除暂停标记，避免园区恢复覆盖管理员禁用意图；独立模块分配入口同样按园区状态暂停 asset、保留 system 恢复通道并收敛 TENANT_ADMIN 权限。
23. 独立复核补强：园区 active→inactive 事务主动暂停 asset 并重建最小恢复授权；SaaS asset assign/enable 在 inactive 园区落为带标记的 suspended assignment；恢复仅处理当前有效时间窗。
24. 独立复核补强：SaaS enable 在 inactive 园区不执行 canonical provisioning；受保护园区停用仍沿用既有 survivor/fallback fail-closed 契约，只有存在唯一 survivor 的合法变更才会继续同步投影与暂停授权。
25. Review #16：通用租户更新同步模块到期时间；园区仅在 scope 无 active survivor 时暂停授权；混合园区按各自目标模块过滤实体；SaaS 与园区写统一 asset→dependency→row 锁序；SaaS 园区状态复用 canonical resolver；system 恢复菜单固定显式模块元数据。
26. Review #17：园区 survivor 判定与独立模块分配统一复用包含默认 JH fallback 的 canonical active resolver；recovery-only system assignment 使用显式 marker 并在恢复后移除；未来生效但未过期的 asset assignment 在园区恢复时重新启用并预配资产 scope。
27. 独立复核：停用园区重新分配套餐或模块时，仅自动补入的 system 保留 recovery-only marker；用户显式选择 system 时清除 marker，并增加行为回归。
28. 最终复核：未选中的 system assignment 同步清除陈旧 recovery-only marker，恢复判定忽略停用或删除的 system 模块。
29. Review #18：登录设置读模型保留暂停的 asset 选择且隐藏 recovery-only system；显式 system 写入清除临时 marker；登录设置写入先按确定顺序获取 asset scope 锁并使用 canonical source 判定。
30. 独立锁序复核：assignModules 在 canonical source 判定前获取相同 asset scope advisory lock，避免与园区停用/恢复交错提交；补充读模型禁用项与重复项矩阵。
31. Review #19：园区停用时对未来/过期 system assignment 保存原时间窗快照，仅临时开放恢复权限，恢复后还原；权限收敛保留未过期的未来模块；租户恢复预配未来 asset；通用到期更新先锁全部 scope 再批量写 assignment。
32. 最终复核：登录设置 expiry-only 分支同样按 scope key 获取全部 advisory lock；非法恢复快照 fail closed，不写入 Invalid Date 或清除原始快照。
33. 并发终审：租户恢复先从候选 asset assignment 收集并锁定全部 scope，再重新读取 assignment 与判断时间窗，避免使用锁前的陈旧 expiry 进行预配。
34. Review #20：登录设置保留带快照的计划 system；租户到期同步快照 expiry；园区 system fallback 仅限 recovery marker；默认 JH 多候选明确 Conflict；000007/000008/diagnostic 将未过期未来 asset 纳入预配。
35. 终审：default scope 的 exact active source 超过一条时在 fallback 查询前直接 Conflict；JH fallback 仅用于 exact source 缺失，不能掩盖 exact scope 歧义。
36. Review #21：登录设置在任何授权/到期写入前锁定 park 与 retained assignment scope 并集；显式 system 仅在 canonical scope inactive 时用于恢复；disabled system 快照不投影为已选；diagnostic/000007 fallback 仅允许 exact_source_count=0。
37. Review #22：计划 system 重存时恢复原时间窗；通用更新与 enable 在 tenant 写前锁定全部 assignment scope；自动恢复 system 不再派生完整 system 管理权限；规范明确 system 仅在 canonical inactive 时开放园区恢复。
38. Review #23：login-settings status-only 恢复同样先锁全部 scope；inactive 计划重存保留未来 system 的临时恢复窗口；独立 SaaS asset 写入补齐恢复 system 与最小权限；过期 suspended asset 不再回显；规范区分未来预配与运行时 startTime 门禁。
39. Review #24：园区恢复即使没有 suspension/recovery marker 也重建角色权限以撤销临时 park grants；恢复权限仅使用 enabled+status enabled assignment；园区 update/delete 在 scope 锁内重新校验模块访问，消除并发恢复 TOCTOU。
40. Review #25：SaaS 独立 assign/enable 将 recovery-only system 显式提升为普通 system 后，在同一事务复用当前 assignment 权限收敛，确保 `/users/me` 模块与 TENANT_ADMIN 完整 system 权限一致。
41. Review #26：允许唯一受保护 canonical park 显式停用并保留历史投影进入恢复流；SaaS system disable 同事务撤销角色权限；未来 system 仅在 startTime 生效后派生 permission-only API 权限。
42. Review #26 生命周期闭环：独立 SaaS API 拒绝未来生效的 system assignment，避免模块窗口到达时缺少权限收敛触发器；未来 asset 仍允许提前预配并由 ModuleGuard 在 startTime 后开放。
43. Review #27：system upsert disable 同样撤销完整权限；inactive park 的 system disable 自动重建 recovery-only system 与最小 park 权限；跨 scope JH fallback 停用时同步收敛默认平台 scope。
44. Review #28：跨 scope JH fallback 恢复时同步恢复默认平台 scope；system standalone 授权禁止有限到期；inactive asset assignment 重试保留 suspension intent。
45. Review #29：active 园区改为 JH 时按默认 canonical source 状态转换恢复默认 scope；显式 system 提升清除 recovery 时间窗与 snapshot；诊断对所有 active scope 强制 canonical source fail-closed。
46. Review #30：inactive scope 的普通 system 权限收敛保留 park read/update；默认 scope 变更前允许歧义进入修复事务，但变更后仍由严格 canonical resolver fail-closed。
47. Review #31：inactive 园区权限仅从已生效 assignment 派生；租户恢复遍历所有 assignment scope，消费 suspension/recovery marker、重建权限并预配恢复后的 asset。
48. Review #32：跨 scope 新建唯一 active JH 时按默认 canonical source inactive→active 转换同步恢复默认平台 assignment 与 TENANT_ADMIN 权限。
49. Review #33：默认平台 exact 与 JH fallback 均缺失时判定 canonical inactive，允许后续 fallback 恢复；非默认未知 scope 继续 NotFound fail-closed。
50. Review #34：园区接口已有有效 asset assignment 时直接通过模块授权，不再提前解析 canonical source；仅 system recovery 分支查询 inactive canonical 状态，使管理员可进入并修复历史多来源歧义。
51. CI Release Smoke：多园区 seed 重跑 fixture 的第二园区改用独立 parkId，保留“同租户两个园区”覆盖，同时不再构造同 scope 双 active canonical source；生产 000007 歧义门禁保持 fail closed。
52. Review #35：system 分配/启用均清理历史 assignment 到期时间且禁用返回最终 recovery 状态；孤立 projection 不创建恢复授权；权威模块谓词补齐 start_time。权限定义保持 000024 规定的 tenant-wide 唯一语义，park 隔离由 rel_role_perm 绑定承担。

## 验证记录

- 隔离 PostgreSQL/API：创建 `system+asset` 新租户，`biz_park=1`、`asset_park=1 enabled` 且编码一致。
- Review 修复隔离验证：新租户创建响应 201，同一事务落库 `asset_park=1`、runtime controls=12、contract audits=24、final v3 controls=12；在 `RUN_PRODUCTION_SEED=no` 语义下诊断仍为 `ready_exact`、blocked=0。
- 独立模块分配：从 system-only 租户启用 asset 后生成唯一 enabled 投影；disabled 投影由业务写路径恢复。
- 历史收敛：删除投影后分类为 `ready_missing_asset_seed_reconcile`；运行 production seed 后 13 个 scope 全部 `ready_exact`；disabled 投影保持 `invalid_scope`。
- `verify-000194-runtime-control-retry.sh`：历史重试链与 fresh-order fixture 通过；覆盖停用 asset assignment 的 `ready_retained_exact`、控制签名漂移双重阻断、disabled 非删除重复投影双重阻断。
- Review #4 完整 PG 重跑通过：active scope 审计 evidence 篡改被 diagnostic/seed 同时阻断；租户过期后的 retained scope 仍为 `ready_retained_exact`；缺失控制继续输出精确 `missing_control` 分类。
- API 针对性 21 项测试通过；API lint、typecheck、build 通过；migration prerequisite contract 与脚本语法通过。
- Review #9 聚焦园区/租户授权测试 21/21 通过，API lint 与 typecheck 通过；待完整 CI/Release Smoke 复跑。
- 全仓：lint、typecheck、API 1153 项单测（1140 通过、13 跳过）、全部 Web 单测、API/Web build 通过。
- Review #15：园区状态/模块暂停聚焦测试 32/32；API 全量 1193 项单测（1180 通过、13 跳过、0 失败）；shared build、API lint/typecheck/build 通过；隔离 PostgreSQL 启动完整 Nest 应用并验证 `/api/v1/health` HTTP 200。
