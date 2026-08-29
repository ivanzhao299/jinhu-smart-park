# 玉舟 HR 兼容迁移实验室运行手册

## 1. 用途与边界

本手册用于玉舟集团版 V10 到 Jinhu Smart Park 独立人力资源模块的迁移演练。实验室由两个隔离数据库组成：Jinhu PostgreSQL 目标库和玉舟 SQL Server 源库。源库只读，数据只允许按“源库 → staging → 目标库”方向流动。

2026-08-20 已在下载目录发现 `hr2026081914.dbk`，完成源/隔离副本 SHA-256 核验、`VERIFYONLY` 和隔离恢复。恢复库 `YuzhouHR_Lab_20260820_intake01` 为 ONLINE/READ_ONLY，catalog 为 162 表、169 过程、16 函数、2 触发器。在完成全量 catalog、行级抽取和数据质量检查之前，仍不能宣称已完成 2949 名员工等真实业务数据迁移。

## 2. 已验证的本机基线

- Apple Silicon Mac，Rosetta 已安装；
- Node.js、pnpm、PostgreSQL 16 客户端、Python 3、jq、rg、OpenSSL；
- Colima + Docker CLI + Docker Compose；
- p7zip，用于只读检查旧系统归档；
- Homebrew PostgreSQL 继续使用 5432；实验 PostgreSQL 使用 `127.0.0.1:15432`；
- SQL Server 2022 Developer 使用 `linux/amd64` 和 Rosetta，监听 `127.0.0.1:14333`。

## 3. 首次启动

启动容器运行时：

```sh
colima start --cpus 4 --memory 8 --disk 60 --vm-type vz --vz-rosetta
pnpm hr:migration:check
```

启动隔离 PostgreSQL。务必显式使用实验库名和独立 Compose 项目名：

```sh
export COMPOSE_PROJECT_NAME=jinhu_hr_migration_lab
export POSTGRES_PORT=15432
export POSTGRES_DB=jinhu_hr_migration_lab
export POSTGRES_USER=jinhu
export POSTGRES_PASSWORD='<仅本机临时强密码>'
docker compose -f infra/docker/docker-compose.yml up -d postgres
pnpm db:migrate
```

启动 SQL Server。密码只能存在本机环境变量或密钥管理器中，不能写进仓库：

```sh
export YUZHOU_SQLSERVER_PORT=14333
export YUZHOU_SQLSERVER_SA_PASSWORD='<仅本机临时强密码>'
pnpm hr:migration:sqlserver:up
```

日常抽取不得使用 `sa`。真实备份恢复后，应创建只允许连接目标旧库并执行 `SELECT`、查看 catalog 的 ETL 登录；源备份先复制到隔离目录并计算 SHA-256，不直接在原下载目录上操作。

恢复已接收的备份时，使用唯一 run id 和新的实验数据库名：

```sh
export ALLOW_YUZHOU_MIGRATION=yes
export YUZHOU_MIGRATION_RUN_ID=yz-20260820-01
export YUZHOU_SQLSERVER_DATABASE=YuzhouHR_Lab_20260820_01
export YUZHOU_BACKUP_SHA256=3ed50b9a2ba420c0fb7a9c2628f9a2d62a05e7a14ba574929bc145ac47a9036e
pnpm hr:migration:sqlserver:restore
```

恢复工具只接受 `database/backups/yuzhou-hr/` 下的副本，拒绝覆盖已存在数据库，不使用 `WITH REPLACE`。它先执行 `RESTORE VERIFYONLY` 和 `FILELISTONLY`，成功恢复后把源库设置为只读，并输出数据库状态及表、过程、函数、触发器数量。

本次恢复后已创建 `yuzhou_etl_20260820_intake01` 最小权限登录。实测权限为 `db_datareader=1`、`VIEW DEFINITION=1`、`UPDATE=0`、`EXECUTE=0`，恢复库仍为只读。登录凭据只保存在 Git 忽略、文件权限为 `0600` 的本地导入报告目录。catalog 导出同样位于 Git 忽略目录，提交到仓库的只有不含人员明细的汇总证据。

T0 组织/岗位/员工演练使用独立目标库，不在通用库或生产库直接加载：

```sh
export ALLOW_YUZHOU_MIGRATION=yes
export YUZHOU_MIGRATION_RUN_ID=t0extract_20260820e
pnpm hr:migration:t0:extract

export YUZHOU_MIGRATION_RUN_ID=t0load_20260820c
export YUZHOU_TARGET_DATABASE=jinhu_hr_migration_lab_t0_20260820a
export YUZHOU_STAGING_DIR="$PWD/database/import-reports/yuzhou-hr/staging-t0extract_20260820e"
pnpm hr:migration:t0:load
```

加载器先校验三份规范 JSONL 的 SHA-256，再以单事务写入业务表、源对象、批次明细、record map、脱敏错误、对账和回滚点。重复 run、共享目标、哈希漂移、数量漂移或对账失败均整体回滚。

精确回滚必须增加第二个显式开关，只允许删除当前 run 的活跃 record map 可以证明的目标记录：

```sh
export ALLOW_YUZHOU_ROLLBACK=yes
pnpm hr:migration:t0:rollback
```

### T2 合同续签链与提醒

T2 结构化装载保存 `dbo.compact`、`dbo.compact_c` 的稳定源 identity 和源行 SHA-256。合同期限、签订日及续签前后日期只在已审阅字段合同明确时进入业务列；累计期限等旧字段单位尚未签署时不得推断，继续留在 raw archive/quarantine。合同正文只形成受控文本摘要证据，文件只登记 SHA-256、MIME、字节数和缺件原因；本阶段不复制照片或真实文件，也不保存或返回旧绝对路径。

