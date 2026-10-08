# 已准备档案的导入命令

这份命令复用服务器上已准备的数据包，通过正常账号的 API 权限进入正式 HR 数据。它不重新分析原备份，也不重新执行历史全量导入；当前支持服务器目录中的档案基线包和籍贯、学历补充包。后续其他来源仍由已有增量包构建器生成，并走其对应入口。

## 登录配置

将以下结构保存在自己创建的 0700 私有目录内，文件权限为 0600。使用已有账号密码，密码不作为命令行参数，不提交到 Git；令牌只保存在本次进程内存。示例占位符需要替换为真实密码。

```json
{"apiBase":"https://park.cnjinhu.com/api/v1","username":"wuenguo","password":"<已有密码>","tenantId":"10000001","parkId":"20000001"}
```

命令先调用正常 `/auth/login` 和 `/users/me`，核对当前账号、园区及档案管理权限。没有权限时保留现有权限边界；登录问题只影响这次真实 API 操作，开发和隔离测试可以继续。

## 单包执行

从仓库根目录运行。目录仅显示数量、字段名、文件摘要、操作编号和状态，不下载源人员记录。

```bash
node scripts/hr-cutover/import-yuzhou-prepared-profile.mjs --mode catalog --credentials /absolute/private/login.json
```

根据目录明确选定一个包，以真实返回的 batch ID、index、fileSha256 和 itemCount 替换占位符。每个包使用独立的回执文件。

```bash
node scripts/hr-cutover/import-yuzhou-prepared-profile.mjs --mode preview --credentials /absolute/private/login.json --receipt /absolute/private/package-0.json --batch-id <batch-id> --index 0 --expected-file-sha256 <file-sha256> --expected-count <item-count>
node scripts/hr-cutover/import-yuzhou-prepared-profile.mjs --mode status --credentials /absolute/private/login.json --receipt /absolute/private/package-0.json
node scripts/hr-cutover/import-yuzhou-prepared-profile.mjs --mode commit --credentials /absolute/private/login.json --receipt /absolute/private/package-0.json
```

确认预览摘要后再运行 commit；每次只提交同一个已绑定操作。基线包只允许 unchanged；补充包允许 update/unchanged，拒绝新增员工或冲突。当前来源共有 2859 个档案候选、2456 个补充候选，这只是已核对来源数量，实际生产完成数量必须由本次终态与生产读取证明。

目录先完成基线，再处理补充包。前序包必须 committed 且无冲突。命令不自动循环提交，不跳过冲突包。服务器始终保留原始证据并按三方比较及当前业务状态保护现代修改。

## 断线及已有预览

请求前先保存幂等键、来源选择和操作绑定。提交响应丢失后先做一次原 ID 的只读恢复；仍无法确认时运行 status，或用原 preview 参数找回目录里的同一操作；不得删除回执、换包或创建替代操作来规避未知结果。

如果已存在的 previewed 操作缺少计划，使用原 preview 命令额外添加 `--retry-preview yes`，明确重建当前计划。刷新使用另一个先落盘的稳定键，避免旧 HTTP 缓存的 status-only 响应；它仍必须返回同一 operation ID、canonical hash 和数量。服务端只重新计算当前计划，不新增操作、业务记录或历史账本。已 committed/conflicted 的包只返回原结果。

commit 断线且 status 仍是 previewed 时，先用 status 核对，再明确重新运行 commit；原提交键保留。已提交终态再次 commit 只读取原结果。conflicted 也保留原终态和守恒数量，输出安全摘要并以退出码 2 明确表示冲突，阻止后序包。任何 hash/ID/count 不匹配、冲突或缺少计划都会拒绝提交。私有回执保留用于追溯，不能当作生产结果证明替代实时读取。

## 两种摘要

目录 fileSha256 是文件字节摘要；操作 canonicalSha256 是服务器规范化包摘要。分别绑定和保存，不将两者强行比较。输出及回执不含人员原字段值、密码、令牌或原 HTTP 错误正文。

## 验证边界

本地 HTTP 测试验证正常登录、作用域、包顺序、响应丢失恢复及同操作重复提交；独立 PostgreSQL 测试验证真实服务预览重建无业务写入，以及现代修改产生当前冲突。生产导入另需真实正常账号执行、结果守恒、现代值保留核对与代表性 HR 页面验收。部署成功本身不代表来源补充已提交。
