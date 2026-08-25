# Phase 5 玉舟兼容迁移演练证据

## 源库结论

- 使用现有最小权限 ETL 登录，确认不是 `sa`，凭据文件为 `0600`，数据库为 `READ_ONLY`。
- 两次按显式列和稳定键排序抽取，业务哈希均为 `ab16152a6dbcb36219e9f3b1476be0ef3d925391ae6c41fc27b8609cbc4ee96c`；敏感 staging 目录为 `0700`，文件为 `0600`。
- 当前恢复库与旧静态报告不一致：`accept` 实际为空，不存在约 117 行；`jch_1` 对象不存在。迁移保留 empty/absent 事实，不合成候选人或奖惩记录。
- `docs` 1,003 行均只有文件名，`Cont/FPath/FType` 为空；不能恢复可读文件。`person.photo` 2,949 行中 2,155 行含可读 BMP 二进制，共 273,936,570 字节，2,150 个不同内容哈希；全部 2,155 行的旧 `photosize` 与真实字节数不一致，因此只作为旧声明值保留。

## 隔离目标演练

- 最终目标：一次性 `jinhu_hr_migration_lab_t5_final_20260825`，从 `template0` 创建；最终文件完整 247 个迁移和 8 个 prerequisite 通过，`000256` 成功；随后 247 个迁移和 8 个 prerequisite checksum replay 全部跳过通过。
- T0 基线：2,938 名员工加载、11 行隔离。
- 首次 T5：`source=9,140`、`loaded=8,730`、`quarantined=410`。回滚只删除 active `legacy_record_map` 证明的 4,789 个记录和 3,941 个文件证据，回滚后目标行和 active map 均为 0。
- 重载：`loaded=8,730`、`quarantined=410`。隔离原因为 `HISTORY_OWNER_UNRESOLVED=375`、`EMPLOYEE_NOT_MAPPED=35`（family 22、photo 11、trainhis 2）。`bonuscode=8` 作为无需员工映射的历史类别加载。
- 目标文件证据：`docs empty=1,003`；已映射照片 `image/bmp + readable=2,149`、`empty=789`，可读字节合计 272,717,930。另有 11 名未映射员工的照片进入隔离，不创建在线文件。
- 同一 run 再次执行被 `duplicate migration run` 拒绝，失败前后目标计数不变；普通 UPDATE/DELETE 也被不可变触发器拒绝。
- `T5_SOURCE_ACCOUNTING`、`T5_FILES_PROFILE`、`T5_ACCEPT_EMPTY`、`T5_JCH_1_ABSENT`、`T5_ONLINE_STATE_UNCHANGED` 全部通过。在线员工、账号、工资批次、工资条、绩效周期/计划/项目和统一消息的全表 JSON 哈希前后一致。

## 发布边界

生产导入保持 `HOLD`。本切片只提供空 schema、确定性抽取、隔离加载和精确回滚工具；未获得独立 run 级授权前不得对生产执行 loader，不得把空 `accept` 合成为候选人，也不得把历史行触发为在线员工、工资、绩效或消息。

## 独立审查复验（2026-08-25）

- 审查修复后再次以非 `sa`、非 sysadmin 的只读登录抽取 9,140 行，业务哈希仍为 `ab16152a6dbcb36219e9f3b1476be0ef3d925391ae6c41fc27b8609cbc4ee96c`。
- 新建 `template0` 隔离库 `jinhu_hr_migration_lab_t5_review_20260825`：247/247 migrations 与 8/8 prerequisites fresh 通过；checksum replay 为 247/247 与 8/8 全跳过匹配。
- production seed 与 T0 基线通过；修复后的 T5 首次加载仍为 `loaded=8730 / quarantined=410`。普通 UPDATE/DELETE、错误 run、staged 后 INSERT、staged count 修改和破坏 record-map proof 的回滚均被拒绝。
- 精确回滚删除 4,789 个历史记录和 3,941 个文件证据并清零 active map；新 run reload 再次得到相同计数，同 run duplicate 被拒绝且行数不变。并发相同 run 插入仅一方成功，另一方由 `uq_migration_batch_run_id` 拒绝。
- catalog 复核确认 4 个 tenant/park scoped FK、4 个完整非 partial 子 FK 索引，以及 record/file 的 INSERT+UPDATE+DELETE 和 batch 的 UPDATE+DELETE 触发器均启用；非法 readable 文件证据被数据库 shape constraint 拒绝。