提醒由 policy、instance、动作流水和 outbox 分离承载。production seed 提供可配置的 30/60/90 日合同到期及试用期规则；scheduler 仅允许 `hr:contract_reminder:run` 原子权限触发。实例按 tenant、park、合同、提醒类型、窗口、规则版本和明确收件人生成稳定去重键，并发和重跑不得产生重复实例。续签、终止或取消合同会撤销旧 open/read 实例和待投递 outbox；acknowledged/resolved 历史保留审计，不物理删除。

Focused 门禁为 `hr-contract-reminder.contract.spec.ts` 和 `hr-contract-reminder.pg.spec.ts`。真实 PostgreSQL 测试必须覆盖双 scheduler 并发、第三次重跑零新增、续签撤销和 required-audit。T2 rollback 按 outbox → action → reminder → evidence → change → contract → type 反序，只处理目标 run 的 active record map。普通部署、migration 和 production seed 均不会执行 T2 loader 或历史提醒 backfill；生产历史导入继续 `HOLD`。

### T5 招聘、档案、培训和奖惩历史

T5 使用 `000256_hr_legacy_t5_history.sql` 的独立历史表，并由 `000267` 保留核心残余归档；`000276` 在不删除 raw archive 的前提下，把已审阅的 `person/family/knowhow/ticket` 字段同步物化到员工档案、家庭、技能和证照业务表。物化必须命中 T0 员工映射并绑定稳定 source identity/row hash；未知字段只登记 locator、hash 和 reason code，不把 raw value 写入证据。技能 `grade` 在词典未签署前保持 `proficiency=NULL` 并登记 `UNKNOWN_SKILL_GRADE`。旧登录密码不迁移，照片及证照路径只保留 hash/文件证据。

抽取必须连续运行两次并比较 manifest 的 `businessSha256` 和每个领域文件哈希。物化版 manifest 额外绑定 reviewed mapping hash；启用后旧业务哈希不再有效，必须对同一固定源重新执行 A/B 抽取并固定新的 hash，不能手工沿用旧值。旧字符串中的 NUL 控制字符保留原始行哈希，并在载荷中规范为可识别的字面转义。

加载器会重新规范化计算 catalog+domains 业务哈希，不能仅信任 manifest 自报值；staging 目录和 manifest 必须分别为 `0700/0600`。加载事务对在线员工、账号、薪酬、工资、工资条、绩效和统一消息表持有共享锁并比较前后哈希，同时独立核对总量、逐来源、隔离错误和 record-map 守恒。任何一项不一致都会整批回滚。

```sh
export ALLOW_YUZHOU_MIGRATION=yes
export YUZHOU_ETL_CREDENTIAL_FILE='<本机 0600 的只读 ETL 凭据文件>'
export YUZHOU_MIGRATION_RUN_ID=t5extract_<run>
export YUZHOU_PARTY_DATA_KEY_FILE='<本机 0600、非符号链接的目标 API 同源实验室密钥文件>'
pnpm hr:migration:t5:extract

export YUZHOU_TARGET_DATABASE=jinhu_hr_migration_lab_<run>
export YUZHOU_STAGING_DIR='<上述抽取 staging 目录>'
export YUZHOU_T5_BUSINESS_SHA256='<两次新抽取一致的 businessSha256>'
export YUZHOU_MATERIALIZATION_ACTOR_USER_ID='<隔离园区内启用的审计用户 UUID>'
pnpm hr:migration:t5:load

export ALLOW_YUZHOU_ROLLBACK=yes
pnpm hr:migration:t5:rollback
```

`docs` 的 1,003 行均没有 `Cont/FPath/FType`，只能记录为空且不可读的历史证据；不能生成下载地址。`person.photo` 仅保存内容 SHA-256、大小、魔数识别 MIME 和可读性证据，不把旧路径当成 URL。员工映射不唯一或缺失、`his` 所有者语义无法证明的行进入脱敏 quarantine。

完整演练只传递 `YUZHOU_PARTY_DATA_KEY_FILE` 的受控路径，文件必须为 `0600` 普通非符号链接，内容必须是精确 64 个十六进制字符且只允许一个可选的末尾 LF；CRLF、空格、空白行、多行、短值和超长值一律在任何 Docker、源库或目标库访问前拒绝。转换器从文件读取密钥，密钥内容不进入 config、manifest、日志或 Git。A/B 各持有独立私有副本，但内容必须来自同一个实验室密钥源，才能证明确定性；该实验室密钥不得替代生产密钥。转换器与目标 API 使用相同的 AES/HMAC 密钥派生合同，否则转换立即失败。生产 T5 导入始终为 `HOLD`。普通 schema 发布不得运行 T5 loader；只有单独的 run 级审批、目标备份和停机窗口才能解除此门禁。

回滚仅接受 `staged + succeeded` 且已有已验证 rollback point 的批次。每个 active map 的目标 ID、来源表、来源 identity hash 和 row hash 都必须与历史目标一致；普通更新/删除、staged 后追加、修改已冻结计数和错误 run 均由数据库拒绝。

## 4. 旧资料清单

生成清单：

```sh
pnpm hr:migration:manifest -- \
  '/Users/mac/Downloads/玉舟人力资源管理系统分析产出' \
  .trellis/tasks/08-19-yuzhou-hr-compatibility-migration-env/research/generated/legacy-manifest.json
```

清单只记录相对路径、大小、类型、文本编码/行数和 SHA-256，不写入身份证、银行卡、密码或连接串。当前确认：220 个文件，其中 218 个文本文件；162 张表的 DDL；194 个过程源码、16 个函数源码、2 个触发器源码。7z 归档通过完整性检查，内含 217 个文件。

