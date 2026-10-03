# 三端同步 · 整合与基线对齐说明（canteen 模块）

- 分支：`codex/canteen-module-20261002`（worktree `canteen-module-20261002`）
- 操作日期：2026-10-03
- 合并方式：`git merge origin/main`（**merge，未 rebase，未 push**）
- merge commit：`64aceb2ade7ca80ab324c4999ebfaf7b307fec1f`
- 合并基线：`origin/main = 8effe13e24c7a186d374acb535950bfa76b1f471`（含 HR 玉舟档案 #795-#802、#802 deploy runtime revision）
- 合并前 feature HEAD：`5203ea320a9755a28af90219601c16e9d449be58`（ahead 16 / behind 27）

---

## 1. 冲突解决清单

`git merge origin/main --no-edit` **无文本冲突**（0 个 unmerged 文件）。
双方新增文件因文件名不同被 git 自动并置，但出现**同号不同名**的迁移/seed 撞号，已按下方顺延重命名解决。其余文件无冲突。

保留原则：
- 我们的 16 个提交、`docs/canteen/**`、17 张 `biz_canteen_*` 表与 M1/M2 后端前端全部保留；
- 主干 27 个提交（HR 玉舟档案、hr_insurance policy/owned-period、deploy runtime revision）全部保留；
- canteen 权限点（`packages/shared/src/canteen/**`）、saas 模块注册、前端主导航/路由未被覆盖；
- `packages/shared/src/hr-insurance-policy.ts`、`hr-insurance-owned-period.ts`、`hr-payroll-insurance-source.ts`（主干新增）随合并进入。

---

## 2. 迁移 / seed 新旧号对照表

合并后主干最大迁移号 = `000323`（hr_insurance_owned_period），最大 seed 号 = `000035`（hr_insurance_owned_period_catalog）。
为保证全局唯一、顺序正确（canteen 建表在 hr_insurance 之后、放宽 provider CHECK 在建表之后），canteen 文件顺延：

| 类型 | 旧号（feature 上） | 新号（合并后） | 说明 |
|---|---|---|---|
| 迁移 | `000322_canteen_module.sql` | `000324_canteen_module.sql` | 建 17 张 biz_canteen_* 表 |
| 迁移 | `000323_canteen_mock_payment_provider.sql` | `000325_canteen_mock_payment_provider.sql` | forward-only 放宽 payments.provider CHECK 允许 `mock` |
| seed | `000034_canteen_settings_default.sql` | `000036_canteen_settings_default.sql` | 默认餐补设置 |

主干侧撞号文件保持不动：
- 迁移 `000322_hr_insurance_policy_version.sql`、`000323_hr_insurance_owned_period.sql`
- seed `000034_hr_insurance_policy_catalog.sql`、`000035_hr_insurance_owned_period_catalog.sql`

### 同步更新的内部引用
- `apps/api/src/modules/canteen/canteen.schema.spec.ts:83` — 迁移路径 `000322_canteen_module.sql` → `000324_canteen_module.sql`
- `scripts/sql/canteen_module_rollback.sql:2` — 注释更新为 `000324_canteen_module.sql`
- 三个 sql 文件首行自注释（迁移/seed 头注释）
- 历史交付文档 `docs/canteen/m1-m2-delivery.md` 仍记录旧号（历史快照，不回改，以本表为准）

---

## 3. 验收环境（隔离，未污染旧库）

- 既有容器**未重跑迁移、未删除**：`canteen-dev-pg`=127.0.0.1:55432、`canteen-demo-pg`=127.0.0.1:55433
- 新建隔离容器：`canteen-accept-pg`，**127.0.0.1:55434**，镜像 `postgres:16-alpine`，**新 volume `canteen_accept_pg_data`**
- 连接串：`postgresql://jinhu:change_me@127.0.0.1:55434/jinhu_smart_park`
- 验收后只停自建 API(3102)/Web(3112) 进程；**容器与卷保留不删**

---

## 4. 验收证据

### 4.1 迁移 up / down / up（新容器 55434，从零）
```
sh scripts/db-migrate.sh   # COMPOSE_FILE 指向 55434 的临时 compose
Total files: 319
Succeeded files: 319 / Failed: 0 / prerequisites succeeded: 8
Last successful: 000325_canteen_mock_payment_provider.sql
顺序核对：000322 hr_insurance_policy_version → 000323 hr_insurance_owned_period
        → 000324 canteen_module → 000325 canteen_mock_payment_provider
```
- canteen 17 张表全部建立；关键约束 `ck_canteen_wallets_amount`、`ck_canteen_orders_split` 存在；
- `payments.provider` CHECK 已含 `mock`（`wechat/alipay/mock`）；
- canteen 21 个 FK；主干 hr_insurance 6 张新表正常。

回滚 canteen（`scripts/sql/canteen_module_rollback.sql`）后：
- biz_canteen_* 表 = **0**（全部 DROP）；
- hr_insurance 表 = **6**（保留）；public 其余用户表 = **431**（主干保留）。

删除 canteen 历史行后再次 `db-migrate.sh`：
```
Skipped: 317 / Succeeded: 2（000324/000325 重放）/ Failed: 0
biz_canteen_* 表恢复 = 17，两个关键 CHECK 恢复。
```

### 4.2 build / typecheck
```
pnpm --filter @jinhu/shared build     → exit 0
pnpm typecheck（shared/ui/api/web）   → exit 0（全绿）
pnpm --filter @jinhu/api build        → nest build, exit 0
pnpm --filter @jinhu/web build        → next build, exit 0
```

