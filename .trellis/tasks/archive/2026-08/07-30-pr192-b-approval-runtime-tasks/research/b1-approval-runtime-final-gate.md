# B-1 Approval Runtime 最终门禁与交接

日期：2026-07-31  
阶段结论：`B-1 = PASS / COMPLETED`  
任务结论：`approval-runtime-tasks = in_progress`  
下一阶段：`B-2a Property Task Runtime`

## 1. 冻结交付

| 交付项 | 冻结值 |
|---|---|
| `B-approval-runtime SHA` | `79691ea945e5c37ddd075ff4e234dbb00eec084ede2b36717393360344e2270d` |
| runtime 文件数 | 50 |
| module raw SHA | `54de6b20e768e1c4ff87ab0fb5949f808f9ee7488d98545ac4a96a122a413fb5` |
| `000193` raw SHA | `c769efe549385f74092114cdf5f68c8ea40d78885bfecd484ed5a379f9c67f07` |
| composition 后 `AppModule` raw SHA | `225fbdfa17f7d2ec99f280d909cab057fc04b803c06fbf2ae378874707ef09fb` |
| `AppModule` 变更范围 | 仅 2 行：模块 import 与 imports 注册 |
| 未关闭缺陷 | `open_P0_P1=[]`，且 B-AR4 `P0/P1/P2=0` |

## 2. 独立复审

- architecture B-AR4：PASS，P0/P1/P2 均为 0。
- finance/idempotency B-AR4：PASS，P0/P1/P2 均为 0。
- security/RBAC B-AR4：PASS，P0/P1/P2 均为 0。
- AppModule composition 独立 Gate：PASS；composition 只增加 2 行，冻结 runtime
  SHA 未改变。

## 3. 自动验证证据

| 验证范围 | 结果 |
|---|---|
| Property approvals 本地 specs | 19/19 PASS |
| Core unit aggregate | 64/64 PASS |
| 联合 PostgreSQL 门禁 | 15/15 PASS（outbox 10、core 5） |
| 独立财务非 PostgreSQL | 17/17 PASS |
| 独立财务 PostgreSQL | 15/15 PASS |
| API typecheck | PASS |
| API build | PASS |
| Property approvals eslint | PASS |
| diff-check | PASS |

全量 `pnpm test` **未登记为 PASS**。该入口因运行环境缺少 `JWT_SECRET`，在现存 IoT
模块启动阶段失败，尚未进入 B-1 业务断言；这不替代上表的定向验证，也不能被误写为
全量测试通过。

## 4. 数据库清理与后续边界

- 本轮最终联合门禁创建的临时数据库已按精确名称清理。
- 以下 4 个历史测试数据库不是本轮创建，未经用户授权继续保留，未宣称已清理：
  - `jinhu_property_runtime_gate_1785495628_1922199`
  - `jinhu_property_runtime_gate_1785495859_1964900`
  - `jinhu_property_runtime_gate_1785496051_2007218`
  - `jinhu_property_runtime_gate_1785496460_2094311`
- B-4 保留并负责：历史 receipt proof 回填、约束 `VALIDATE`、`NOT NULL` 收缩、领域行核对。
- 人工 production/UAT 尚未签署；B-1 PASS 是技术门禁结论，不是生产就绪结论。

## 5. B-2a 接入条件

B-2a 必须消费本文件冻结的 `B-approval-runtime SHA`，保持
`property-approvals/**` 所有权边界不变，并单独输出 `B-property-task-runtime SHA`。
不得将 B-1 完成误报为 Track B 或整个 `approval-runtime-tasks` 任务完成。