原报告所称“169 个存储过程”与 194 个源码文件不一致。真实数据库到位后必须用 `sys.procedures`、`sys.objects` 和对象定义逐项比较，区分系统 `dt_*` 对象、历史副本和报告筛选口径。

## 5. 标准验证顺序

1. `pnpm install --frozen-lockfile`；
2. `pnpm hr:migration:check`；
3. 在独立空 volume 上执行 `pnpm db:migrate`；
4. 执行 `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod`；
5. 执行 `pnpm db:check:init`；
6. 使用未入库的管理员参数执行 `pnpm db:bootstrap:admin`；
7. 再执行 `pnpm db:check:init`；
8. 验证两个迁移历史表无 `running`/`failed`，并抽查晚期 HR 表/列；
9. 执行 SQL Server catalog、行数和数据质量导出；
10. 运行组织/员工合成 fixture 的 extract → profile → transform → load → verify → rollback。

任何迁移失败后都必须停止，不能继续 seed、bootstrap 或部署。不得使用 `MIGRATION_BASELINE_ON_NONEMPTY_DB=yes` 掩盖失败初始化。

## 6. 真实备份到位后的接入门禁

接收备份时登记文件名、字节、SHA-256、接收人和时间；只读复制到本任务专用目录。恢复到命名 volume 后记录 SQL Server 版本、数据库兼容级别、collation、表/列/主键/索引/FK 和 LOB 类型。随后创建只读 ETL 用户，并以稳定主键排序、分块和超时限制抽取。

变更性演练必须同时满足：源和目标只监听 loopback、目标数据库名含 `jinhu_hr_migration_lab`、显式设置 `ALLOW_YUZHOU_MIGRATION=yes`、唯一 `run_id`、目标为空或属于该 run。任何条件不满足都应 fail closed。

## 7. 清理与恢复

只停止明确命名的实验 Compose 项目。默认 `down` 保留命名 volume；只有确认数据和证据已经归档，才单独删除该项目的实验 volume。禁止对 Docker 或文件系统做宽泛清理，也不得触及 Homebrew PostgreSQL 的 5432 数据目录。

源库恢复、抽取和目标加载均要记录 run id。目标回滚只能删除当前 run 且有 `legacy_record_map` 证明的记录，或者恢复一次性目标数据库快照；不能使用无条件全表删除。

## 8. 全域生命周期编排（Slice 2）

全域编排只接受 `scripts/hr-cutover/full-domain-lifecycle.mjs` 定义的闭合 JSON 配置，不从当前 shell 继承业务参数。运行前必须同时固定候选代码 SHA、源快照 SHA-256 和映射合同 SHA-256；代码或映射字节变化后，旧配置立即失效。T4 证据文件必须是 `0600`、非符号链接、内容状态为 `COMPLETED/completed`，且与配置中的 SHA-256 相同。该检查发生在创建目录、锁、容器或数据库之前。

生命周期只能依次推进：

```text
planned → provisioned → extracting → review_hold → loading → verifying → uat_ready → rollback_ready → cleaned
```

六域正序固定为 T0→T5，回滚固定为 T5→T0。真实 lab 执行采用两阶段合同：`run` 只完成六域只读提取，随后进入 `review_hold`（也称 `REVIEW_HOLD`），不会开始任何 loader；只有同一 run 的 v2 `MACHINE_CANDIDATE` 决策、私有源值载荷和受信任根 machine attestation 全部通过确定性校验后，`resume` 才能受控物化字典并继续 T0→T5 load。旧 v1 真人审批包仅保留审计可读性，不能跨越当前 SQL 写入边界。每个 child 使用 `<parent>-t0`…`<parent>-t5`，adapter 只向旧脚本传递白名单环境变量，并把目标数据库、PostgreSQL 容器和 Compose project 重新绑定到当前 parent。T1～T4 已补齐与 T0/T5 相同的 pnpm 命令面；所有 rollback 都必须同时具备迁移开关与 rollback 开关。旧转换 SQL 和业务映射语义没有复制或放宽。

配置的 `backend` 只能是 `fixture` 或 `lab`。`lab` 目标数据库及 Compose project 必须逐字相同并匹配 `jinhu_hr_migration_lab_full_*`，只发布 `127.0.0.1` 端口，数据库、Compose default network、volume、container、role、目录、三角色账号命名空间、文件、端口、进程和凭据工件均属于该 run。A/B 配置必须使用相同 C/S/M，同时这些资源逐项不同。生产、共享、默认目标会在任何写入前被拒绝。

`lab provision` 使用运行目录内受控的 `0600` Compose 文件创建 PostgreSQL，而不是直接执行未登记的 `docker run`。容器就绪后，它按正式顺序调用官方 `db-migrate.sh`、production-safe seed 和初始化基线检查；进入 UAT 账号 provisioner 前，初始化检查只允许唯一的 `no bootstrap admin found` 阶段性缺口，出现第二个 FAIL 或其他 FAIL 仍立即停止。任一步失败都会阻断六域抽取/装载并触发本轮精确资源恢复。演练数据库因此必须从空 volume 和当前候选代码的完整迁移历史开始，不能以手工导入 schema、污染的 `template1` 或跳过迁移历史来代替。

命令入口为：

