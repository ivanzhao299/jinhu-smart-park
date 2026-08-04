# B-2a C1 HTTP No-Existence-Leak Gate Evidence

> 日期：2026-08-01
>
> 结论：`HTTP_GATE=PASS / timing_no_existence_leak=PASS`

## 1. 不可变输入与执行绑定

| 输入 | Raw SHA-256 |
|---|---|
| `b2a-c1-http-leak-gate-contract.md` | `154bd35bff64559e7617231f5d9286e05e187140fbc888b66d689d918424dbbc` |
| `b2a-c1-http-leak-gate-signoff.md` | `736c73e298f341dbd91a16f69773920715b0b568e432b5172e0452bc4be325cb` |
| `api-exception.filter.ts` | `c0deab0b10e462dca022d401bce28b1ab779e4002865c1ba52e212239d738541` |
| `api-exception.filter.spec.ts` | `0a220f7ff0979c7d14a95f2904e566a6722ea86f7ee8e828b3b3e412f8e01b4e` |
| consumed B-shared-source | `b4930006f4e9bef6f2976ab5b0e1a5127561cdb6576c464650ac82cf0864056a` |

```text
base commit = 0152616fb9a25effdff68fa9da24fea7db8a21a7
B-property-error-filter SHA = ff28353767c7f44acf7a57561be3f1750e4ff8d117377aa46a393d8845abfad0
Node = v20.20.2
Node executable raw SHA = 6295488653f0d93b0a157841746fef7e72cc4328cfb60c4bbe0ca2668a836ffd
execution process cwd = /home/jinhuit/JinHuCodebase/jinhu-smart-park/apps/api
```

工作树为 dirty；合同、signoff、filter、spec 均由 artifact 中的 exact raw SHA 绑定，其他工作树
改动不属于本门禁证据。执行未连接或启动数据库，未修改 filter、shared、runtime、AppModule、依赖或
migration。

## 2. 正式执行

仓库根目录发起的目标命令：

```text
B2A_HTTP_GATE_ARTIFACT_PATH=/home/jinhuit/JinHuCodebase/jinhu-smart-park/.trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c1-http-leak-gate-artifact.json B2A_HTTP_GATE_ALLOW_REPLACE=owner-canonical-regeneration PATH=/home/jinhuit/.nvm/versions/node/v20.20.2/bin:$PATH pnpm --filter @jinhu/api exec node --test --require ts-node/register src/shared/filters/api-exception.filter.spec.ts
```

pnpm 进入 API package 后，artifact 记录的未展开测试命令为：

```text
B2A_HTTP_GATE_ARTIFACT_PATH=/home/jinhuit/JinHuCodebase/jinhu-smart-park/.trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c1-http-leak-gate-artifact.json B2A_HTTP_GATE_ALLOW_REPLACE=owner-canonical-regeneration pnpm --filter @jinhu/api exec node --test --require ts-node/register src/shared/filters/api-exception.filter.spec.ts
```

正式执行退出码为 `0`：11 tests、11 PASS、0 FAIL。由于 workspace 沙箱默认禁止
`127.0.0.1` listen，正式 PASS 使用受控权限仅开放 OS 分配的 loopback 临时端口；没有外部网络或
数据库访问。此前两次环境诊断均在 warmup/PRNG 初始化前停止：第一次为测试进程内 `git` spawn
被沙箱拒绝，随后改为只读 `.git/HEAD`/ref；第二次为默认沙箱 `listen EPERM`。两次均未生成
artifact、未产生测量样本，也未被用于选择 seed 或 timing 结果。

本次修复前，原 owner artifact raw `3a02d03f6b31c29f3e1bd305afdf84767d7d1e97e5092db8d9e49def034f4a1b`
被无输出隔离缺失的 reviewer re-Gate 重跑覆盖为
`fe539fff4fd0e1eaba82de40e80e8489f5cc448ce257c6b33e7e1310fa2f542f`。两者现均为
`superseded/non-authoritative`。根因是旧 spec 在每次执行时无条件写固定 canonical 路径，没有把
验证运行与 artifact 发布分离，也没有 owner replacement token、symlink/path 限制或原子写。

覆盖保护修复后生成的 `25ec734af080be2c213c50950f5d11f04a7980735ce40f00de83a4de9d806e13`
仍绑定已 supersede 的 shared source digest，因此也登记为 `superseded/non-authoritative`。当前唯一
权威 artifact 改为消费 signed shared SHA
`b4930006f4e9bef6f2976ab5b0e1a5127561cdb6576c464650ac82cf0864056a` 的本次再生结果。

