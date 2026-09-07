# GitHub CLI 操作约定

本项目对 GitHub 的日常操作采用 CLI 优先方式，不以浏览器或屏幕可达性作为前置条件。屏幕锁定、浏览器标签页失效或无法返回凭证时，不应被升级为整个开发或迁移任务的阻断；应改用本机已登录的 `gh` 会话。

## 开始前检查

在受控工作树执行：

```sh
gh auth status
gh api rate_limit --include
git fetch origin --prune
```

`gh auth status` 只用于确认登录状态和必要 scope。不得打印、复制、提交或写入 token、密码、设备码、`.p8` 或其他凭据。若 CLI 未登录，应由责任人自行完成 `gh auth login`；自动化不得索取或回显凭据。

## 操作映射

- PR：`gh pr list/view/checks/create/merge`
- 工作流：`gh workflow list/run`
- 运行：`gh run list/view/watch`
- 只读 API：`gh api`

生产发布必须继续遵守仓库现有的备份、快照、业务签署、比例校验和一次性生产授权门禁。CLI 只是传输和查询方式，不会绕过这些门禁；生产导入默认保持 `HOLD`。

## 证据与报告

报告运行 ID、提交 SHA、状态、结论和脱敏分类即可。不要下载、回显或提交包含凭据、个人数据、工资明细、照片或附件二进制的内容。需要屏幕操作时仅作为最后的可视化兜底，不作为 GitHub 认证或任务是否可继续的依据。