```sh
pnpm hr:migration:full:prepare -- --rehearsal A --suffix '<本轮唯一后缀>' --postgres-port '<端口>' --api-port '<端口>' --web-port '<端口>' --control-root '<0700受控根目录>' --etl-env '<0600只读ETL文件>' --t4-evidence '<固定T4证据>' --source-container '<只读源容器>' --source-backup '<与证据哈希一致的只读源备份>' --materialization-key '<0600实验室物化密钥文件>'
pnpm hr:migration:full:provision -- --config '<受控配置.json>'
pnpm hr:migration:full:run -- --config '<受控配置.json>'
pnpm hr:migration:full:rollback -- --config '<受控配置.json>'
pnpm hr:migration:full:cleanup -- --config '<受控配置.json>'
pnpm hr:migration:full:cleanup -- --config '<受控配置.json>' --recover
pnpm hr:migration:full:status -- --config '<受控配置.json>'
```

`prepare` 只在干净且 SHA 已固定的候选工作树运行。它为本轮生成唯一 Compose/DB/volume/ports/account namespace，复制只读 ETL 与 T4 证据为 `0600` 工件，并生成随机 PostgreSQL 实验凭据；命令输出只包含配置路径、project、run id 和 `productionImport=HOLD`，不得输出凭据内容。A/B 必须分别执行 prepare，之后由 isolation verifier 证明资源完全不同而 C/S/M 完全相同。

两阶段执行命令如下。三份机器复核文件必须是外部 `0600` 非符号链接普通文件：v2 `MACHINE_CANDIDATE` decision 只保存哈希与机器规则结论，真实源状态和值只允许存在于私有 payload，machine attestation 绑定受信任根且不得由运行时使用输入文件自算根。T0 同时抽取人员中实际使用的状态计数、`jobstatecode` 列元数据和完整字典行；状态名称、启用标志、顺序及默认标志都进入只读源 hash，禁止只凭代码或转换器默认分支猜测语义。三件套必须共同绑定当前 `runId`、A/B 标识、C/S/M、T0 manifest、三份 T0 字典证据文件 hash 和预期 PostgreSQL items digest：

```bash
pnpm hr:migration:full:provision -- --config '<本轮配置>'
pnpm hr:migration:full:run -- --config '<本轮配置>'
pnpm hr:migration:full:status -- --config '<本轮配置>' # 必须为 review_hold
pnpm hr:migration:full:resume -- --config '<本轮配置>' --job-state-decision '<v2 MACHINE_CANDIDATE decision>' --job-state-source-payload '<0600 v2 private payload>' --job-state-machine-attestation '<v2 trusted-root machine attestation>'
```

缺少任一工件、工件漂移、自算或错误受信任根、跨 run/A-B、T0 字节变化、数据库 digest 不一致时都保持或回到 `HOLD`，不得猜测映射。进入 load 写阶段后的失败执行本轮 registry-scoped recovery；普通部署和生产历史导入始终不会调用该 resume 入口。

`resume` 操作锁绑定 PID、本机主机指纹、runId、当前 `review_hold` 状态以及 config/registry/journal 指纹。只有同一主机上的 PID 已明确死亡且所有绑定字节未漂移时才能原子接管；活 PID、其他主机或任一指纹漂移都继续 fail closed。测试环境有受 runId 绑定的 commit/journal 故障注入点，仅当 `NODE_ENV=test` 时可用，普通运行与生产无法触发。数据库已提交而 journal 尚未追加时，下一次同内容 resume 必须通过数据库全字段幂等核验后收敛为恰好一条 materialization journal。

最终 A/B 使用总控入口先做只读 preflight，再按 A→B 串行执行全部阶段：

```sh
node scripts/hr-cutover/final-rehearsal-pair.mjs --config-a '<A配置>' --config-b '<B配置>'
ALLOW_YUZHOU_FINAL_REHEARSAL=yes node scripts/hr-cutover/final-rehearsal-pair.mjs --config-a '<A配置>' --config-b '<B配置>' --phase extract --execute --summary '<runtime之外的新checkpoint路径>'
# 两套独立机器复核包生成并校验后，使用新的摘要路径继续：
ALLOW_YUZHOU_FINAL_REHEARSAL=yes node scripts/hr-cutover/final-rehearsal-pair.mjs --config-a '<A配置>' --config-b '<B配置>' --phase resume --checkpoint '<0600 checkpoint>' --decision-a '<A decision>' --payload-a '<A private payload>' --machine-attestation-a '<A machine attestation>' --decision-b '<B decision>' --payload-b '<B private payload>' --machine-attestation-b '<B machine attestation>' --execute --summary '<runtime之外的新最终摘要路径>'
```

preflight 要求干净候选、当前 HEAD 与 C 一致、mapping bundle 与 M 一致、A/B 使用相同 C/S/M、只读 lab 源和六个互不重复的 loopback 端口，并逐项拒绝 DB、Compose、volume、container、role、账号命名空间、目录、凭据或审计路径复用。执行顺序固定为 provision A/B→run A/B 并分别停在 `review_hold`→resume A/B→技术 UAT→25 项 P0 矩阵→备份恢复/故障检测→A/B manifest 比较→T5…T0 rollback→cleanup。`--phase extract` 不需要机器复核工件，它在 A/B 都达到 `review_hold` 后写出受控 checkpoint 并停止；`--phase resume` 才必须提供 checkpoint 与 A/B 各自的 decision/private payload/machine attestation 六件套，缺少、路径复用、受信任根不匹配或任何字节漂移时在 resume 写入前失败。机器凭证只代表可重放技术规则复核，不冒充真人签署；普通部署和生产历史导入仍保持 `HOLD`。任一步失败都会对仍存在的本轮 runtime 执行 registry-scoped `cleanup --recover`；不会继续下一轮或生成 PASS 摘要。

