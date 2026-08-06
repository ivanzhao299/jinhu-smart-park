# B-extension-core v1 独立门禁最终签署

日期：2026-08-02  
状态：PASS / CLOSED  
Owner：qa-automation-owner / migration-reconcile-owner  
`open_P0_P1=[]`  
独立复审：架构 GO；QA GO；P0/P1/P2 均为 0。

## 唯一正式证据

- 唯一 runId：`c2v11_formal_20260802l`
- Artifact：`artifacts/property-remediation/runs/c2v11_formal_20260802l/b-extension-core-candidate.json`
  - bytes：`1976803`
  - raw SHA：`1156a307038cf4c896ab8626ec0ca1f4834549ed6ee109550b7836a418077487`
- Detached manifest：`artifacts/property-remediation/runs/c2v11_formal_20260802l/b-extension-core-candidate.manifest.txt`
  - bytes：`419`
  - raw SHA：`5c77324893a331f6cb1c714e0d9b201530eeb63abef0f3eeba359e6493400974`
- Reservation：`artifacts/property-remediation/runs/c2v11_formal_20260802l/b-extension-runid.reservation.json`
  - bytes：`462`
  - raw SHA：`29b9e8e98900204ff37b918937e9025348ccba1d133ad27f2b51dba56da883ef`
- 三份正式证据 mode 均为 `0600`；reservation 永久保留。
- fixture SHA：`5c7f679497f2b7e6f586b74e3c0767d8377bdf05dcc5aeabd6111ce5d325ca56`
- validation grammar：`b-extension-core-validation-v1.grammar`（1292 bytes）
- `B-extension-core validation SHA`：
  `9470a733f65b85efab9461f7abab0697106765527cbb7cce5858f889f3239abe`
- combined checksum：`bd96ee12d720b7240f692ac151dea2ff74199dd80ac2ec6304a3a108f145910b`

## 冻结与迁移证明

- 51 个正式输入在四个阶段逐字节一致，freeze SHA：
  `7db5b805b676dd79d3bd7fec503f19b8a65e419a8684eb89cc7101176ad58a2e`。
- 独立审查者重新计算全部 51 个文件的 bytes 与 raw SHA，结果一致。
- 两套独立 PostgreSQL 环境分别完成 10 个前向迁移及每个迁移的即时重跑；
  schema/history 逐字节一致，000191/000192 未被越权执行。
- reviewed baseline 精确覆盖双历史 skip；000175 的失败、回滚与 history 证据闭合。

## 数据、运行时与清理门禁

- 两套 fresh database 均完成首次 fixture 写入、第二次精确 no-op、回滚零残留、
  第三次重建同一 snapshot；每套环境闭合 23 个校验项。
- Track A 基础数据在 B 扩展前后保持一致，fingerprint：
  `14a86a…`；两套环境的 B 扩展状态一致，fingerprint：`d87046…`。
- 本地静态门禁 `21/21`；support repository 单测 `9/9`；service 门禁
  `8/8` 与 `26/26`。
- 每套 fresh database 的 PostgreSQL suites 分别为 `10/10`、`3/3`、`93/93`；
  六个 runtime 精确目标各执行一次。
- 11 个负向场景全部满足 `exact_once=true`。
- 两套正式容器、各自匿名卷及物理临时文件均已精确清理；artifact 记录
  `container_absent=true`、`anonymous_volume_absent=true`、
  `physical_files_absent=true`、`errors=[]`。根审查另以 Docker 只读过滤复核，
  无残留资源。

## 历史失败候选

- run a 至 run k 均为 FAILED / NON-AUTHORITATIVE；各自暴露的迁移前置、历史重放、
  子进程输出、时间参数类型、fixture 状态、receipt proof、计数标记、负向错误细节、
  PostgreSQL 布尔解析及 baseline 时点问题均已逐项 fail-closed 修正。
- 所有失败 artifact 与 reservation 保持不可变，不得覆盖或作为正式 handoff 使用。

## 放行边界

本签署关闭 B-2b，并释放 B-2c 进入领域接入预检与串行实施。它不代表 B-2c、B-3、
B-4 或 B-5 已完成，也不替代后续领域 schema、adapter、API、Web、迁移对账及总体验收
各自的独立门禁。真实浏览器人工验收仍按既定决定保留为外部 UAT 待办。
