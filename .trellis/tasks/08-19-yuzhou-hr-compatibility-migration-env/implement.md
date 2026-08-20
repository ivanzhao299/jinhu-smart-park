# 实施计划：玉舟 HR 兼容迁移环境与 T0

## Phase 0：版本与 WIP 保护

- [x] 记录 `main` 与 `origin/main` 的 23/31 分叉、worktree、未跟踪任务和文档；创建保护分支 `codex/yuzhou-hr-t0-baseline-start`（`c39604fc`），未 reset/覆盖/强推。
- [ ] 确认本任务分支/工作树策略，避免与现有 62 个 Trellis 任务互相提交文件。
- [x] 冻结当前 HR 基线 commit 与数据库迁移编号清单；当前最新为 `000221`，新增迁移仍须实施瞬间重扫。

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
- [x] `.dbk` 已完成只读接收、隔离副本、hash 核验、`VERIFYONLY` 和隔离恢复；目标库 ONLINE/READ_ONLY，catalog 为 162 表、169 过程、16 函数、2 触发器。只读 ETL login 继续在下一步创建，禁止使用 sa 做日常抽取。
- [ ] 导出 SQL Server 版本、collation、catalog、行数、主键/索引/FK、LOB 类型和数据质量摘要。
- [ ] 所有源查询稳定排序、分块、超时受控，不更新旧库。

## Phase 5：迁移控制模型

- [ ] 新增前向迁移：source object、record map、batch/item、error、check、rollback point。
- [ ] 实现 batch 状态机、run id、幂等重放、source drift、失败重试与 fail-closed cleanup。
- [ ] 实现敏感值 redaction 和日志契约测试。
- [ ] 增加 PostgreSQL 集成测试：首次加载、同 hash replay、不同 hash conflict、部分失败回滚、跨 scope 拒绝。

## Phase 6：组织/员工 T0 dry-run

- [ ] 建立 organization code、employee status、employment event、字段敏感等级映射清单。
- [ ] 解析 3/6/9/12 位组织树并验证父节点、重复编码和孤儿。
- [ ] Profile `person` 138 列：空值、重复工号、身份证 15/18 位、状态、日期、照片魔数、自定义字段。
- [ ] 对合成 fixture 完成 extract→profile→transform→load→verify→rollback；真实备份到位后原管线重跑。
- [ ] 输出脱敏数据质量报告和未知项清单。

## Phase 7：质量门禁与交付

- [x] 新增 Shell/Node 工具语法检查、Yuzhou migration lab contract、PostgreSQL 完整迁移和 SQL Server 健康/查询验证通过；后续控制模型与 dry-run 测试随对应阶段补充。
- [x] 全 workspace `pnpm lint`、`pnpm typecheck`、`pnpm build` 通过；Next.js 保留既有 ESLint plugin 提示。
- [ ] 验证临时数据库、容器、volume、文件 staging 在成功/失败/中断后均可清理，且不会触及宽泛路径。
- [x] 新增迁移实验室运行手册并同步 HR 兼容计划；Compose 密码强制外置，未提交秘密。
- [x] 环境版本、命令、数据库验证和真实源备份缺口已记录；commit 在本阶段质量检查后补记。

## 后续分片（本任务不直接实施）

1. T1：组织/员工/异动完整兼容。
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