当前总控还要求技术 UAT 摘要明确给出 `p0Execution=PASS` 和 `p0MatrixChecks=25`。仅绑定 P0 matrix hash、`p0Execution=HOLD` 或旧 46 项 UAT 通过均会返回 `FINAL_PAIR_P0_HOLD`，所以在 25 项真实观察执行器接入并用两套新资源重跑前，最终 A/B 和生产历史导入都保持 HOLD。

目录必须为 `0700`，配置、journal、registry、清理账本和审计 bundle 必须为 `0600`。Shell 使用 `exec` 把 HUP/INT/TERM 直接交给 Node runner；Node 是唯一信号 journal/cleanup owner，并先终止活动 child 再按 registry 恢复。失败或中断不会推进成功状态。清理逐项记录 `planned/observed/removed/residualCount`，其中 Compose default network 必须在 container 停止后按精确 project identity 删除并重新枚举；拒绝符号链接和任何未登记 runtime 路径，只对 registry 中的精确文件执行 `unlink`、对已空的精确目录执行 `rmdir`，禁止递归删除运行根；删除后再次实际枚举，任何残留都返回 `RESOURCE_RESIDUAL_NONZERO`。运行时 evidence root 清理后，仅保留配置指定、位于 runtime root 外的 hash-addressable `0600` 审计 bundle。

本入口没有 production import 或 production restore 子命令，也不接受布尔开关作为生产授权。所有结果固定输出 `productionImport=HOLD`。Slice 2 的 fixture 通过只证明编排、失败关闭、信号恢复和零残留合同，不代表真实 A/B 演练、三角色 UAT 或生产导入已经完成。

### 8.0.1 T0→T3 首批机器演练合同

为支持“先完成容易验证的数据，再处理最近三年工资和复杂尾项”，仓库单独冻结 `core_t0_t3` 合同。该合同只允许完整固定前缀 `T0→T1→T2→T3`，回滚只能是 `T3→T2→T1→T0`；不接受任意领域数组、跳域或乱序。T4、T5 在该 profile 中属于明确禁止域，不能要求 T4 evidence 或 T5 materialization key。

首批流程固定为 `provision→extract_t0_t3→machine_review_hold→resume_t0_t3→core_facts→pair_compare→rollback_t3_t0→cleanup`。A/B 仍须使用相同 C/S/M、不同资源、不同外部 trusted root 和各自独立的 v2 decision/private payload/machine attestation；最终 13 类业务、控制及资源残留必须全部为零。

仓库已具备 core 生命周期、哈希链 journal、恢复回滚、事实比较、prepare 和仓库内固定 PostgreSQL lab driver 边界。该 driver 使用独立命名的 Compose/network/volume/container、官方 migration 与 production seed、既有 T0～T3 extract/load/rollback 脚本、T0 v2 机器物化和 13 类 residual 探针；它不引用 T4、T5 或 production historical loader。原 full-domain T0 物化目标守卫保持不变，core 入口只能把该守卫精确收紧到 `jinhu_hr_migration_lab_core_*`。

如需无人值守地完成一个已 prepare 的 core 演练，可使用 `node scripts/hr-cutover/run-core-t0-t3-continuous-lab.mjs --config '<0600 config>' --duration-minutes 300`。该 runner 仅推进当前 journal 的下一可恢复阶段（provision、extract、机器包、resume、rollback、cleanup），并把状态事件和最终摘要写入同一 0700 audit 根；最短窗口为五小时，但在 `cleaned + residual=0` 后会立即结束。任一失败先做该 run 的受控恢复并报告失败码，不会开启生产历史导入，也不会扩大到 T4/T5。

需要把已验证的 core 映射交给后续隔离切片时，runner 可使用 `--stop-after rollback_ready` 写出 `CHECKPOINT_READY` 并保留本 run 的资源；只允许 `review_hold`、`rollback_ready` 或 `cleaned` 三个检查点。后续切片完成后必须从同一 config 恢复反序 rollback 与 cleanup，不能把 checkpoint 当作生产导入授权。

在同一轮 core run 已停在 `rollback_ready` 后，可以执行三角色的真实 API 与无头浏览器技术验收：

```sh
pnpm hr:migration:core-t0-t3:technical-uat -- --config '<同一轮、0600 core 配置>'
```

此入口只复用受控 lab 中已迁移的 T0～T3 数据库、以临时隔离账号执行 59 项 API、22 项负向授权、3 条前端路由和 56 个角色-页面-视口浏览器单元，并将证据写入该 run 的私有 audit 根。它不读取既有用户账号，不升级 full-domain manifest，不把 `rollback_ready` 伪装成 `uat_ready`，结果固定为技术通过或失败、`humanUat=HOLD`、`productionImport=HOLD`。技术验收结束后必须立即从同一 core 配置恢复 continuous runner，完成 T3→T0 回滚与 cleanup；整个 lab 容器销毁前，临时 UAT 记录不得离开该隔离范围。

### 8.0.2 T3 请假、加班和打卡事件源回执

月历与社保快照不代表请假、加班、打卡或日考勤计算事实已经迁移。先通过只读聚合回执确认源表实际数据量；对打卡和日核算仅追加“可关联到源人员”的计数，回执只保存数量和日期边界，不保存人员、卡号、原因、操作人或任何凭据：

```sh
set -a; . database/import-reports/yuzhou-hr/canonical-source-receipt-etl.env; set +a
YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID='<new-run-id>' \
YUZHOU_T3_ATTENDANCE_EVENTS_OUTPUT_ROOT='database/import-reports/yuzhou-hr/t3-attendance-events' \
pnpm hr:migration:t3-attendance-events:profile
```

