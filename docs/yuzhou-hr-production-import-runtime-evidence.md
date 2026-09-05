# 生产导入的运行版本证据绑定

归属 M5：导入执行器不能仅接受私有配置中自报的“候选、合并、运行提交相同”。
本变更给现有 v2 密封计划增加外部运行回执绑定，不修改生产激活名单、数据库或授权。

## 证据顺序

1. 固定并发布候选代码，独立核验实际运行版本、已合并提交、生产目标及租户范围。
2. 从这些只读事实产生外部运行回执，保存为受控私有 UTF-8 JSON 文件。
3. 计算该文件**原始字节 SHA-256**，加入密封计划的 `runtimeReleaseEvidence`。
4. 现有外部审批同时绑定完整回执描述，最后密封计划；执行前重新读文件并核对。

不要把回执哈希写进同一候选的 Git 激活配置：回执包含运行提交 SHA，提交回执哈希会改变
候选 SHA，造成自引用。外部密封计划在部署之后产生，不改变源代码提交。

## 格式与校验责任

`plan.runtimeReleaseEvidence` 只允许 `artifactSha256`、`observedAt`、`expiresAt`。
时间采用 `YYYY-MM-DDTHH:mm:ss.sssZ`，必须是真实有效的 UTC 时间。观测必须不晚于授权签发；
执行时回执未过期，且回执有效期不得超出授权有效期。观测可以早于导入窗口，不要求重新发布。

`authorization.binding.runtimeReleaseEvidenceBindingSha256` 使用既有
`computeProductionImportPayloadHash(plan.runtimeReleaseEvidence)`，绑定文件哈希和两项时间，
不是只绑定 `artifactSha256`。完整计划的 seal 也覆盖这些字段。

实际回执严格包含：

- `formatVersion: 1`
- `artifactKind: yuzhou_hr_production_import_runtime_release_receipt`
- `currentCodeSha`、`mergedCodeSha`、`runtimeCodeSha`
- `targetIdentitySha256`、`targetScopeSha256`
- `observedAt`、`expiresAt`

CLI 执行路径必须要求该绑定，读取实际回执原始字节核验 SHA，校验三提交与计划一致、目标和
范围一致、时间与计划绑定完全一致，并在访问 PostgreSQL 前拒绝缺失或不匹配。库仍接受历史
无此可选字段的计划以保留兼容性；这不授权 CLI 绕过实际证据检查。

哈希只证明批准文件的完整性，不自行证明生产现场真实。回执必须源自独立核验的只读采集和
现有审批链；不能由执行器填写一组相等 SHA 充当现场证据。这个切片不产生生产回执或签署，
不声称生产目标、发布、导入或完整 HR 产品已经验收。

## 验证

`node --test scripts/e2e/yuzhou-production-import-v2-contract.mjs` 覆盖外部绑定、无绑定历史兼容、
换文件/换时间/删绑定拒绝、无效及过期时间拒绝、密封哈希覆盖和失败前数据库零访问。
CLI 的原始回执字节、目标和范围校验由入口契约测试独立覆盖。
