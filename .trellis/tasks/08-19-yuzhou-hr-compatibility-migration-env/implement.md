# 实施计划：玉舟 HR 兼容迁移环境与 T0

## 最终目标执行增补（2026-09-05）

原 Phase 0-7 与源验证记录保留为阶段历史；完整目标以 PRD 和 `docs/yuzhou-hr-compatibility-development-plan.md` 第 1 节为准，不能按 T0 结束父任务。

- [ ] M0/P0：列出 HR 跨模块 import、共享实体、数据库外键、后台任务、配置与启动依赖，区分已实现和待适配项。
- [ ] M1-M3/P0-P2：随业务闭环实现平台能力接口、企业范围与身份映射；保持现有集成版行为，补专用 HR 数据与文件边界。
- [ ] M1-M4/P1：交付独立启动纵向链，验证登录→人员→一次审批→历史回读→审计，不启动园区业务，再扩展全部 HR 业务。
- [ ] M4/P4：同提交双模式执行角色正负例、桌面/390px、历史查询与报表；预先固定数据量、响应时间、内存和作业并发预算后测量。
- [ ] M5/P2-P3：用同一迁移管线在另一隔离企业验证完整迁出/恢复，联合核对规则、历史、字典、映射、账本和文件，不因模式变化重新全量抽取旧源。
- [ ] M5/P4：验证独立升级、故障恢复及现有集成版无回归；原 M0-M5 和 P0-P4 全部通过才完成总任务。生产写入仍遵守真实目标、备份和一次执行授权。

本增补只变更目标与计划，不代表任何 P 项已通过，不重置已有兼容和迁移证据。P0 后重估独立运行工作量，原预测不能直接当作新增目标的交付承诺。

## Phase 0：版本与 WIP 保护

- [x] 记录 `main` 与 `origin/main` 的 23/31 分叉、worktree、未跟踪任务和文档；创建保护分支 `codex/yuzhou-hr-t0-baseline-start`（`c39604fc`），未 reset/覆盖/强推。
- [ ] 确认本任务分支/工作树策略，避免与现有 62 个 Trellis 任务互相提交文件。
- [x] HR 集成到最新主线时已重扫编号并将未发布 HR 迁移重排为 `000230～000242`；后续新增迁移仍须实施瞬间重扫。

## Phase 1：补齐本机运行环境

- [x] 安装 `colima`、Docker CLI/Compose plugin、`p7zip`；版本记录在 source audit。
- [x] 启动 Colima（4 CPU/8GB/60GB，Rosetta），验证 amd64 容器运行。
- [x] 保留 Homebrew PostgreSQL 5432；仓库 Docker PostgreSQL 映射到 `127.0.0.1:15432` 并验证。
- [x] 建立 SQL Server 2022 Developer 实验 compose（platform linux/amd64、14333、健康检查、命名 volume、秘密外置）。
- [x] 增加 `scripts/check-hr-migration-runtime.sh`，检查 Docker、Compose、端口、磁盘、依赖、源码目录和秘密门禁。
- [x] 运行 `pnpm install --frozen-lockfile`，workspace 依赖已是最新。

## Phase 2：标准 Jinhu 数据库链路

- [x] 用独立 Docker PostgreSQL volume 创建一次性数据库，完整执行 `pnpm db:migrate`：221/221 成功，8/8 prerequisite 成功。
- [x] 按顺序执行 production seed、init baseline、bootstrap admin、init baseline；bootstrap 前 FAIL、bootstrap 后 WARN 符合预期。API 登录留待 API 容器/服务验证。
- [x] 完整历史迁移链无阻断；记录重复 `000136` 警告，未绕过 checksum/history 门禁。
- [ ] 为启动、readiness、失败清理和端口冲突增加确定性验证。

## Phase 3：旧资料 manifest 与对象索引

- [x] 增加只读 inventory 工具，扫描 220 个材料文件并生成 machine-readable manifest。
- [x] 固化已确认指标：218 文本/17,570 行、162 表、194 过程文件、16 函数、2 触发器、重复报告 hash。
- [x] 7z 归档完整性通过（217 文件）；`.DS_Store` 标为 metadata 并排除业务证据。逐项归档/展开 hash 对照仍待补充。
- [ ] 生成表/列/字典/帮助主题/过程依赖索引和功能模块矩阵。
- [x] 真实 SQL Server catalog 已确认 169 个存储过程；194 个过程源码文件属于文件口径，包含重复、历史或未部署文件，后续继续输出对象名/hash 差异清单。

## Phase 4：SQL Server 只读实验室

- [ ] 无备份时：SQL Server 2022 Developer 容器及查询已验证；继续用 162 表 DDL 适配后的最小合成 fixture 验证抽取和类型转换，不宣称真实迁移。
- [x] `.dbk` 已完成只读接收、隔离副本、hash 核验、`VERIFYONLY` 和隔离恢复；目标库 ONLINE/READ_ONLY，catalog 为 162 表、169 过程、16 函数、2 触发器。
- [x] 已创建最小只读 ETL login：`db_datareader=1`、`VIEW DEFINITION=1`、`UPDATE=0`、`EXECUTE=0`；凭据仅在 Git 忽略的本地 `0600` 文件保存，日常抽取不使用 sa。
- [x] 已导出 SQL Server collation、catalog、近似行数、字段、索引/FK、LOB 类型和可编程对象；下一步继续字段级数据质量规则和源/目标映射。
- [x] T0 组织/岗位/员工源查询使用只读 ETL login、显式 `ORDER BY` 和只读库门禁；两次真实抽取数量/hash 一致。后续大表抽取仍需补充分块与超时控制。

## Phase 5：迁移控制模型