脚本只接受 migration lab 内的只读 SQL Server 与非 `sa` ETL 登录，输出目录为 `0700`、原始聚合与回执为 `0600`。它不导入、更新或删除源/目标数据；不论是否有历史行，`productionImport` 均固定为 `HOLD`。只有在该回执、字段映射、隔离装载、守恒、回滚和重装都通过后，才可为这些事件另开历史导入切片。

现代在线考勤申请的 PostgreSQL 闭环可在已到达 `rollback_ready` 的同一隔离 core lab 中执行；命令要求 loopback 地址、数字端口和 `jinhu_hr_migration_lab_core_` 数据库前缀，拒绝共享库和生产库。测试覆盖草稿→提交→审批、审批动作链与重叠时段拒绝，并由调用方在完成后继续同一 continuous runner 回滚和 cleanup：

```sh
set -a; . '<0600 core credential root>/postgres.env'; set +a
POSTGRES_HOST=127.0.0.1 POSTGRES_PORT='<core postgres port>' \
pnpm test:hr:attendance-request:pg
```

如需连续完成同一切片，不要手工在检查点之间切换。先用 `core-t0-t3:prepare` 建立新的、已提交且 `0600` 的 config，然后将该 config 交给 `hr:migration:t3-attendance-request:lab`。编排器强制不少于 300 分钟的容量窗口，顺序执行 `rollback_ready` 检查点、真实 PostgreSQL 申请闭环、T3→T0 回滚和 cleanup；成功时只接受 `residualCount=0`，失败也只对同一 lab 做恢复，不会接触 production、T4 或 T5：

```sh
pnpm hr:migration:t3-attendance-request:lab -- \
  --config '<0600 core config>' --duration-minutes 300 --poll-seconds 1
```

当前仍保持 `executionStatus=SPEC_FROZEN`，不能把 driver 接线等同于 A/B 真实通过。prepare 会保留固定 backup 的私有绝对路径并绑定实际 hash，但在存在可验证的 backup→source container/database restore receipt、实时只读状态和容器身份联合证明前，extract 固定以 `CORE_SOURCE_RESTORE_BINDING_REQUIRED` 停止；仅传 `YUZHOU_BACKUP_SHA256` 不构成源证明。T1 异动和 T2 合同 loader 分别强制读取 event type/state 与 contract type/state 四份 approved dictionary hash；现有 v2 机器包仅签署 T0 job-state dictionary，因此 T1/T2 写入前继续以 `CORE_NON_T0_DICTIONARY_ATTESTATIONS_REQUIRED` 停止。目标业务 canonical 与 protected side-effect facts 尚未实现，facts 阶段以 `CORE_BUSINESS_CANONICAL_FACTS_REQUIRED` 停止，不能用 record-map hash 或硬编码零副作用替代。生产历史导入始终为 `HOLD`。

```sh
pnpm test:e2e:yuzhou-core-t0-t3-rehearsal
node scripts/hr-cutover/verify-core-t0-t3-rehearsal-contract.mjs
```

### 8.1 隔离演练备份、故障检测与新库恢复

真实 `lab` 演练只有在同一轮连续 T0→T5、PostgreSQL global facts 和三角色技术 UAT 均已通过、最新 manifest head 为 `uat_ready` 时，才能执行恢复证明：

```sh
pnpm hr:migration:full:backup-restore -- --config '<受控配置.json>' --fault REGISTERED_FILE_UNREADABLE
pnpm test:e2e:yuzhou-full-domain-backup-restore
```

该入口只接受 loopback Docker Unix socket、与配置逐字相同的 `jinhu_hr_migration_lab_full_*` database/Compose project 和其受管 PostgreSQL 容器。它在任何创建前把 restore database、实际执行 restore 的最小隔离 role、备份/恢复目录、dump、TOC、文件快照、报告和 operation lock 写入本轮 resource registry；已存在、未登记、生产/共享标记、非 loopback 发布、Compose label 漂移或并发 operation 均失败关闭。

数据库备份固定使用 `pg_dump -Fc --no-owner --no-privileges`，保存实际 dump SHA-256、字节、原始 TOC SHA-256 和去除非确定性注释后的 TOC SHA-256。文件根按相对路径、字节和内容 SHA-256 形成稳定清单并复制到 0700 受控目录，复制文件强制 0600；空文件根也有明确的零条目 canonical hash。符号链接、特殊文件、路径逃逸或不可读对象全部拒绝。

v1 故障只允许以下可逆、run-scoped 已登记探针，不接受任意 SQL、路径或进程参数：

- `REGISTERED_FILE_UNREADABLE`：仅把本轮已登记的专用文件探针临时设为不可读；只有文件树 verifier 实际返回 `FILE_TREE_UNREADABLE` 后才继续，并在 `finally` 恢复权限。

恢复永远先创建不同名称的新 `jinhu_hr_migration_lab_full_restore_*` 数据库，使用 `pg_restore --exit-on-error --no-owner --no-privileges`，不允许 `--clean`、`--create` 或覆盖事故/source 数据库。恢复后逐字节比较双 migration-history 文件名/状态/checksum、平台 catalog、HR global/domain canonical、source-object ledger、quarantine reason ledger、side-effect facts 与文件树；只有全部相等时才记录 `rpoObservedObjects=0`。`rtoObservedMs` 只是 monotonic 实测值，业务目标仍固定为 `UNAPPROVED/RTO_RPO_UNAPPROVED`，不得由工具自动签署。

