# 玉舟 HR 兼容迁移实验室运行手册

## 1. 用途与边界

本手册用于玉舟集团版 V10 到 Jinhu Smart Park 独立人力资源模块的迁移演练。实验室由两个隔离数据库组成：Jinhu PostgreSQL 目标库和玉舟 SQL Server 源库。源库只读，数据只允许按“源库 → staging → 目标库”方向流动。

当前材料没有 `.bak`、`.dbk`、`.mdf` 或 `.bacpac`。因此当前阶段可以完成环境、对象清单、结构适配、合成数据和迁移框架验证，但不能宣称已完成 2949 名员工等真实业务数据迁移。

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
