# 玉舟 HR 生产导入交接（2026-09-07）

## 一句话结论

真实生产数据**尚未导入**。当前已经把受控源 manifest、生产容量、T0 目标库存和 T0–T3 目标库存的只读链路打通；距离第一次受控生产写入，仍缺少“绑定后的导入前快照 + 生产目标 allowlist/预备份 + 当前代码/运行提交/业务签署/一次性生产执行授权”这些门禁。

## 当前唯一候选工作树

`/Users/mac/Documents/jinhu-smart-park-worktrees/hr-source-restore-receipt-v1`

当前分支：`codex/hr-preimport-scope-hash-v1`

当前主线运行代码 SHA：`dd919d28461c7e0426671e50ba6c679232ff3260`

候选工作树已有用户改动必须保留：

`.trellis/tasks/09-06-hr-exception-review-preparation/research/allocation-profile.mjs`

不要覆盖、回退或把该文件混入本次修复提交。

## 已验证事实

### 发布与只读诊断

- 主线生产发布 `34086163881`：成功；只完成代码部署，未执行 HR 导入。
- 生产目标只读诊断 `34087455696`：成功生成回执，但 `productionImport=HOLD`，未证明唯一有效 HR 租户/园区目标身份。
- 容量诊断 `34087662454`：`READY_FOR_GATE19`；约 171 GiB 持久化空间可用，Docker 数据区约 73 GiB 可用，容量不是阻断。
- 导入前快照 `34087748734`：回执为 `HOLD`。旧回执的源绑定为 `PENDING_SOURCE_MANIFEST`。

### 源 manifest 与目标库存

从受控本机备份、source restore receipt 和已有 T0/T1/T2/T3 私有阶段目录生成 hash-only manifest：

- manifest SHA-256：`b65d1c025b92103338d5ccab944d1a3bfca1c4e794c91c51df7dc4248c2bae0c`
- `productionImport=HOLD`
- 只包含版本、阶段、行数和 SHA-256；未上传原始数据库、原始行、凭据、个人数据、工资明细或附件。

生产只读源 manifest 运行 `34088401182`：成功。

生产只读 T0 目标库存运行 `34088468503`：成功。

- `status=PASS`
- `productionImport=HOLD`
- `recordCount=16`
- 目标表范围仅报告为 `sys_org`
- 与 manifest SHA 绑定。

生产只读 T0–T3 目标库存运行 `34088551365`：成功。

- `status=PASS`
- `productionImport=HOLD`
- `recordCount=19`
- 目标表范围仅报告为 `sys_org`、`hr_contract_type`
- 与同一 manifest SHA 绑定。

## 本轮已完成的代码修复

已在候选工作树中提交（本地提交 `15ddc96f`，尚未推送）的文件：

- `.github/workflows/deploy-production.yml`
- `scripts/e2e/yuzhou-production-preimport-snapshot-contract.sh`

修复内容：

1. pre-import snapshot workflow 接收 `source_manifest_json`；
2. 使用 `verifyProductionSourceManifest` 校验 hash-only manifest；
3. 将快照回执从 `PENDING_SOURCE_MANIFEST` 绑定为 `HASH_ONLY_SOURCE_MANIFEST`；
4. 回执增加 manifest SHA 和代码/源快照/映射契约三元组；
5. 没有改变生产写权限，也没有启动导入。

当前外部阻断：GitHub OAuth token 仅有 `repo` 等权限，缺少 `workflow` scope；推送包含 `.github/workflows/deploy-production.yml` 的提交被 GitHub 拒绝。SSH 公钥认证也不可用。需要在 GitHub 已登录环境中为当前账号授予 workflow 写权限，或由具备该权限的维护者推送同一提交；不需要重新分析数据库。

本地验证已经通过：

```text
sh -n scripts/e2e/yuzhou-production-preimport-snapshot-contract.sh
Yuzhou production pre-import snapshot contract passed.
node --check scripts/prepare-yuzhou-production-source-manifest.mjs
git diff --check
```

## 距真实生产导入还有什么距离

按实际顺序还剩以下 5 个门禁，不是重新做完整 A/B：

1. **解除 GitHub `workflow` 写权限阻断并推送本地提交 `15ddc96f`**，再通过 PR CI 合并本轮 pre-import 绑定修复。
2. **主线部署后重新运行一次 pre-import snapshot**，并确认回执包含 manifest SHA、目标身份 hash、目标范围 hash、T0–T3 before-image/map 摘要。
3. **生产目标 allowlist 与预备份回执**：当前目标诊断仍保持 HOLD，不能猜测或伪造 allowlist；预备份也尚未形成当前回执。
4. **当前代码 SHA、生产运行 SHA、源 manifest、记录映射、比例验证、业务签署和一次性生产执行授权**全部对齐。
5. **只执行一次受控历史导入**，按域核对并验证可回滚；工资正式发放、照片和附件二进制仍是独立最终确认，不能由历史导入自动推断完成。

因此目前不是“数据已经导入但没显示”，而是**生产写入尚未开始**。源和目标的只读结构核验已前进到 T0–T3，下一实质动作是合并本轮绑定修复并重跑绑定后的 pre-import snapshot。

## 新窗口第一步

1. 只读检查当前候选工作树和已提交的绑定修复；保护 `allocation-profile.mjs` 用户改动。
2. 解除 `workflow` scope 后推送 `15ddc96f`，再运行定向合同测试；不要重跑 A/B、全量工资抽取或隔离全量装载。
3. 以独立 PR 合并 pre-import 绑定修复。
4. 等主线 Deploy Production 成功后，使用同一 manifest SHA 只读重跑 `diagnose-yuzhou-hr-preimport-snapshot`。
5. 只在新回执明确通过目标身份、预备份和授权门禁后，进入一次受控导入准备；否则继续保持 `productionImport=HOLD`。

## 安全边界

- 生产、正式发薪、照片和附件二进制均未写入。
- 不读取、回显、提交或复制凭据、密码、个人数据、工资明细或附件内容。
- 不删除任何工作树、备份、容器卷或审计证据。
- 只保留一个候选工作树推进；其他工作树继续保护，后续清理由“已合并、干净、无独有提交、无证据依赖”逐个判定。
