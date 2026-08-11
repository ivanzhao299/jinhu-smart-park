# 【复测前历史快照】PR223 UAT-002 API 修复 → Windows Chrome 复测交接

> 本文档记录 `de92ad70` 修复完成后、Windows Chrome Profile 1 复测前的交接状态，已不再作为当前执行入口。
> 2026-08-10 真实 Chrome 复测后，UAT-002 已解决、C-15 已通过，Chrome 15 项为 15 PASS / 0 FAIL；
> 当前唯一剩余阻塞为 `ENV-001 / ROLE-NEG-01`。当前权威状态见同目录 `task.json`，历史 FAIL 证据继续保留且未被覆盖。

交接时间：2026-08-10（Asia/Singapore）
快照时 UAT 状态：`BLOCKED`；当时不得在真实 Chrome 复测前将 UAT-002/C-15 改为 PASS。

## 1. 修复权威与工作区

- 基线 merge/tested commit：`28d5e517d5a186908dc549cf3c527701be13613b`
- 修复分支：`codex/pr223-uat002-file-delete-fix`
- 修复 commit：`de92ad70`
- 修复 worktree：`/home/jinhuit/JinHuCodebase/jinhu-smart-park-pr223-uat-28d5e517`
- 原始仓库保持 56 个既有 dirty 路径，未执行 reset/checkout/clean，未修改业务源码。

## 2. 修复内容

修改文件：

- `apps/api/src/modules/files/file-business-access.service.ts`
- `apps/api/src/modules/files/file-business-access.service.spec.ts`
- `apps/api/src/modules/files/files.service.spec.ts`

`housing_repair` 删除引用查询只使用 file/tenant/park，即 `$1/$2/$3`；修复后仅该分支传入
3 个参数。其他受保护文件分支仍传 4 个参数，并继续使用 `$4=file.bizId`。

未改变以下安全合同：

- 删除仍先要求 `HOUSING_REPAIR_MANAGE`；
- `bizId` 仍是有效 lease id，并在 tenant/park 内解析；
- lease 的 unit data scope 仍由 `PropertyUnitAccessService.assertAccess` 校验；
- active `biz_work_order.image_file_ids` 引用仍导致 `ConflictException`；
- 已删除工单和其他 tenant/park 的工单不应误阻断本 scope pending 文件；
- housing purchase 等其他受保护文件仍维持 4 参数引用查询。

这里的 pending housing repair 是“`bizId=lease id` 且尚未进入任何 active work order 的图片”，
不是 `bizId=null` 的通用未关联文件。

## 3. 自动化验证

通过：

```text
node --test --require ts-node/register \
  src/modules/files/file-business-access.service.spec.ts \
  src/modules/files/files.service.spec.ts
```

结果：2/2 文件级子测试通过。

```text
eslint file-business-access.service.ts、对应 spec 与 files.service.spec.ts
tsc -p apps/api/tsconfig.json --noEmit
nest build
```

结果：lint、API typecheck、API build 全部通过。

全量 API 单测：196 个文件级子测试中，沙箱内 192 直接通过；4 个因回环监听/子进程权限
`EPERM` 失败。解除沙箱后单独重跑这 4 个，共 22/22 内部测试通过。因此没有观察到代码
断言失败。

独立只读 diff 审查：无 findings；权限、scope、active 引用保护和其他 bizType 参数合同未削弱。

## 4. Windows 本地服务更新

Windows Codex 应从修复 worktree/commit 启动本地 API。不得连接生产 URL、账号、秘密或数据。
若现有 API 仍运行旧 commit，应安全停止旧本地 API，再从修复分支启动；Web 可继续使用本地
3100/3102 配置，但 API、数据库、文件存储必须保持原隔离环境。

开始复测前记录：

- `git rev-parse HEAD` 应为 `de92ad70`；
- `git status --short`；
- API 启动日志与端口；
- 本地 `/health`、`/ready` 均为 200；
- 数据库仍是 `jinhu_pr223_uat_20260810`，仅监听 `127.0.0.1:55432`。

## 5. 必须使用真实 Chrome Profile 1 的复测

不得用 API、Playwright、CDP、内置浏览器或历史截图代替：

1. 重建交接中保留的前缀 housing fixture。
2. 使用 Chrome Profile 1 登录本地前缀测试账号。
3. 打开 `/housing/repairs` → `代录报修`，选择前缀 active lease。
4. 使用真实 Chrome 上传 PNG；如复测 C-15 完整恢复链，按原步骤制造本地受控失败、恢复 DB、
   点击 `恢复上传`。
5. 对待提交、尚未绑定工单的图片点击 `从本次提交移除`：应删除成功，页面不得显示 PostgreSQL
   bind-count 或其他内部数据库错误。
6. 创建/准备 active 工单绑定图片后，复核通用删除仍被安全阻断，且不产生 dangling file id。
7. 使用跨 tenant/park 或无 `HOUSING_REPAIR_MANAGE` 的岗位复核删除被拒绝且不泄露对象存在性。
8. 复核至少一个其他受保护文件类型的删除/引用保护未回归。
9. 仅在上述真实 Chrome 证据完成后更新 C-15/UAT-002；保留原 FAIL 截图和矩阵历史，新增 retest
   证据，不覆盖旧证据。
10. 完成精确清理并验证 `sys_file=0`、相关 fixture=0、stored business files=0。

## 6. 完成边界

- 本提交只完成代码修复与自动化验证，未执行 Windows Chrome 复测。
- UAT-002、C-15 和总体 UAT 当前仍是 `BLOCKED`。
- Chrome 15 达到新证据 15/15 后，也不等于真人岗位签署或 `production_ready`。