- [x] 新增前向迁移 `000235/000236`：source object、record map、batch/item、error、check、rollback point 及跨批次引用完整性。
- [x] 数据库层已约束 batch 状态、run id、隔离目标、活跃源映射唯一和 source drift 冲突；服务层重试/状态转换命令继续下一步实现。
- [x] `migration_error` 强制 `evidence_redacted=true` 且只接受 JSON object；日志运行时扫描继续随 ETL 命令补充。
- [x] PostgreSQL 集成验证已覆盖首次映射、同 hash replay、不同 hash conflict、未脱敏证据拒绝和共享目标拒绝；部分失败/cleanup 随加载器补充。

## Phase 6：组织/员工 T0 dry-run

- [x] 已建立 organization code、employee status、employment event 和字段敏感等级的 T0 映射清单；状态 1/2/3/4/5/A/B 保留待业务确认。
- [x] 真实组织编码为 3/6/9/12/15 位；员工无组织/岗位孤儿。映射改为从实际存在编码推导最长短前缀父级，不截断 15 位编码。
- [x] 已 Profile `person` 真实 150 列（旧报告 138 列已纠正）：工号无空/无重复，身份证 39 组重复影响 79 行、503 行为空，2155 个照片的 `photosize` 均不能作为实际字节数。
- [x] 已用真实只读源完成组织 138、岗位 18、员工 2949 的稳定抽取和规范 JSONL 转换；每条记录具有 source identity hash 与 row hash，两次运行文件 hash 一致。
- [x] 已对真实备份完成组织/岗位/员工 extract→profile→transform→load→verify→rollback→reload；专用目标库223迁移和生产安全种子通过，最终加载138组织、18岗位、2938员工。
- [x] 11名离职日期早于入职日期的员工进入脱敏隔离队列；报告不含姓名/证件/手机号/账号，组织父级孤儿为0，员工总账 `2938+11=2949`。

## Phase 7：质量门禁与交付

- [x] 新增 Shell/Node 工具语法检查、Yuzhou migration lab contract、PostgreSQL 完整迁移和 SQL Server 健康/查询验证通过；后续控制模型与 dry-run 测试随对应阶段补充。
- [x] 全 workspace `pnpm lint`、`pnpm typecheck`、`pnpm build` 通过；Next.js 保留既有 ESLint plugin 提示。
- [ ] 验证临时数据库、容器、volume、文件 staging 在成功/失败/中断后均可清理，且不会触及宽泛路径。
- [x] T0业务数据精确回滚已验证：仅按当前run的3094条活跃record map删除2938员工、18岗位、138组织，保留15条种子组织；同run重复加载拒绝，新run可重载。
- [x] 新增迁移实验室运行手册并同步 HR 兼容计划；Compose 密码强制外置，未提交秘密。
- [x] 环境版本、命令、数据库验证和真实源备份缺口已记录；commit 在本阶段质量检查后补记。

## 当前受控源 T1 人事异动 A/B 复核（2026-09-01）

- 当前受控源恢复回执的快照哈希为 `3ed50b9a2ba420c0fb7a9c2628f9a2d62a05e7a14ba574929bc145ac47a9036e`。在该源和受限 `core_t0_t2` 运行器下，A、B 两套完全独立资源均完成 `T0 -> T1 -> T2` 受控抽取、字典机器物化、加载、事实核验、`T2 -> T1 -> T0` 反序回滚及 13 类资源清理；生产导入持续为 `HOLD`。
- 两套 T1 密封事实完全一致：`source=6,887`、`loaded=6,886`、`quarantined=1`、`approvedIgnored=0`；来源守恒、canonical hash 和隔离原因 hash 通过比较，且 `sideEffectViolationCount=0`。本记录不含人员、单据、薪资、账号或其他个人字段。
- T1 抽取的事件类型和事件状态均按其输出的规范字符串分组及排序；专项合同测试冻结该规则，避免源列表示差异造成字典摘要漂移。该证据只证明当前受控源下的可重跑、核验和回滚性，不解除在线三角色 UAT、全域演练或生产目标备份/写入门禁。

## 后续未闭合分片（本任务不直接实施）

1. T1：在线异动的 HR/负责人/员工三角色 UAT 与发布闭环；当前历史导入演练已按上节完成，不得重复写入。
2. T2：合同、附件、招聘、培训、奖惩和提醒。
3. T3：考勤与五险一金。
4. T4：工资账套、DSL、历史明细和双轨对账。
5. T5：两次全量演练、增量窗口、三角色 UAT 和生产切换。

## 验证命令草案

- `docker version && docker compose version && colima status`
- `pnpm install --frozen-lockfile`
- `pnpm db:up && pnpm db:migrate`
- `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod`
- `pnpm db:check:init && pnpm db:bootstrap:admin && pnpm db:check:init`
- `pnpm --filter @jinhu/shared build`
- `pnpm --filter @jinhu/api typecheck && pnpm --filter @jinhu/api lint && pnpm --filter @jinhu/api build`
- `pnpm --filter @jinhu/web typecheck && pnpm --filter @jinhu/web lint && pnpm --filter @jinhu/web build`
- T0 inventory、SQL Server catalog、PostgreSQL integration 和 cleanup 专项测试。

## 回滚与风险点

- 环境安装可通过停止 Colima/删除本任务专用 profile 回退，不删除用户其他容器或 Homebrew PostgreSQL。
- 数据库迁移只对显式一次性数据库执行；已成功 migration 不回改。
- SQL Server amd64 在 arm64 上可能性能较低，只用于迁移实验，不承担生产流量。
- 原始旧库备份缺失是现实阻塞：只能完成环境、结构 fixture 和迁移框架，不能完成真实行级对账。
- 当前分支与远端分叉，实施前必须先完成保护与整合决策。
