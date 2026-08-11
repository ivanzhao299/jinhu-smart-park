# 【复测前历史快照】PR223 本地真实 Chrome UAT → WSL Codex 交接

> 本文档记录 UAT-002 修复及 Windows Chrome Profile 1 复测完成前的交接状态，已不再作为当前执行入口。
> 2026-08-10 真实 Chrome 复测后，UAT-002 已解决、C-15 已通过，Chrome 15 项为 15 PASS / 0 FAIL；
> 当前唯一剩余阻塞为 `ENV-001 / ROLE-NEG-01`。当前权威状态见同目录 `task.json`，本文后续步骤仅保留审计。

交接时间：2026-08-10（Asia/Singapore）
快照时交接结论：**BLOCKED，禁止声明 `production_ready`**

## 1. 权威对象与代码边界

- PR：`https://github.com/ivanzhao299/jinhu-smart-park/pull/223`
- PR head：`6a41149913f32683472aafd6acabe7d04bec7bb5`
- merge / 本次 tested commit：`28d5e517d5a186908dc549cf3c527701be13613b`
- 干净待测 worktree：`/home/jinhuit/JinHuCodebase/jinhu-smart-park-pr223-uat-28d5e517`
- 原始仓库：`/home/jinhuit/JinHuCodebase/jinhu-smart-park`
- Trellis task：`.trellis/tasks/08-10-pr223-windows-real-browser-uat`
- 快照时 Trellis 状态：`in_progress`；当时尚未完成，等待 P1 修复与 Chrome 复测。

原始仓库在接管时是 pre-merge HEAD，并已有约 56 个用户 dirty 路径；本次没有执行 `reset`、`checkout` 或 `clean`，也没有改动业务源码。后续 WSL Codex 必须继续保护这些用户改动。`15b6e8f…` 与 `2026-08-04` 只属历史证据，不得替代本次 PR223 结果。

## 2. 隔离环境

- Web 基线：`http://localhost:3100`
- API：`http://127.0.0.1:3101/api/v1`
- PostgreSQL：容器 `jinhu-pr223-uat-postgres-20260810`
- 数据库：`jinhu_pr223_uat_20260810`
- 数据库监听：仅 `127.0.0.1:55432`
- 测试租户 / 园区：`10000001` / `20000001`
- 测试数据前缀：`UAT_PR223_20260810_`
- 文件根：Windows 证据目录下的 `local-files`
- 浏览器：Windows Google Chrome `Profile 1`，ChatGPT/Codex Browser 扩展。

Chrome C-01..C-15 使用了第二个本地 Web `http://localhost:3102`，仅将 `PROPERTY_OFFLINE_DRAFTS_V1` 与 `PROPERTY_UPLOAD_QUEUE_V1` 设为 `true`；API、数据库与文件存储仍全部指向本机。3102 已在结束时停止。基础 API 保留运行，结束核验为 `health=200`、`ready=200`；Chrome 已退出测试账号并停在 `http://localhost:3100/login`。

没有读取或使用生产 URL、生产账号、生产秘密、线上数据或生产开关。

## 3. 已执行流程

1. 完整读取 Windows 交接及 Trellis `prd.md`、`design.md`、`implement.md`。
2. 核验 PR head、merge commit、干净 tested worktree 与原始 dirty worktree边界。
3. 建立专用 PostgreSQL、执行 migration/baseline/bootstrap，准备前缀账号与本地角色。
4. 验证 `health`、`ready`、登录页与 PR223 commit 绑定，通过 Gate 0 后执行 `task.py start`。
5. 恢复并核验 Chrome `Profile 1`、扩展与 Native Host；所有 Chrome 15 和上传证据均来自真实 Chrome。
6. 覆盖登录、菜单、17 个民宿/住房工作台、party/identity/control-plane、权限、附件列表/上传/预览/删除、审计员 RBAC、320/390/768 响应式。
7. 为 Chrome 15 启用本地可靠性开关；验证非敏感草稿保存、刷新恢复、logout/account scope 清理、键盘/aria-live、离线上传队列、fail-closed、恢复上传、版本投影变化清除旧队列。
8. 通过短暂停止专用本地 PostgreSQL 制造受控上传故障；每次均恢复容器，并复核 `health=200`、`ready=200`。
9. 测试结束后退出浏览器账号、停止 3102、删除精确数据库 fixture 与存储文件并验证 residual=0。

## 4. 结果

- 总矩阵：`48`
- `PASS=46`
- `FAIL=1`
- `BLOCKED=1`
- Chrome 15：`14 PASS / 1 FAIL`

开放问题：

- `UAT-002` / P1 / open / `C-15`：住房报修待提交附件无法删除，页面暴露 PostgreSQL bind-count 原始错误。
- `ENV-001` / P2 / open / `ROLE-NEG-01`：`no_access` fixture 在登录阶段即 `Forbidden resource`，虽然 fail-closed，但无法进入 authenticated shell 完成菜单与直链负向矩阵。

