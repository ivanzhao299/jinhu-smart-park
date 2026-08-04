# B-property-task-runtime v1 handoff 签署

- schemaVersion: `b-property-task-runtime-v1-handoff-signoff-v1`
- status: `SIGNED`
- decision: `PASS / GO`
- signature: `B_PROPERTY_TASK_RUNTIME_V1_HANDOFF=SIGNED`
- signedAt: `2026-08-01`
- productionEnablement: `false`

## 不可变证据

- runtime grammar raw SHA: `f6d6f302cf14078bff54eb241d62763155a279ce272de2461b2de84b9df17645`
- `B-property-task-runtime SHA`: `f6d6f302cf14078bff54eb241d62763155a279ce272de2461b2de84b9df17645`
- runtime file count/grammar bytes: `26 / 3583`
- callsite grammar raw SHA: `066dc38facdcf660d092ff85ec51557b81463081f52e4edc951a31f71f30cb15`
- `B-property-task-projection-callsite SHA`: `066dc38facdcf660d092ff85ec51557b81463081f52e4edc951a31f71f30cb15`
- callsite count/grammar bytes: `8 / 1208`
- handoff raw SHA: `5d0ab508824593b62d5071f0fbf14d673cea54bd8394407679bec9c7a0040aa3`

## 签署结论

- manual rebuild / command authority-sync / terminal authority-sync: `1 / 5 / 2`
- unique replace-function SQL callsite: `1`
- direct projection/head DML: `0`
- second projection writer/function: `0`
- runtime tree exact-set and per-file SHA: `PASS`
- consumed approval/foundation/filter/projection/C4 SHA: `PASS`
- open P0/P1/P2: `[] / [] / []`

独立 reviewer `c3_port_pg_gate` 与 `c4_01b_final_reviewer` 均完成原始字节复算、bilateral callsite 扫描和 consumed SHA 核对，评级均为 `P0=0, P1=0, P2=0, PASS / GO`。

本签署只关闭 Property Task Runtime 独立 handoff。`B3_web_consumer_status=pending`，桌面/390px/focus/44px 浏览器证据 pending，AppModule composition 仍在独立纠偏门禁中，生产启用保持 `false`。
