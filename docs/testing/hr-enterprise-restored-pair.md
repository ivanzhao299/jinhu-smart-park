# 独立 HR 恢复内容配对核对

配对内容通过后，如需对离线恢复目标登记文件绑定，使用独立的 [配对恢复登记入口](./hr-enterprise-restore-registration.md)；本页 check-only 工具本身仍不修改 marker。

入口：`node scripts/hr-enterprise/verify-restored-pair.mjs /absolute/private/check-config.json`。该命令只检查，不迁移、不发薪、不改数据库、不改文件 marker、不启用恢复实例。

配置和 manifest 均须为真实绝对路径、非链接、单链接普通文件，权限 0600（或更严格）；凭据只放配置，不提交。成功 stdout 为一条聚合 JSON；失败 stderr 仅固定错误代码、退出 1，不打印数据库错误或路径。请将实际运维回执保存在私有目录。

配置结构（以下为合成占位，实际文件不要提交）：

```json
{
  "mode": "check",
  "manifestPath": "/private/frozen-manifest.json",
  "manifestSha256": "独立核对并钉住的manifest原始字节SHA256",
  "dumpPath": "/private/retained.dump",
  "fileRoot": "/private/restored-files",
  "target": {
    "host": "127.0.0.1",
    "port": 5432,
    "user": "restored_reader",
    "password": "仅放私有配置",
    "database": "dedicated_restored_hr"
  }
}
```

manifest 由已冻结且核对过的备份材料准备，不能在待验证目标上临时生成期待值。字段为：

| 字段 | 合同 |
| --- | --- |
| `formatVersion` / `runtimeMode` | `1` / `hr_enterprise` |
| `fingerprintFormat` | `postgres-copy-jsonb-text-c-v1` |
| `sourceDatabaseIdentity` | SHA256(JSON.stringify([源 host, String(源 port), 源 database]))，与原 runtime marker 一致 |
| `sourceFileRootIdentity` | 原文件根真实绝对路径 UTF8 字节的 SHA256 |
| `installManifestSha256` | 当前 `database/hr-enterprise/install-manifest.json` 原始字节 SHA256 |
| `dump` | `{ "bytes": 正整数, "sha256": 小写64位摘要 }` |
| `tables` | 全部 public 普通表名到 `{ "rows": 非负整数, "sha256": 摘要 }` 的映射，含安装历史及模式表 |
| `files` | 全部相对文件名到 `{ "bytes": 非负整数, "sha256": 摘要 }` 的映射，包含 `.jinhu-hr-enterprise-root.json` |

行摘要与原恢复审计一致：UTC 会话中按 `to_jsonb(t)::text COLLATE "C"` 排序，对 `COPY (SELECT to_jsonb(t)::text ...) TO STDOUT` 的文本编码累计 SHA256。空表为零行、空字节 SHA256。源导出必须共享同一个只读快照；不能用当前源库读数替代旧备份的冻结期待值。

限制为最多 500 张表、每表 500 万行、10 万个目录条目和 32 层目录；分区表/外表暂不支持并拒绝。逐查询 30 秒、锁等待 3 秒；超时/权限/连接失败都不补零。附件前后两次清单核对相同，仍不是文件系统一致快照或并发冻结证明。

成功只证明 dump 字节、当前安装版本/历史和恢复数据库/文件内容与提供的冻结清单一致。安装历史相同不能代替完整结构或函数 ACL 相同，连接配置 tuple 不证明物理实例独立。工具不核验跨服务器角色、生产容量/RTO/RPO，也不提供清单生成或恢复登记。PASS 保留 `runtimeRegistration=NOT_EXECUTED`、`restoredHttp=NOT_EXECUTED` 和 `fullProductAcceptance=false`；不能用它绕过 RuntimeIsolationService 的正常拒绝。

定向测试：`node --test scripts/e2e/hr-enterprise-restored-pair.test.mjs`，已纳入 CI 的独立步骤；该步骤只跑确定性测试，不连接生产或恢复数据库。实际演练必须选有明确 owned 标记的本地合成资源，从既有冻结 dump 恢复新空库、复制并验证冻结文件，执行全量正向和漂移负例。清理只删除该次新建的数据库与目标文件目录，保留原实例、原文件、原备份和原始失败日志；同实例全局角色沿用必须标注，不算跨服务器恢复。
