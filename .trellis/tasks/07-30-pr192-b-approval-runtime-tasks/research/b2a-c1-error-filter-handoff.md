# B-2a C1 property error filter owner handoff

> 日期：2026-08-01
>
> 结论：`C1 FILTER IMPLEMENTATION COMPLETE / INDEPENDENT C1 RE-GATE PENDING`
>
> `implementation_release=blocked`

## 1. 基线、消费值与 ownership

```text
base commit = 0152616fb9a25effdff68fa9da24fea7db8a21a7
consumed B-contract SHA = 81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3
consumed B-shared-source SHA = b4930006f4e9bef6f2976ab5b0e1a5127561cdb6576c464650ac82cf0864056a
```

本 owner 的 exact owned paths 只有：

1. `apps/api/src/shared/filters/api-exception.filter.ts`
2. `apps/api/src/shared/filters/api-exception.filter.spec.ts`

没有把其他 filter/helper、shared、migration、runtime 或 sidecar 纳入 content hash，也未启动数据库。

## 2. `b-property-error-filter-v1` exact grammar

Raw SHA 针对未经 newline normalization 的原始文件 bytes，顺序固定：

| 顺序 | Path | Raw SHA-256 |
|---:|---|---|
| 1 | `apps/api/src/shared/filters/api-exception.filter.ts` | `c0deab0b10e462dca022d401bce28b1ab779e4002865c1ba52e212239d738541` |
| 2 | `apps/api/src/shared/filters/api-exception.filter.spec.ts` | `0a220f7ff0979c7d14a95f2904e566a6722ea86f7ee8e828b3b3e412f8e01b4e` |

唯一 grammar bytes：

```text
b-property-error-filter-v1\n
file<TAB>apps/api/src/shared/filters/api-exception.filter.ts<TAB>c0deab0b10e462dca022d401bce28b1ab779e4002865c1ba52e212239d738541\n
file<TAB>apps/api/src/shared/filters/api-exception.filter.spec.ts<TAB>0a220f7ff0979c7d14a95f2904e566a6722ea86f7ee8e828b3b3e412f8e01b4e\n
```

其中 `<TAB>` 是单个 `0x09`，每个 `\n` 是单个 `0x0a`；UTF-8、LF-only、无 BOM、final LF。
完整 grammar bytes 的 SHA-256 为：

```text
B-property-error-filter SHA = ff28353767c7f44acf7a57561be3f1750e4ff8d117377aa46a393d8845abfad0
```

两文件逐项检查均为 UTF-8、LF-only、无 BOM、final LF。

## 3. 验证与泄漏证据

以下命令在仓库根目录、Node.js 20.20.2、pnpm 9.12.0 下执行：

| 命令 | 结果 |
|---|---|
| `pnpm --filter @jinhu/api exec node --test --require ts-node/register src/shared/filters/api-exception.filter.spec.ts` | PASS；真实 Nest HTTP + unit 共 11/11，0 failed |
| `pnpm --filter @jinhu/api typecheck` | PASS；退出码 0 |
| `pnpm --filter @jinhu/api lint` | PASS；退出码 0 |

Unit evidence 证明 filter 只保留 closed errorCode/recovery allowlist；task details 只允许安全的
`assigneeDisplay`/`deepLink`，并拒绝未知 error、错误 recovery pairing、UUID fallback、stack、claim
token、identity number、非 scalar/超长值和任意 structured details。真实 HTTP Gate 的不可变输入
与结果为：

| Evidence | Raw SHA-256 |
|---|---|
| `b2a-c1-http-leak-gate-contract.md` | `154bd35bff64559e7617231f5d9286e05e187140fbc888b66d689d918424dbbc` |
| `b2a-c1-http-leak-gate-signoff.md` | `736c73e298f341dbd91a16f69773920715b0b568e432b5172e0452bc4be325cb` |
| `b2a-c1-http-leak-gate-artifact.json` | `de84c656bad5d384532573a0d69dc050f19d56e7f01a331748ad01ad833e7a27` |
| `b2a-c1-http-leak-gate-evidence.md` | `87f3d10b9cc4c5c1ceb6452ea30752f95602d3b7a4427d9bb716b98270bbb744` |

Artifact 与 evidence 绑定本表 exact filter/spec bytes 及现行 shared
`b4930006f4e9bef6f2976ab5b0e1a5127561cdb6576c464650ac82cf0864056a`，记录真实 Nest route/guard/controller/filter
链路的 11/11 PASS；hidden-existing 与 hidden-missing 均在 handler/repository 前拒绝，HTTP status、
raw body、Content-Length、trace 与 operation count exact 相同。40 次 warmup 后以固定 xorshift32-v1
交错执行 200 次 measurement，无删样；结构 timing 判据为 PASS，墙钟统计仅作 diagnostic、无阈值。

Canonical artifact 写入已防覆盖：只有显式 canonical output path 与 exact owner replacement token
才允许原子 temp+rename；拒绝相对路径、路径逃逸、symlink、其他目录及无 token 覆盖。无 artifact
环境变量的 reviewer command 仍完成 11/11 HTTP/assert/measurement，但不写输出；其前后 canonical
raw 均为 `de84c656bad5d384532573a0d69dc050f19d56e7f01a331748ad01ad833e7a27`，mtime 均为
`2026-08-01 01:31:36.107510111 +0800`，证明 reviewer re-Gate 不再覆写 owner artifact。

旧 artifact `3a02d03f6b31c29f3e1bd305afdf84767d7d1e97e5092db8d9e49def034f4a1b`、被无输出
reviewer 覆盖产生的 `fe539fff4fd0e1eaba82de40e80e8489f5cc448ce257c6b33e7e1310fa2f542f`，以及修复覆盖保护后
仍绑定已 supersede shared 的 `25ec734af080be2c213c50950f5d11f04a7980735ce40f00de83a4de9d806e13`
均明确为 `superseded/non-authoritative`；不得作为当前 C1 输入。最终兼容性仍交由独立 C1 final
re-Gate 复核，不把 HTTP 子门禁扩张成 C1 总 PASS。

正式采样前有两次环境 EPERM 诊断：一次测试进程内 git spawn 被沙箱拒绝，改为只读 HEAD/ref；
一次默认沙箱 loopback listen 被拒绝，正式执行仅受控开放 OS 分配的 loopback 临时端口。两次均在
warmup/PRNG sampling 前终止，未生成 artifact、未产生样本、未参与 seed 或结果选择。

```text
http_exact_leak_timing = PASS
known_failures = []
owner_open_P0_P1 = []
independent_C1_regate = pending
```

本 handoff 只证明 filter owner 批次已完成；独立 C1 re-Gate 通过前，不得宣称 C1、C2、B-2a
runtime 或 production enforcement PASS，也不得以本 sidecar 代替岗位 UAT。
