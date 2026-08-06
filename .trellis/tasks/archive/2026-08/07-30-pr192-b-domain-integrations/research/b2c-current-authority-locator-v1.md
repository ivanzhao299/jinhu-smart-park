# B-2c current authority locator v1

日期：2026-08-02  
状态：CURRENT / INPUT-FREEZE  
适用范围：B-2c effect-schema reservation、property-foundation adapter 与领域 API lanes。

## Current-only authorities

| Authority | Current SHA |
|---|---|
| B-contract-v2 | `e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944` |
| Runtime effect authority | `47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf` |
| B-schema-expand | `53e568d409420dc6c38a8139a553735083502f05d6aeb2f3e14adcbb95276874` |
| B-property-foundation-runtime-v2 | `984fcc8d0ceeeb536fd4df91728c8d275c0f4237b99cc074833f9dec54d963b4` |
| B-approval-runtime-v2 sidecar | `30168511b4ea2028afebf45300a399dcb3f0d15b6ed279368611447a61f1f589` |
| B-property-task-runtime | `f6d6f302cf14078bff54eb241d62763155a279ce272de2461b2de84b9df17645` |
| B-module-core | `988eb7e5f70bc5e0614e700feaf77ea68d0edc1f1edcb90aa57ab5b4a3b193df` |
| B-2a combined signoff | `e61f39d936ef4a9b968beec645a09f2459419072d2b7c70067b71d7c2cbcc633` |
| B-extension-core fixture | `5c7f679497f2b7e6f586b74e3c0767d8377bdf05dcc5aeabd6111ce5d325ca56` |
| B-extension-core validation | `9470a733f65b85efab9461f7abab0697106765527cbb7cce5858f889f3239abe` |
| B-extension combined checksum | `bd96ee12d720b7240f692ac151dea2ff74199dd80ac2ec6304a3a108f145910b` |

Track A 现表与 migration bytes 必须从 C2 v11 的 51-file freeze 和正式 artifact 原样消费，
不得从摘要文案重建。000191/000192 各自 handoff 和 property-foundation adapter SHA
尚未产生，不能预填或虚构。

## 禁止消费的 superseded 摘要值

- B-contract：`a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8`
- B-contract：`5704ab723ebd4bcc69b4e4fcf6039992ac6752b195b97beba31be5260b55d87d`
- B-approval-runtime v1：`79691ea945e5c37ddd075ff4e234dbb00eec084ede2b36717393360344e2270d`

历史文件保留审计价值，但 schema、adapter、domain API owner 不得从这些旧摘要取值。

## Adapter 精确输入

Property-foundation adapter 必须同时冻结 current B-contract-v2、runtime effect authority、
B-schema-expand、approval-runtime-v2、foundation-runtime-v2、000191 正式 handoff、
B-module-core、B-extension fixture 与 validation handoff。其 base/output SHA 必须以
foundation-runtime-v2 为基线，证明未覆盖 identity/control core。

## B-2c / 000197 当前执行进度（2026-08-02）

本节是进度索引，不替代上方 current-only authority，也不把 review GO 解释为真实执行。
B-2c 仍为 `IN_PROGRESS`；Track B 与 Track C 均未完成。

| Lane | 当前事实 | 处置 / 下一门禁 |
|---|---|---|
| v10 C/D formal | helper 失败；失败证据与资源保留 | 已退出当前执行身份，不复用为成功证据 |
| v11-v5 E/F formal | stale `source_domain` / `action` 失败；E/F 保留 | runId 不可复用；只保留审计与后续比较价值 |
| v11-v6 DDL 修复 | 静态实现与候选检查完成 | 不等于 PostgreSQL regression 或 formal PASS |
| G/H run `b2c197_prelim_20260802g` | 两个专属 PostgreSQL 16 空库已创建并保留 | 仅允许冻结链绑定的 G/H 路径推进 |
| G/H attempt01 | 外层限制导致 `docker-version` child EPERM；loader process `0` | attempt01 不可复用；root 与四份失败证据永久保留 |
| G/H attempt02 | Database GO `ed51ea55670012cfc764f39b1feb8879663365568df3ff3a3339060f490a1786`；QA GO `747b9f9bc4d1ab12dc7f810766b22eec9e1d943fe1e88d6aacb7ba790631c3b2` | outer escalation 在 `CreateProcess` 前被权限审查拒绝；runner 未启动、attempt02 root absent、loader/Docker/DB/cleanup 均为 `0`；等待用户明确批准 G/H 数据库写入，禁止 retry/workaround |
| PG regression v4 | Database GO `5534bfbc6bb79d5e4d9a1744718aa9bf7a70adedb381fd21ba71a3bc3a1a96f9`；QA GO `ca38e0873418d5e242ed0565ffa7330cf1a0bee938182481e1df9c37d0dbcf63` | `create=false`、`execute=false`；尚需获批创建专属临时 PostgreSQL 资源 authority，并按冻结链执行 |

后续固定顺序：先完成获批的 G/H loader attempt02 与专属 PG regression v4；两项真实
数据库门禁均成功后，重新冻结 formal candidate，取得新的三方 GO，再执行 old-writer
drain。此链关闭前，000191/000192、property-foundation adapter、B-3、Track B 技术完成
与 Track C 启动均保持 blocked。