新 spec 只有显式 `B2A_HTTP_GATE_ARTIFACT_PATH` 才写 artifact：目标只允许 exact canonical 或
`/tmp` 下尚不存在的新文件，拒绝相对路径、路径逃逸、symlink 与其他位置。canonical 默认拒绝
覆盖，只有 exact owner token `B2A_HTTP_GATE_ALLOW_REPLACE=owner-canonical-regeneration` 可原子
temp+rename 替换；失败会清理 temp。reviewer 无环境变量时仍执行全部 HTTP/assert/measurement，
但不写任何 artifact。

后续验证：

| 命令 | 结果 |
|---|---|
| 同一 targeted spec command | PASS；11/11 |
| 无 artifact 环境变量的 reviewer command | PASS；11/11；canonical raw 与 mtime 不变 |
| `pnpm --filter @jinhu/api typecheck` | PASS；exit 0 |
| `pnpm --filter @jinhu/api lint` | PASS；exit 0 |
| `git diff --check`（spec + artifact） | PASS |

## 3. HTTP 与授权结果

四个 case 均通过同一个真实 Nest route、同一个 guard/controller 和同一个生产
`ApiExceptionFilter` instance：

| Case | HTTP | Handler | Repository lookup | 结论 |
|---|---:|---:|---:|---|
| `hidden-existing` | 403 | 0 | 0 | exact signed forbidden wire |
| `hidden-missing` | 403 | 0 | 0 | 与 hidden-existing raw bytes/content-length/trace exact 相同 |
| `authorized-missing` | 404 | 1 | 1 | read authority 后查询一次并返回 exact not-found wire |
| `authorized-existing-baseline` | 200 | 1 | 1 | 同一 authorized lookup 路径可达成功分支 |

403/404 的 `Content-Type`、`Content-Length`、原始 UTF-8 body、递归字段顺序与 body SHA 均已保存。
四个 `canary-crop` / `canary-invalid-recovery` probe 全部通过：恶意 message、action/target/version、
blocker、claim token/epoch、stack、SQL、repository、source、tenant/park 与内部 details 均未泄漏；
invalid recovery 返回 exact `data:null`，clean/crop 仍保留签署的 `errorCode/retryable/details:{}`。

## 4. 结构 timing Gate 与诊断样本

结构判据全部为 true：同 route handler selection、同 guard trace、hidden handler 不进入、同完整
filter input/output witness、同 operation counts、repository/resource count 均为 0、同 canonical
response bytes 与 Content-Length。因此唯一合同判据：

```text
timing_no_existence_leak = PASS
```

固定 warmup 为 40 请求（每 hidden case 20），measurement 为 xorshift32-v1 交错 200 请求
（每 case 100），没有删除样本：

```text
seed input SHA = 14a4ad1f7efb3a6235d4a09514f6051b94aa5b57ac216e02fedfcd92f32478c5
derived seed = 346336543 / 14a4ad1f
zero substituted = false
measurement initial state = 346336543
measurement final state = 2175979399
```

墙钟 min/median/p95/max 仅保存在 artifact 的 `diagnosticOnlyTimingSummary`，明确
`diagnostic_only=true`、无阈值、无显著性、无 equality verdict；它们不参与 PASS。

## 5. Raw artifact

```text
path = .trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c1-http-leak-gate-artifact.json
raw SHA-256 = de84c656bad5d384532573a0d69dc050f19d56e7f01a331748ad01ad833e7a27
format = UTF-8, LF-only, no BOM, final LF
warmup = 40
ordered timing samples = 200
hidden-existing samples = 100
hidden-missing samples = 100
canonical mtime before no-output reviewer run = 2026-08-01 01:31:36.107510111 +0800
canonical mtime after no-output reviewer run = 2026-08-01 01:31:36.107510111 +0800
canonical raw before/after no-output reviewer run = de84c656bad5d384532573a0d69dc050f19d56e7f01a331748ad01ad833e7a27
```

## 6. 边界与剩余事项

- 本证据只放行签署合同规定的 C1 HTTP no-existence-leak Gate，不代表 C1 总门禁、C2、C4、B-2a
  runtime、浏览器验收或生产验收通过。
- filter handoff sidecar 中 `http_exact_leak_timing=pending` 的更新不属于本 owner 授权范围，交由
  handoff owner 消费本 artifact/evidence 后更新。
- `known_failures=[]`，`open_P0_P1=[]`。