成功报告和 superseding parent manifest 只含 hash、数量、相对工件路径和 measured timing，权限为目录 0700、文件 0600；`hardGates.restore=PASS` 不改变 `humanUat=HOLD`、`productionImport=HOLD` 或独立的 `productionRestore=HOLD`。失败路径只删除本 runner 已登记的精确 restore database/role/files/directories，并重新枚举要求 `residualCount=0`；不得递归清理宽泛路径。随后仍须按既有命令执行 T5→T0 rollback 和完整 lifecycle cleanup，且只有最终资源总账为零才算本轮闭环。

## 9. Parent manifest 与数据库事实验证（Slice 3）

Parent manifest 是 append-only 状态事实。首次 manifest 写入后不可覆盖；修正必须生成新文件，并用 `supersedesManifestSha256` 精确引用前一份规范化 manifest hash。链中所有 manifest 必须绑定同一个 parent run 和同一 C/S/M，且只允许一个根、一条无环路径和一个 head；断链、分叉、循环、旧文件字节变化都会失败。证据索引不接受工具自报的 bytes、mode 或 SHA：builder 会从 `0700` evidence root 内重新解析 realpath，拒绝符号链接/逃逸，读取实际 `0600` 文件，重新计算 bytes/SHA-256，并扫描秘密和个人/工资字段。

`verifying` 状态的 lab runner 必须同时取得 hash-addressed manifest chain 和 PostgreSQL fact schema；缺任一项均以 `GLOBAL_FACTS_REQUIRED` 停止，不能进入 `uat_ready`。只读 SQL verifier 在目标 PostgreSQL 事务中直接计算：

- 逐 domain/source object 的数量与金额守恒，金额始终为 PostgreSQL `numeric` 并输出 decimal string；
- `approvedIgnored` 的受控 reason code、detached approval 实际字节 hash；
- 员工、合同、异动、考勤社保、工资、档案/文件 owner 关系，以及 tenant、park、source identity 和 `legacy_record_map` 一致性；
- 排除 target UUID、sequence、run id、创建/更新时间后的 domain hash 和 global hash，同时严格区分 JSON `null` 与数值 `0`；
- 锁定保护表的 before/after 实际 hash，任何 allowlist 外变化或缺少锁定快照都会失败。

fixture 验证入口：

```sh
pnpm test:e2e:yuzhou-full-domain-slice3
```

fixture 使用独立 `template0` PostgreSQL 数据库，并在结束时删除该精确数据库。它覆盖 manifest/evidence 篡改、supersede 断链/分叉/循环、金额差 `0.01`、非法或无签署的 approved-ignore、NULL/0、随机 UUID/time 排除、跨租户、孤儿、record-map 错链、保护表变化以及 manifest 自报与数据库事实不一致。该 fixture 不读取真实玉舟 staging，不运行 T4，不创建 A/B 正式演练证据，生产导入仍固定为 `HOLD`。
fixture lifecycle 只停在 `verifying` 并返回 `FIXTURE_CANNOT_ENTER_UAT_READY`；fixture 结果不能进入或冒充 `uat_ready`。只有 lab backend 的真实 manifest chain、实际 evidence 字节和 PostgreSQL facts 同时通过，才允许推进到 `uat_ready`。

## 10. T4 真实工资历史与只算不发（Slice 4）

T4 抽取只允许使用固定备份、只读 SQL Server 恢复库和非 `sa/sysadmin` 的最小 ETL 账号。正式证据必须对同一源执行两次完整抽取，逐文件比较哈希，并同时固定 35 张工资表、46,092 条工资行、711 个项目、244 个公式、1,431 条关账、647 条账套成员、9 条税率和 2010～2026 年范围。任何业务内容哈希变化都会使旧 T4 证据和后续 A/B 证据失效。

玉舟已停用且无新增数据，不设计 S0→S1 delta，也不等待停写窗口；固定 backup/catalog/business hash 是唯一源基线。全量抽取仍审计46,092行和2010～2026范围，但生产热候选固定 `YUZHOU_T4_PERIOD_START=2024-01-01`、`YUZHOU_T4_PERIOD_END=2026-12-31`。候选精确守恒为 `8,342 = 8,320 loaded + 22 quarantined`、190,374条明细、266条窗口内关账；候选源/加载净额均为15,723,009.9100。2010～2023共37,750行、源净额86,471,046.8900，只登记 `deferred_cold_archive`，不写热历史表，也不阻断 T0/T1/T2/T3/T5 或全局功能演练。

真实装载必须使用 `template0` 新库和官方 migration runner。候选项目按 `legacy scheme + source content hash shard` 稳定分片；任一分片失败回滚整个 run。完成后执行受控 rollback、实际 residual=0 和同内容 reload，并复核正式工资、工资条、支付、银行、税务、消息/outbox及在线员工/薪酬/考勤表前后哈希不变。

`000264_hr_payroll_legacy_item_bulk_guard.sql` 只把快照项目 INSERT 的批次状态检查从逐行查询改为同事务的 statement-level transition-table 集合检查。未知或已发布批次仍使整条 INSERT 回滚；UPDATE/DELETE 仍逐行禁止，原 FK、唯一性、owner、金额和不可变约束均保留。不得通过禁用 trigger、`session_replication_role` 或放宽 statement timeout 绕过装载门禁。

双轨计算只读取 `parse_status=approved_for_simulation` 且 AST、依赖和 parser version 可重新验证的公式，并冻结员工、定薪、保险、考勤输入、公式、engine 和 reconciliation policy 版本。条件表达式、解析失败、循环依赖、缺项目、除零、溢出或缺少权威净额映射全部失败关闭，绝不能按 0 继续。模拟只写 `hr_payroll_reconciliation_*`，不得写正式 payroll run、payslip、payment、bank、tax、message 或 outbox。

工程门禁入口：

