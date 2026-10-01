# 玉舟历史工资追加执行通道

此候选分支只提供受控传输通道，不作为应用版本合并或部署。原 T0–T3 通道不变，工资执行器固定为 `ca1f5f9f6a4332f3b52058ff2a2e64b59b013155`；生产 API 和 Web 必须实际运行该版本。只有核心导入成功并取得真实回执后，才能发布和运行工资追加版本。

`prepare-yuzhou-t4-private-import` 与 `execute-yuzhou-t4-private-import` 归类为 `ops-only`，只运行独立 `t4-private-import` 作业，不触发应用部署。加密草稿包标签为 `yuzhou-t4-private-<nonce>`，临时目录为 `/tmp/jinhu-yuzhou-t4-<nonce>`。使用者负责在准备作业结束后删除本次草稿与 `YUZHOU_IMPORT_TRANSPORT_KEY`，确认均已不存在；该密钥不得与核心传输并行使用。Actions 的草稿删除失败必须保留真实失败状态，由创建者完成清理。

本地包入口为 `scripts/hr-cutover/yuzhou-t4-private-packet.mjs pack <request> <output>`。请求 `kind` 固定为 `import`。`materials` 有两种形态：

- `{ kind: "parent", parentNonce }`：只读父任务探针，无业务文件。生产主机从原核心任务私有目录读取真实配置、封存计划和成功回执，核对数据库任务、四个阶段、来源映射和员工关联。仅输出汇总数量与校验和，私有数据不离开主机。
- `{ kind: "append", parentNonce, config }`：`config` 只包含 `binding`、`authorization`、`stage`、`runtimeEvidence`。所有文件为绝对路径与实际 SHA-256 描述符。`stage` 包含真实 manifest 和六份来源 JSONL。主机从成功核心任务复制真实父回执，并现场产生数据库凭据及 TCP 身份绑定，然后调用正式 T4 CLI 的 `prepare`。

父探针返回的 `recordSetSha256` 和 `finalRehearsalPairSha256` 必须用于新的工资绑定。工资绑定还需真实源文件哈希、全量与近年四项金额汇总、已发布工资版本运行回执，以及有效窗口内的原始授权签名。不得用假定的父记录哈希或重建的成功回执代替现场证据。

执行阶段核对已准备配置的字节哈希，写入独占执行声明，再调用正式 T4 CLI 的 `execute`。提交后通过只读连接核对追加任务、完整归属状态、46,092 条工资快照、1,078,020 条明细与工资批次净额。批次必须保持 `staged`。若提交成功但对账失败，保留成功回执并报告 `reconciliationStatus=REQUIRED`，不得重试写入。该通道不发布工资，不发起支付，不发送消息。

本地验证：

```sh
node --test scripts/e2e/yuzhou-private-import-transport-contract.mjs scripts/e2e/yuzhou-t4-private-transport-contract.mjs
node scripts/e2e/production-deploy-route-contract.mjs
node scripts/e2e/production-deploy-scope.contract.mjs
```

这些检查验证传输、校验和对账逻辑。真实核心成功、工资版本发布、私有工资预演、现场准备和正式生产追加仍需各自的实际回执。