因此总体结论为 **BLOCKED**。浏览器证据不等于真人岗位签署。

## 5. P1 UAT-002 复现

1. 在隔离 Web 上启用两个 reliability flags。
2. 使用本地前缀 SUPER_ADMIN 登录。
3. 打开 `/housing/repairs`，展开 `代录报修`。
4. 选择前缀 active lease，使用真实 Chrome 选择 PNG。
5. 受控断开本地数据库后，勾选明确同意并上传，使图片进入本机队列。
6. 恢复数据库与 ready，重新加载并点击 `恢复上传`。
7. 图片恢复成功后点击 `从本次提交移除`。
8. 页面显示：`bind message supplies 4 parameters, but prepared statement "" requires 3`；图片仍保留。

失败截图：`08-chrome-15-delta/C-15-file-delete-bind-error-FAIL.png`。

## 6. 已核验根因

调用链：

- `apps/web/components/files/PendingAttachmentList.tsx:80-82`
- `apps/web/app/housing/_components/HousingRepairCreatePanel.tsx:51-64`
- `apps/web/app/housing/_components/housing-pending-files.ts:27-35`
- `apps/api/src/modules/files/files.controller.ts:111-116`
- `apps/api/src/modules/files/files.service.ts:303-331`
- `apps/api/src/modules/files/file-business-access.service.ts:232-237,255-258`

`housing_repair` 分支 SQL 仅包含 `$1`、`$2`、`$3`，但公共执行路径固定传入：

```text
[file.id, scope.tenantId, scope.parkId, file.bizId]
```

即 4 个参数，导致 PostgreSQL 在权限检查阶段报错，软删除尚未发生。独立核验表明同一错误针对受保护的 `housing_repair` 删除分支；其他使用 `$4` 的受保护分支参数数量匹配。

修复时不要只机械删参数：必须确认“尚未绑定工单、bizId 为 lease id 的 pending housing_repair 图片”应允许其创建者/授权岗位移除，同时仍防止删除已绑定其他工单或越租户/园区的附件。需要补充覆盖 pending 与已绑定两类场景、权限和 tenant/park scope 的 API 测试。

## 7. 清理状态

应用删除失败后，本次只在专用本地环境执行了精确强制清理：

- 删除两条明确解析的本地 stored blob；不可直接恢复，但根目录合成 PNG 输入夹具仍保留，可重新生成。
- 硬删除两条明确 ID、前缀文件名、`biz_type=housing_repair` 的 `sys_file` 记录。
- 按逆序删除前缀 building/floor/unit/party/lease fixture；fixture SQL 可重建。
- 最终核验：`sys_file=0`、`sys_attachment=0`、building=0、floor=0、unit=0、party=0、lease=0、stored business files=0。

保留的复现材料：

- `00-authority-and-environment/start-reliability-web.sh`
- `00-authority-and-environment/housing-reliability-fixture.sql`
- `00-authority-and-environment/housing-reliability-cleanup.sql`
- `local-files/UAT_PR223_20260810_upload-smoke.png`
- `local-files/UAT_PR223_20260810_invalid-mime.txt`

## 8. 快照中的 WSL Codex 下一步（已完成，不得重复执行）

以下步骤已由 `de92ad70` 修复及后续 Windows Chrome Profile 1 复测闭合，仅保留当时的审计链；
新的接管者应以同目录 `task.json` 为准，不得重新实施 UAT-002 或覆盖既有 Chrome 证据。

1. 先读取本交接、`BLOCKED-UAT-002-HOUSING-REPAIR-FILE-DELETE.md`、`uat-matrix.csv` 与 `defects.csv`。
2. 在原始仓库运行只读 `git status --short`，保护全部既有用户改动；不要 reset/checkout/clean。
3. 在干净 PR223 worktree 修复 `file-business-access.service.ts`，补充 API 单测；不要把证据目录的测试辅助脚本混入业务提交。
4. 运行受影响 files/housing repair 测试和相关回归，并记录测试命令与结果。
5. 修复后交还 Windows Codex，必须再次使用真实 Chrome 复测：
   - `C-15` 删除成功；
   - 页面不泄露数据库内部错误；
   - 已绑定和未绑定附件权限均符合预期；
   - Chrome 15 达到 `15/15`；
   - 最终 residual=0。
6. 未完成真人岗位签署前，不得声明 `production_ready`；不得关闭历史 `2026-08-04` 的 BLOCKED 来代替本次复测。

## 9. 权威证据

Windows 根：

`D:\lishuai\JinhuWork\智慧园区UAT测试\2026-08-10\13-pr223-windows-real-browser-uat`

重点文件：

- `README.md`
- `LOCAL-PRECHECK.md`
- `uat-matrix.csv`
- `defects.csv`
- `BLOCKED-UAT-002-HOUSING-REPAIR-FILE-DELETE.md`
- `08-chrome-15-delta/C-15-file-delete-bind-error-FAIL.png`
