# Rehearsal A/B 非生产预检（2026-08-28）

## 结论

- 配置与资源隔离合同：`GO`。A/B 强制逐字节相同 C/S/M，数据库、Compose project、容器、volume、角色、三角色账号命名空间、6 个端口、runtime/staging/evidence/file/credential/audit 路径均独立。
- 当前本机候选端口：`15441/3141/4141`（A）与 `15442/3142/4142`（B）均未监听；Docker endpoint 为本机 Unix socket；候选 Docker project/container/volume/network 身份未发现残留。
- 完整 A/B 执行：`NO_GO`，直到最终候选 SHA 干净冻结、真实只读源的 `0600` ETL 文件/固定备份/T4 evidence 完成 run 级绑定，并完成当前浏览器 UAT handoff。此次预检未启动数据库、未运行 loader、未连接生产。
- 生产历史导入：始终 `HOLD`。

## 本轮补强

1. Pair preflight 现在拒绝 A/B 任意受控路径的祖先/子孙嵌套，而不只拒绝字符串完全相同，避免 A 清理目录覆盖 B 资源。
2. Runtime vacancy 现在除 6 个端口与 Docker project/container/volume/network 外，还检查残留 runtime、staging、evidence、file 与 cleanup audit 路径。
3. 契约冻结并验证顺序：A/B provision → 各自连续 T0→T5 → API/browser 技术 UAT → backup/restore fault → pair compare → B 后 A、各自 T5→T0 → cleanup → 全资源 `residualCount=0`。
4. T4 冻结事实保持：2024～2026 热数据 `8,342 = 8,320 + 22`，`190,374` 明细，`266` 关账，净额 `15723009.9100`；2010～2023 冷归档 `37,750`。

## 最终干净 SHA 上的执行入口

以下命令只允许在最终候选的干净隔离 worktree 执行；源参数必须由安全环境变量提供，不写入 Git 或日志。

```bash
: "${YUZHOU_ETL_ENV_FILE:?set a 0600 read-only ETL env file}"
: "${YUZHOU_SOURCE_BACKUP_FILE:?set the hash-pinned source backup}"
: "${YUZHOU_SOURCE_CONTAINER:?set the local read-only source container}"

umask 077
export HR_REHEARSAL_CONTROL_ROOT="/Users/mac/Documents/jinhu-smart-park-rehearsals/final-ab"
export HR_REHEARSAL_SUMMARY_ROOT="/Users/mac/Documents/jinhu-smart-park-rehearsals/final-summary"
: "${YUZHOU_T5_MATERIALIZATION_KEY_FILE:?set a private 0600 lab-only materialization key file}"
mkdir -p "$HR_REHEARSAL_CONTROL_ROOT" "$HR_REHEARSAL_SUMMARY_ROOT"
chmod 700 "$HR_REHEARSAL_CONTROL_ROOT" "$HR_REHEARSAL_SUMMARY_ROOT"

node scripts/hr-cutover/prepare-full-domain-rehearsal.mjs \
  --rehearsal A --suffix final_a_20260828 \
  --postgres-port 15441 --api-port 3141 --web-port 4141 \
  --control-root "$HR_REHEARSAL_CONTROL_ROOT" \
  --etl-env "$YUZHOU_ETL_ENV_FILE" \
  --t4-evidence .trellis/tasks/08-24-yuzhou-hr-t4-payroll-history/research/source-evidence-manifest.json \
  --source-container "$YUZHOU_SOURCE_CONTAINER" \
  --source-backup "$YUZHOU_SOURCE_BACKUP_FILE" \
  --materialization-key "$YUZHOU_T5_MATERIALIZATION_KEY_FILE"

node scripts/hr-cutover/prepare-full-domain-rehearsal.mjs \
  --rehearsal B --suffix final_b_20260828 \
  --postgres-port 15442 --api-port 3142 --web-port 4142 \
  --control-root "$HR_REHEARSAL_CONTROL_ROOT" \
  --etl-env "$YUZHOU_ETL_ENV_FILE" \
  --t4-evidence .trellis/tasks/08-24-yuzhou-hr-t4-payroll-history/research/source-evidence-manifest.json \
  --source-container "$YUZHOU_SOURCE_CONTAINER" \
  --source-backup "$YUZHOU_SOURCE_BACKUP_FILE" \
  --materialization-key "$YUZHOU_T5_MATERIALIZATION_KEY_FILE"

node scripts/hr-cutover/final-rehearsal-pair.mjs \
  --config-a "$HR_REHEARSAL_CONTROL_ROOT/jinhu_hr_migration_lab_full_final_a_20260828/credentials/rehearsal-config.json" \
  --config-b "$HR_REHEARSAL_CONTROL_ROOT/jinhu_hr_migration_lab_full_final_b_20260828/credentials/rehearsal-config.json"

ALLOW_YUZHOU_FINAL_REHEARSAL=yes \
node scripts/hr-cutover/final-rehearsal-pair.mjs --execute \
  --config-a "$HR_REHEARSAL_CONTROL_ROOT/jinhu_hr_migration_lab_full_final_a_20260828/credentials/rehearsal-config.json" \
  --config-b "$HR_REHEARSAL_CONTROL_ROOT/jinhu_hr_migration_lab_full_final_b_20260828/credentials/rehearsal-config.json" \
  --summary "$HR_REHEARSAL_SUMMARY_ROOT/final-ab-summary.json"
```

第一条 pair 命令是无写入 preflight；只有它返回 `PASS` 后才能运行带 `--execute` 的隔离演练。任何 SHA、source snapshot、mapping hash、端口、Docker 身份或受控路径漂移都会失败即停。普通部署与本入口均不会把 `productionImport` 从 `HOLD` 提升。
