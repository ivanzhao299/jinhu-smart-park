# 已准备档案的正常API导入执行文件
用户已授权正常密码登录、尽快完成玉舟正式数据导入及增量连续性；登录只影响需要会话的操作，不阻断整个开发。复用已部署服务器档案目录与 incremental preview/commit/status 内核，不重做源分析，不下载人员源文件，不创建身份或重置密码。

## 验收
- 新CLI `scripts/hr-cutover/import-yuzhou-prepared-profile.mjs`，catalog/preview/status/commit 明确单步模式，每次至多选择一个原服务器批次包。
- 使用指定的私有0600正常登录配置，普通 auth/login→users/me，token仅内存。固定生产 origin/api prefix 与已授权tenant/park；允许显式loopback用于隔离测试，拒绝其它origin、URL凭据、redirect。校验账号名及实际当前scope，不选择wu_enguo等替代账号、不改角色。
- catalog只输出安全ID/hash/类型/字段标签/数量/状态；完整校验批次前基线后alias、字段whitelist、唯一identity/有界count/序号、前序committed0conflict。选择与期望batch/fileHash/itemCount绑定，写入私有回执。
- preview只调用现有prepared endpoint，稳定预览idempotencyKey在请求前持久化；异常可通过同catalog operationId恢复或使用同key明确重试，不能新建替代操作。
- public operation packageSha256是canonical摘要，prepared entry.packageSha256是原文件字节摘要，必须独立记录，不能把两种hash强行比较。绑定预览返回id/canonicalHash/count，此后status/commit须同一组且结果守恒。
- commit明确单操作，先按原ID查询并核对绑定与目录当前顺序，再提交同ID和已持久化key。baseline只能unchanged不能create/update/conflict；alias禁止create与预览conflict，服务端仍执行CAS/现代值冲突保护。
- 响应丢失/网络异常先保存 uncertain 并查询原ID；不自动重新POST。查询终态保留原结果；previewed也仅在下一次明确commit才重试。status不能解除hash/ID/count不匹配的未确认状态。
- terminal committed/conflicted结果数量守恒；conflicted单列不假称成功、不自动推后序。校验失败仅脱敏错误码，绝不打印HTTP原body/源rows/凭据/路径/token。
- 独立实际HTTP fixture验证普通登录、作用域/权限拒绝、catalog包序、previewKey复用、空业务基线约束、完整alias计数、失联commit通过原ID恢复、foreignID/hash/count拒绝、重复终态0写、文件symlink/mode/receipt并发保护及敏感输出不泄露。
- 现有prepare源文件、builder/adapter frozen hashes、DB/权限、UI均不改；API仅修复已有previewed包同操作计划重建，终态仍返回原结果；生产登录及正式commit另留证据。当前密码未在上下文或指定credential文件中，不能假称真实commit完成。
