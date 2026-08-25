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

### T5 招聘、档案、培训和奖惩历史

T5 使用 `000256_hr_legacy_t5_history.sql` 的独立历史表，不调用在线 HR Service。当前恢复库的真实 profile 是 9,140 行：`family=4560`、`his=375`、`knowhow=6`、`ticket=237`、`person.photo=2949`、`docs=1003`、`trainhis=2`、`bonuscode=8`；`accept/course/train/jobtrain/bonusrecord` 为空，`jch_1` 不存在。旧静态报告里的候选人数不能替代这次实测和确定性抽取证据。

抽取必须连续运行两次并比较 manifest 的 `businessSha256` 和每个领域文件哈希。当前受控快照的业务哈希为 `ab16152a6dbcb36219e9f3b1476be0ef3d925391ae6c41fc27b8609cbc4ee96c`。若 `jch_1` 后续真实出现，抽取器会失败，必须先冻结其显式列合同，不能把它当成空表。

加载器会重新规范化计算 catalog+domains 业务哈希，不能仅信任 manifest 自报值；staging 目录和 manifest 必须分别为 `0700/0600`。加载事务对在线员工、账号、薪酬、工资、工资条、绩效和统一消息表持有共享锁并比较前后哈希，同时独立核对总量、逐来源、隔离错误和 record-map 守恒。任何一项不一致都会整批回滚。

```sh
export ALLOW_YUZHOU_MIGRATION=yes
export YUZHOU_ETL_CREDENTIAL_FILE='<本机 0600 的只读 ETL 凭据文件>'
export YUZHOU_MIGRATION_RUN_ID=t5extract_<run>
pnpm hr:migration:t5:extract

export YUZHOU_TARGET_DATABASE=jinhu_hr_migration_lab_<run>
export YUZHOU_STAGING_DIR='<上述抽取 staging 目录>'
export YUZHOU_T5_BUSINESS_SHA256=ab16152a6dbcb36219e9f3b1476be0ef3d925391ae6c41fc27b8609cbc4ee96c
pnpm hr:migration:t5:load

export ALLOW_YUZHOU_ROLLBACK=yes
pnpm hr:migration:t5:rollback
```

`docs` 的 1,003 行均没有 `Cont/FPath/FType`，只能记录为空且不可读的历史证据；不能生成下载地址。`person.photo` 仅保存内容 SHA-256、大小、魔数识别 MIME 和可读性证据，不把旧路径当成 URL。员工映射不唯一或缺失、`his` 所有者语义无法证明的行进入脱敏 quarantine。

生产 T5 导入始终为 `HOLD`。普通 schema 发布不得运行 T5 loader；只有单独的 run 级审批、目标备份和停机窗口才能解除此门禁。

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
planned → provisioned → extracting → loading → verifying → uat_ready → rollback_ready → cleaned
```

六域正序固定为 T0→T5，回滚固定为 T5→T0。每个 child 使用 `<parent>-t0`…`<parent>-t5`，adapter 只向旧脚本传递白名单环境变量，并把目标数据库、PostgreSQL 容器和 Compose project 重新绑定到当前 parent。T1～T4 已补齐与 T0/T5 相同的 pnpm 命令面；所有 rollback 都必须同时具备迁移开关与 rollback 开关。旧转换 SQL 和业务映射语义没有复制或放宽。

配置的 `backend` 只能是 `fixture` 或 `lab`。`lab` 目标数据库及 Compose project 必须逐字相同并匹配 `jinhu_hr_migration_lab_full_*`，只发布 `127.0.0.1` 端口，数据库、volume、container、role、目录、三角色账号命名空间、文件、端口、进程和凭据工件均属于该 run。A/B 配置必须使用相同 C/S/M，同时这些资源逐项不同。生产、共享、默认目标会在任何写入前被拒绝。

命令入口为：

```sh
pnpm hr:migration:full:provision -- --config '<受控配置.json>'
pnpm hr:migration:full:run -- --config '<受控配置.json>'
pnpm hr:migration:full:rollback -- --config '<受控配置.json>'
pnpm hr:migration:full:cleanup -- --config '<受控配置.json>'
pnpm hr:migration:full:status -- --config '<受控配置.json>'
```

目录必须为 `0700`，配置、journal、registry、清理账本和审计 bundle 必须为 `0600`。Shell 使用 `exec` 把 HUP/INT/TERM 直接交给 Node runner；Node 是唯一信号 journal/cleanup owner，并先终止活动 child 再按 registry 恢复。失败或中断不会推进成功状态。清理逐项记录 `planned/observed/removed/residualCount`，拒绝符号链接和任何未登记 runtime 路径，只对 registry 中的精确文件执行 `unlink`、对已空的精确目录执行 `rmdir`，禁止递归删除运行根；删除后再次实际枚举，任何残留都返回 `RESOURCE_RESIDUAL_NONZERO`。运行时 evidence root 清理后，仅保留配置指定、位于 runtime root 外的 hash-addressable `0600` 审计 bundle。

本入口没有 production import 或 production restore 子命令，也不接受布尔开关作为生产授权。所有结果固定输出 `productionImport=HOLD`。Slice 2 的 fixture 通过只证明编排、失败关闭、信号恢复和零残留合同，不代表真实 A/B 演练、三角色 UAT 或生产导入已经完成。
