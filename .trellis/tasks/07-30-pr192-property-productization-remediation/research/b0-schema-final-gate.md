# B-0 Schema Expand 终局门禁

> 日期：2026-07-31
>
> 结论：`PASS`
>
> `open_P0=[]`
>
> `open_P1=[]`

## 冻结输入

- B-contract SHA-256：`a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8`
- Physical addendum raw SHA-256：`34759fbca464e10d61cff03fcc2a2278bccbe8d50d47b35fbaa7b55d94f50f45`
- Shared Track B contracts raw SHA-256：`d9bdf3db071a0b425a0d003c97cb4d407ed7c5d5098a34c168bb8e609722db66`
- `000189` raw SHA-256：`f4af3e88776ae16a0903b0a9a6a8453f674a7a8d317bdd56b5455dfc18e114a2`
- `000190` raw SHA-256：`da633165db9a031d2a981a2d20f26a2fd78920b91be7722044b06bc9a7385c3a`
- Gate runner raw SHA-256：`68f9a870f60fa70a68e5b077f640d8df52bb35a8426ac7243311e46a6ac3faf6`

## 正式证据

- 临时原始 evidence：`/tmp/pr192-b0-readiness-formal-final.json`
- Evidence raw SHA-256：`a10b0d1ab7d90f8c2f2913dfdb8929fc84a150588490001fa5388949b5b4300b`
- Catalog SHA-256：`a8af55efa8567e597f7706df6559de9761564bd5641f5584724486f772fc3b0f`
- Security SHA-256：`b3099bc2f5b4ed55abd284233ef2f41b0573f2fb9cf869de803af5f0ad9305da`
- `B-schema-expand SHA` / migration-set SHA-256：
  `53e568d409420dc6c38a8139a553735083502f05d6aeb2f3e14adcbb95276874`

## 验收结论

- 三次全新 PostgreSQL 16 运行全部通过，产物逐字一致。
- 正式 evidence 的 requested/completed/actual runs 均为 `3/3/3`；首败路径会立即停止。
- 每轮先等待官方镜像初始化完成标记，再探测最终 PostgreSQL，避免进入临时初始化
  server 的 shutdown 窗口。
- 每轮首次应用、同 schema 重跑、失败回滚、Identity CAS/一致性与安全负向检查通过。
- Track A 历史 occupancy `:id` 只在首次扩展时规范化为 `:occupancyId`；迁移完成后的
  人工 token drift 在重跑时被拒绝且不会自愈。
- 每轮最终数据库存活检查通过后才进入清理。
- 每轮容器与匿名卷均已删除，清理错误为空。
- Marker 为 `1101`，definition rows 为 `180`，security rows 为 `22`。
- 11 类 security drift 均被 fail-closed 拒绝。
- 独立只读终局复核通过，`open_P0_P1=[]`。

## 静态验证

- Schema runner contract：`15/15 PASS`
- Shared Track B contract：`8/8 PASS`
- Stop-ship contract：`3/3 PASS`
- API schema contract：`1/1 PASS`
- Node syntax 与 diff check：`PASS`

原始 evidence 位于临时目录，不作为仓库内长期文件；本文件保存其固定输入、摘要和独立
复核结论。后续 handoff 只能消费上述终局摘要，不得复用此前 UUID scope 或失败轮次的
任何证据。