### 4.3 canteen pg specs（连新容器 55434，连跑两遍）
命令：
```
PARTY_DATA_ENCRYPTION_KEY=test-only-party-key-12345678901234567890 \
CANTEEN_PG_TEST=1 \
DATABASE_URL="postgresql://jinhu:change_me@127.0.0.1:55434/jinhu_smart_park" \
node --test --test-force-exit --require ts-node/register \
  canteen.schema.spec.ts canteen-m1.pg.spec.ts canteen-m1.boot.pg.spec.ts canteen-m2.pg.spec.ts
```
结果：
```
RUN 1 → # tests 7 / # pass 7 / # fail 0
RUN 2 → # tests 7 / # pass 7 / # fail 0
```
（沿用 `RandomizedNumberService` 给单号追加运行随机后缀，跨租户全局唯一，连续/乱序可重复。）

### 4.4 E2E（新容器 + 新端口 3102/3112，admin/Jinhu@123456）
seed：core + dev 账号 + production/*.sql（含 000036 canteen settings）。API 3102、Web 3112 指向 55434。
建档口 `O202610030001`「验收一号档口」、品类「热菜」、3 个菜品（红烧肉/清炒时蔬/番茄蛋汤）。

API 全链路实测：
- 开班 `CS202610030001`（open）；
- `POST /pos/checkout/qr` → `order_no=CO202610030002`、`payment_no=CP202610030002`、`status=pending`、返回 `code_url`、`expires_in=120`；
- open 状态下 `GET /pos/sessions/current/day-close` 实时预览 = `qr_pay_total 0.00 / order_count 0`（存储列未变，只读）；
- `POST /internal/mock/payments/CP202610030002/settle` → `paymentStatus=paid / orderStatus=completed`；
- `GET /payments/CP202610030002/status` → `status=paid / order_status=completed / paid_time` 落定；
- settle 后预览实时汇总 = `qr_pay_total 20.00 / order_count 1`（班次仍 open）；
- `POST /pos/sessions/{id}/close` → `status=closed`，`qrPayTotal=20.00 / orderCount=1`，`closeSnapshot` 落定；
- `GET /pos/sessions?page=1&page_size=10` → `{list[1], total:1, page:1, pageSize:10}`。

浏览器截图（`docs/canteen/selfcheck/`）：
- `20261003-accept-pos.png` — POS 收银终端（扫码收款/员工餐补/混合支付 M2/开班-结班日结/沽清权限可见性）
- `20261003-accept-my-subsidy.png` — 个人中心「我的餐补」
- `20261003-accept-hr-insurance.png` — 主干新增「社保政策版本」页（合并未破坏）

---

## 5. 待推送 commit 列表（origin/main..HEAD，merge 后）

```
64aceb2a Merge remote-tracking branch 'origin/main' into codex/canteen-module-20261002
5203ea32 feat(canteen): dishes tabbed UI, minimal drawer, batch shelf, POS long-press 沽清
e2a65c5c docs(canteen): M0-M2 delivery & acceptance evidence with screenshots
bed271ec test(canteen): isolate pg specs with globally-unique per-run business numbers
4e01f78f feat(canteen-pos): day-close preview uses read-only /sessions/current/day-close
6df3ab34 feat(canteen): read-only day-close preview for open session (no state change)
980c98a3 fix(canteen-pos): close-shift preview calibrated from backend; close uses real sessionId
c85304a3 fix(canteen-pos): auto-fallback to mixed on 422 subsidy overbalance
2ca4e0c4 fix(canteen): harden /account/meal-subsidy against per-request failure
5f35e281 fix(canteen): wallet controller WalletTxnQueryDto 改为值导入
e94eb050 feat(canteen-m2): employee meal-subsidy wallet center + POS subsidy/mixed checkout
776c2b1c feat(canteen): add GET /pos/sessions list endpoint for admin shift/daily-close page
7d1a408e feat(canteen): M2 补贴虚拟钱包、月度发放、虚拟结账、混合支付、月末清零
35b9f0de fix(canteen): align admin pages with real backend snake_req/camel_resp contract
a11dfb67 feat(canteen): M1 backend — archive CRUD, QR payment chain, POS sessions, order query
02f758c3 feat(canteen): M1 前端 — 管理端(dishes/orders/sessions)+横屏POS+typed client
f63c7428 feat(canteen): M0 module foundation — 17-table migration, entities, scaffold, settings, permissions
```
（本次整合的重命名与本说明文档提交在最后，随本次 commit 一并待推。）

---

## 6. 本地 main 是否可 ff 到 merge commit

```
git rev-parse main                                   → 2b7d91d20df3b7ff16c85b453ba2b47495c46d71
git merge-base --is-ancestor 2b7d91d2 HEAD(=64aceb2a) → exit 0（是祖先）
git merge-base --is-ancestor origin/main HEAD         → exit 0
```
**结论：本地 main（2b7d91d2）是 merge commit 64aceb2a 的祖先，可 fast-forward 到该 merge commit。** ff 由用户执行，本 worktree 不动 main/hr-t0。

---

## 7. 未做 / 边界
- 未 push、未生产部署、未删除任何文件/目录/容器/卷/备份、未 `git clean`；
- 未动主仓库 `/Users/mac/Documents/jinhu-smart-park`、hr-t0 worktree、本地 main；
- 未 `pnpm install`、未改 apps/web 业务代码；
- 既有 3101/3110 长驻进程与 55432/55433 容器保持运行未动；
- 自建 3102/3112 已停；`canteen-accept-pg`(55434) 容器与卷保留。
