# 玉舟资料与运行环境审计（2026-08-19）

## 已读取材料

- 仓库：`docs/yuzhou-hr-compatibility-development-plan.md`、`docs/yuzhou-hr-detailed-implementation-plan.md`。
- 下载目录：220 个文件全部读取或二进制核验；218 个文本文件合计 743,703 字节、17,570 行，UTF-8/GB18030 解码无失败。
- 二进制：`.DS_Store` 8,196 字节；`玉舟人力资源管理系统分析产出-260819.7z` 86,044 字节。
- 两份分析报告内容完全相同，SHA-256 均为 `55ad22a8a24a91b1840d87a1d61a045b1b48c4a3cd128b144d0e728d6f9c4deb`。
- DDL manifest：`schema_tables.sql` SHA-256 `4bc267b5b6b5f15cf367ec38caaf4bc2559ebe0666fd2cb9fdecd406c2ec1f2e`，解析出 162 表。
- 列字典：`table_columns.md` 3,175 行；帮助文档 338 行；字典导出 1,046 行。

## 数据库对象复核

文件级实数：194 个 procedure、15 个 scalar function、1 个 inline table-valued function、2 个 trigger，共 212 个对象源码。过程前缀为：`u_*` 75、`web_*` 49、`bs_*` 24、`ext_*` 14、`dt_*` 31 左右、`pe_*` 1。报告中的“169 个存储过程”不是文件级总数，需通过真实库 `sys.procedures` 解释系统过程、备份对象和导出历史差异。

过程源码中出现 SELECT 199 个对象文件、EXEC 77、UPDATE 36、INSERT 25、DELETE 7、ALTER TABLE 2；说明旧业务逻辑大量封装在 SQL Server，工资/考勤迁移不能只搬表数据而忽略过程语义。

高频依赖对象：`person` 309 次、`departmentcode` 129、`person_insure` 125、`timekeeprecord` 96、`job` 58、`readjust` 18、`timekeepitemcode` 18、`assessmentmaster` 17。迁移优先顺序应从组织/人员/状态开始，再进入考勤、社保、绩效和工资。

## 旧系统关键兼容结论

- 员工主档是 138 列宽表，包含明文登录字段、照片 image、薪资/银行/社保和自定义字段；必须分域、分权和文件化。
- 组织层级隐藏在 3/6/9/12 位编码中；迁移后保留 legacy code，但目标结构必须有显式 parent_id。
- 6,887 条 `readjust` 保留前后快照，是员工生命周期历史的权威来源；半完成审批字段不能直接驱动当前状态。
- 35 张动态工资表配 711 个工资项目、244 条公式和 1,431 条月度关账；业务抽象应保留，动态列实现必须淘汰。
- 35,008 条社保月台账和 12 期费率政策具有独立历史价值，不能只迁员工当前社保基数。
- 历史工资数据约 4.5 万行，规模足以全部转为规范化只读快照，不需要只保留近 N 年。
- 旧密码不得输出或迁移；照片/附件必须做 MIME 魔数、hash、大小和读取权限验证。

## 本机环境结论

已安装：Node v24.18.0、pnpm 9.12.0、Git 2.50.1、PostgreSQL 16.14、Python 3.14.6、jq、rg、OpenSSL；Homebrew PostgreSQL 16 正在 5432 运行。机器为 arm64、16GB、Rosetta 已安装、磁盘余量约 743GB。

已补齐并验证：Colima 0.10.3、Docker CLI 29.7.2 / Engine 29.5.2、Docker Compose 5.5.0、p7zip；Colima 以 Apple Virtualization Framework、4 CPU、8GB、Rosetta 运行。`linux/amd64` Alpine 实测返回 `x86_64`。SQL Server 2022 Developer 16.0.4265.3 已在 `127.0.0.1:14333` 健康运行并完成真实查询；Jinhu PostgreSQL 实验库在 `127.0.0.1:15432` 运行，未占用 Homebrew PostgreSQL 的 5432。

Jinhu 空库完整链路实测：221 个迁移和 8 个 migration prerequisite 全部成功；production seed 全部成功；bootstrap 前基线按预期仅因无管理员失败；创建一次性实验管理员后基线为 WARN，警告仅为本地文件存储根、短信验证码可见性、微信 mock 三个环境变量未显式设置。未绕过迁移 checksum/history 门禁。

7z 归档完整性测试为 `Everything is Ok`：内含 217 个文件、716,875 字节；展开材料总计 220 个文件。机器清单已生成到 `research/generated/legacy-manifest.json`，确认 218 个文本文件、17,570 行、194 个过程源码、16 个函数源码、2 个触发器源码和 1 组重复报告。

2026-08-20 在下载目录的飞书资料收件箱发现 `hr2026081914.dbk`。文件为 Microsoft SQL Server Windows NTbackup archive，大小 364,988,928 字节，SHA-256 为 `3ed50b9a2ba420c0fb7a9c2628f9a2d62a05e7a14ba574929bc145ac47a9036e`。已只读复制到 Git 忽略的 `database/backups/yuzhou-hr/`，源/副本 hash 一致。可打印内容包含 `person`、`personinfo`、`personjob`、`personlink`、`department` 和 `readjust` 等对象线索，与玉舟 HR 材料一致。

2026-08-20 已通过 fail-closed 恢复脚本完成 `RESTORE HEADERONLY`、`VERIFYONLY`、`FILELISTONLY` 和隔离恢复。目标库为 `YuzhouHR_Lab_20260820_intake01`，状态 ONLINE/READ_ONLY，collation 为 `Chinese_PRC_CI_AS`，兼容级别 100；catalog 实测为 162 张表、169 个存储过程、16 个函数、2 个触发器。由此确认旧分析报告中的“169 个存储过程”是数据库当前对象口径，194 个过程源码文件包含重复、历史或未部署文件，后续按对象名/hash 做差异清单。

## 当前仓库风险

- `main` 对 `origin/main` ahead 23 / behind 31。
- 有其他未跟踪 Trellis 任务和 `docs/agent-memory/`，必须保留。
- 新迁移编号必须在实施瞬间重新扫描；不得依据当前最大号提前占号。
- 标准数据库链路还需验证历史迁移 000175 等既有生产顺序问题，不能以手工执行 HR 五个迁移替代完整 Release Smoke。

上述风险中的完整迁移链已于本任务验证通过，`000175` 未形成阻断；仍保留历史重复 `000136` 编号警告。HR 集成到最新主线后使用 `000230～000242` 连续编号，新增迁移必须在真正实施前重新扫描编号。
