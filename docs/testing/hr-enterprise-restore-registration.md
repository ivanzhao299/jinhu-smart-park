# 独立 HR 配对恢复登记

入口：`node scripts/hr-enterprise/register-restored-pair.mjs /absolute/private/registration-config.json`。这是离线恢复运维入口，默认 `mode=check`；只有显式 `mode=apply` 且固定目标物理身份时才改写恢复端的文件绑定标记。不会修改业务行、迁移历史或源实例；正常 RuntimeIsolationService 不增加任何绕过选项。

先按 [恢复内容配对核对](./hr-enterprise-restored-pair.md) 准备冻结 dump、原配对清单、恢复数据库及附件。清单期待值必须来自冻结源备份，不能在待验证目标上生成。目标需为专用独立 HR 数据库和真实 0700 文件根，原绑定 marker 必须包含在冻结文件清单中。先准备安装清单列出的精确 NOLOGIN/NOINHERIT 能力角色，再恢复带 ACL 的 dump；含 GRANT 的完整安装 SQL 不可在对象恢复前直接执行。

在原 check 配置基础上增加：

| 字段 | 合同 |
| --- | --- |
| `mode` | 缺省为 `check`；执行须明确 `apply` |
| `recoveryCatalogPath` / `recoveryCatalogSha256` | 私有冻结恢复目录文件的真实绝对路径 / 独立钉住的原始字节 SHA256 |
| `sourceSchemaPath` | 私有冻结源 `pg_dump --schema-only --no-owner --no-privileges` 原始文件 |
| `pgDumpExecutable` | `pg_dump` 可执行文件路径，主版本必须与源目录及目标 PG 一致 |
| `expectedTargetPhysicalIdentity` | apply 必需；先通过 check 取得并核对的精确目标物理身份摘要 |
| `target.user` / `target.password` | 明确恢复管理员及密码；只放私有0600配置，不进参数或日志 |

当前恢复入口使用密码 TCP 连接，不接受 node-pg 的 `ssl` 对象；受管 TLS 连接需先实现并验证驱动与 pg_dump 的一致配置，再用于相应部署。

冻结恢复目录格式：

| 字段 | 合同 |
| --- | --- |
| `formatVersion` | `1` |
| `pairManifestSha256` | 原配对清单的精确字节摘要 |
| `sourcePhysicalIdentity` | SHA256(JSON.stringify([源 cluster system_identifier 字符串, 源数据库 OID 字符串])) |
| `sourceFileRootStatIdentity` | SHA256(JSON.stringify([源文件根 stat.dev 数字, stat.ino 数字]))，拒绝同一物理目录的其他挂载路径；不同主机恰巧相同也保守拒绝，应选另一专属目标目录 |
| `postgresMajor` | 源 PG 主版本整数 |
| `sourceSchemaSha256` | 源 schema-only 原始文件字节摘要 |
| `canonicalSchemaSha256` | `normalizeRestoreSchema` 对源 schema-only 规范化后的 UTF8 字节摘要 |
| `roles` | `observeRestoreCatalog` 返回的能力角色对象数组，按名称排序，所有登录/继承/特权标志为 false、无任何方向成员关系 |
| `routines` | 同观察器返回的全部 public 函数/过程数组，含 signature/kind/definer/config/definitionSha256/grants，按签名排序 |

目录准备属于备份运维：在冻结源的一致快照中读取目录和 schema-only，并与配对备份绑定、独立核对摘要。本入口不自动生成期待值或复制生产数据。`pg_control_system()` 身份探针明确要求恢复管理员具备权限；无权限直接失败，不提权或退回连接字符串猜测，不把它接入生产普通只读诊断。

检查顺序：固定输入摘要与安装版本 → 排他文件维护锁 → DB 事务维护锁 → 无其他目标客户端 → 全部业务表 SHARE ROW EXCLUSIVE 锁 → 目标物理身份/角色/完整函数目录及安装要求的 ACL → 原标记或精确同一登记重放 → 完整文件清单 → 同一导出快照的 schema-only 及逐表内容 → 新快照再核对目录权限及目标客户端 → 再核对 marker 身份/字节 → 根内0600临时文件 fsync、原子替换及目录 fsync。

只允许已复核的命名 CHECK 精确反解析形式重写：原有四条范围/成员约束，以及迁移382的四条提醒枚举数组转换和一条收件范围 AND 结合形式。提醒约束在此前版本可缺省；一旦出现，必须恰为单条且与固定列、值、运算符及边界完全一致。不是通用的去括号或类型转换忽略；任何其他结构差异都失败。即使冻结目录里含有扩大的权限，也必须另符合当前安装清单的精确函数 ACL；不能把源目录当作任意放权依据。表锁阻止正常业务写入和现有表DDL；管理员必须在整个离线维护期间停止其他运维，工具不防护恶意主机/数据库管理员并发修改全局状态。

成功回执为聚合 JSON，含源/目标身份和 marker 摘要、表/行/文件/函数/角色数量及：

- `CHECK_ONLY`：不改 marker；维护锁在结束时释放。
- `APPLIED`：仅替换一次目标 marker；其恢复来源、清单和目标摘要持久化在新 marker 中。
- `VERIFIED_REPLAY`：重新核对同一冻结恢复，精确相同登记不重写 marker；不同来源、目录或目标不能覆盖。

重放用于尚未切换业务的同一恢复快照。系统开始正常产生新业务、会话或审计后，数据不再等于冻结期待值，不应重放恢复；正常启动继续校验已登记目标绑定。进程中断若已完成原子替换，可由精确新标记识别重放；强杀遗留的同级维护锁须先核实进程/资源身份并由运维处理，本入口不自动删除未知锁。常规失败清理只释放本次锁和临时文件，保留原标记或已原子完成的目标标记及原始错误证据。

定向测试：`node --test scripts/e2e/hr-enterprise-restored-pair.test.mjs scripts/e2e/hr-enterprise-restore-registration.test.mjs`，纳入 CI。实际新 owned 实例另验证 check/apply/重放、结构/ACL/角色/文件/目标/活动客户端负例，登记前后真实编译 guard，以及 ready、密码登录、企业上下文、合同、培训、消息和附件字节回读。通过后精确停止该次 API 并删除该次容器/卷/文件目录，保留源实例和备份。

本入口和本地演练均不代表生产恢复 RTO/RPO、真实岗位/工资验收、跨企业关联重绑定或完整独立产品验收。新 marker 中附加恢复信息不改变业务标识，也不迁出当前生产 HR 事实。
