# Track C 最终技术交接（2026-08-06）

## 结论

- Track C technical status：`PASS`。
- B technical base：`f4797adf`。
- C final SHA：`15b6e8f6edd12759dc35b1675f851c9a0bc52c0c`。
- 产品 `open_P0_P1=[]`。
- Track C 可归档；父任务的 Codex 技术泳道可标记 `codex_complete`。
- 真人岗位 UAT、业务/财务/安全/发布签署与 production readiness 不在本结论内，
  继续 `awaiting_human_gate`。

## 交付范围

- Homestay 与 Housing command/query closure 拆分及 façade 兼容。
- Canonical property occupancy port 单向切换，无 dual DI/read/write。
- Offline draft、upload queue、上下文隔离、TTL、敏感数据和 rollback flags。
- 外部 URL、DTO、response、approval/identity/outbox/finance/occupancy contract 保持兼容。
- Complexity、全量 API、隔离 PostgreSQL、rollback 与固定资源性能 Gate。
- Offline path input handoff：
  [offline-path-input-handoff-20260804.md](./offline-path-input-handoff-20260804.md)；
  output 在 final SHA 停写并随本交接返还，`writer_stopped=true`。

## 正式回滚证据

- 独立 checkout：`/home/jinhuit/JinHuCodebase/jinhu-smart-park-rollback-formal`。
- Run：`artifacts/property-remediation/rollback-runs/rollback-20260805T220100Z-15b6e8f6edd1`。
- 19/19 closure PASS；source dataset/schema 不变。
- Supervisor SHA：`d9de95eb0eb4e2098c0ec6619a0caefe2faa1897b2c2cab06c53c67a19d65bc4`。
- Spec SHA：`8b0d5ccfd4e1eb70c39cd777a0b992b451104b0dff7caf8ee614ad7f11326d54`。
- Cleanup attestation SHA：
  `c51d93d99a40466e0a7f666693f18db73cb9057c730ccab03bc8e844ae803339`。
- 独立 evidence reviewer 与 cleanup reviewer：`APPROVE`，P0/P1/P2=0。

## 正式性能证据

- Project：`jinhu-track-c-perf-20260806g`。
- Run：
  `artifacts/property-remediation/runs/2026-08-05T23-41-05-458Z-15b6e8f6edd1`。
- Evidence：
  `artifacts/property-remediation/runs/2026-08-05T23-41-05-458Z-15b6e8f6edd1/formal-evidence.json`。
- Evidence SHA-256：
  `1a451ecf1241de7a95aa3726fe97da244971f31ecf2ed27cf4492446bdc64ff2`。
- Profile SHA-256：
  `d1ef726876ea2fb5d2878710d59f464497969ea28305995a50f84e5f303e3cc6`。
- Dataset SHA-256：
  `ec3c096d731cc10e426d290ef199b94ee706a47fcf15171a2466e26ad93e2e31`。
- 30/30 cells PASS；每格 120s warmup、600s formal、requests >=10,000。
- 所有 error rate=0；p95 max=200.374ms；throughput min=98.780/s。
- 六个 scenario/concurrency 组 p95 CV max=0.04935（门槛 0.20）。
- 6 个 cold proof SHA 已独立核验；30 个 cell artifact SHA 全部匹配。
- Formal evidence gate：`PASS`，expected/observed=30/30，errors=[]。
- Cleanup SHA-256：
  `28b488784c276565d5da3af119e3dd27d3ffca584d6c3ec2d3cbfec1f7a796fc`；
  containers/networks/volumes/secret files residual=0。
- 独立 performance reviewer：`APPROVE`，P0/P1=0；P2 仅为 gate 脚本未自动
  强制若干精确 commit/reviewer/artifact SHA，已由本次独立手工核验补足。
- 独立 cleanup reviewer：`APPROVE`，P0/P1/P2=0。

## Chrome 增量环境边界

- Matrix：15/15 `BLOCKED`，screenshots=0。
- Item：`C-P1-CHROME-HOST-ENVIRONMENT`。
- 原因：Chrome 插件在执行任何扩展代码前拒绝 WSL 映射目录：
  `sandboxCwd is not a local file URI: file:///mnt/d/...`。
- 证据：
  `D:/lishuai/JinhuWork/智慧园区UAT测试/2026-08-04/12-track-c-reliability-delta`。
- 未使用应用内浏览器、独立 Playwright、Computer Use、CDP 或 CSS/DOM 注入替代。
- 这是开放宿主环境 P1，不是产品 P1；环境修复后可原样补跑，但不得改写本次为 PASS。

## 父任务后续

1. 不重复 Track B UAT 或归档。
2. Track C 归档后，父任务记录 `codex_execution_status=codex_complete`。
3. Human task 继续承载真人 UAT 与业务、财务、安全/审计、发布签署。
4. 在人工 Gate 完成前，`production_readiness_status=awaiting_human_gate`，高风险开关
   继续 fail closed。