```sh
pnpm test:e2e:yuzhou-t4-readiness
node scripts/hr-cutover/compile-t4-readiness.mjs \
  --source-evidence .trellis/tasks/08-24-yuzhou-hr-t4-payroll-history/research/source-evidence-manifest.json \
  --business-inputs scripts/hr-cutover/fixtures/t4-business-inputs-missing.json
```

公式适用范围、逐账套/项目容差和业务状态语义改由只读源事实、固定规则版本、金额守恒、A/B 对账及 hash-addressed `machine_attestation` 自动复核。机器凭证不得写入或冒用自然人身份；语义不唯一的记录进入 quarantine 并计入守恒。缺输入时稳定输出对应的机器证据缺失 reason code 与 `NO_GO`；无论是否齐备，Slice 4 的 `productionImport` 在真实 A/B、restore、UAT、runtime、side-effect 和 residual 门禁闭环前始终为 `HOLD`。

## 11. 客户端与集团 Web 双源核对

玉舟迁移现在有两个数据库来源：`yuzhou_desktop_client_salary` 与 `yuzhou_group_web_enterprise_hr`。抽取、暂存、映射、隔离和审计记录必须带明确 `source_id`；不得把相同表意的两行无来源覆盖，也不得按姓名自动去重。字段级来源优先级需要逐域批准，默认只允许证件规范化哈希确认同一自然人，其次使用工号；证件与工号互相冲突时整行进入人工隔离。

运行任何双源装载前先验证静态基线：

```sh
pnpm test:e2e:yuzhou-legacy-dual-source-reconciliation
```

当前只读基线固定集团 Web 为 438 表、5449 字段、320406 行和 548 个员工主档；专用只读账号还能看到 768 个视图、340 个过程、9 个函数和 79 个触发器。表/字段口径包含 SQL Server 2005 的 1 张零行兼容表，结构核对不得擅自增加 `is_ms_shipped=0` 过滤。134 个在职候选中，19 个与客户端来源匹配，115 个必须形成脱敏人工核对任务；不得直接创建 `hr_employee` 或 `sys_user`。核对证据只允许保存来源身份哈希、匹配原因码、冲突码和人工决定，不得保存姓名、证件原文、联系方式或凭据。

双源演练的最小闭环为：两次只读抽取哈希一致 → catalog/关键表计数一致 → 生成核对队列 → 人工决定作为独立签署证据 → 隔离 PostgreSQL 装载 → 数量和关联核对 → 精确回滚 → residual=0 → 同内容重装。尚未实现或签署任一步时，状态保持 `HOLD`。普通生产部署、schema migration、production seed 和服务启动均不得隐式执行双源历史 loader。

集团 Web 数据库为 SQL Server 2005，Microsoft ODBC 18 会在预登录阶段被旧协议重置；本机只读工具使用 FreeTDS 1.5+ 和 `TDSVER=7.0`。专用 ETL 账号必须由一次性受控 provisioner 创建，使用随机强密码，权限固定为数据库 `SELECT + VIEW DEFINITION`，并显式拒绝 `INSERT/UPDATE/DELETE/EXECUTE`；旧应用的 `sysadmin/db_owner` 账号不得用于抽取。凭据只写 Git 忽略的 0600 文件，命令输出不得包含地址、用户名或密码。

真实只读剖面入口：

```sh
export ALLOW_YUZHOU_MIGRATION=yes
export YUZHOU_MIGRATION_RUN_ID='groupweb_profile_<run>'
export YUZHOU_GROUP_WEB_ETL_CREDENTIAL_FILE='<0600 集团 Web ETL 文件>'
pnpm hr:migration:group-web:profile
```

2026-08-28 连续两次真实剖面文件 SHA 一致，精确结果为 438 表、5449 字段、215 个非空表、320406 行、768 个视图、340 个过程、9 个函数和 79 个触发器；17 个关键表及逐表 `COUNT_BIG(*)` 前缀汇总均通过合同。剖面只含结构和数量，不含人员值。

员工双源核对入口会在内存中读取集团 Web `vEmployeeNumb/vNumber/vIDCard/DelFlag/isfire` 与客户端 `person.person/idcard`，使用独立 32 字节 0600 HMAC 密钥产生不可逆摘要，原文不落盘：

```sh
export YUZHOU_MIGRATION_RUN_ID='dual_source_employees_<run>'
export YUZHOU_CLIENT_ETL_CREDENTIAL_FILE='<0600 客户端恢复库 ETL 文件>'
pnpm hr:migration:dual-source:employees
```

真实 A/B 抽取的 artifact SHA 一致：2949 个客户端员工、548 个集团 Web 员工、134 个在职候选；工号匹配 313、证件 HMAC 匹配 308、并集匹配 316、无匹配 232；在职候选中 19 个匹配，115 个进入 `pending_manual_review`。姓名匹配被禁止，队列不自动创建员工或账号。

一次性 PostgreSQL 演练入口：

```sh
export YUZHOU_MIGRATION_RUN_ID='dual_recon_pg_<run>'
export YUZHOU_RECONCILIATION_ARTIFACT='<0600 employee-reconciliation.json>'
export YUZHOU_RECONCILIATION_REHEARSAL_REPORT='<0700 目录中的报告路径>'
pnpm hr:migration:dual-source:rehearse
```

A/B 演练均得到 `loaded=115`、`rollbackResidual=0`、`reloaded=115`、`containerResidual=0`、`personalValuesStored=false`。PostgreSQL 随机密码通过 0600 临时 env 文件传递，容器启动后立即删除，结束时删除精确命名容器。该技术闭环不等于 115 人已经完成人工业务认定，也不解除生产 `HOLD`。
