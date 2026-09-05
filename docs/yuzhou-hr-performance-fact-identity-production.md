# 玉舟绩效事实身份生产桥（000310）

`000310_hr_yuzhou_performance_fact_identity_production.sql` 为既有 `000308` 绩效关系生产批次补充
`assessmentdetail`（dimension result）和 `assessmentmaster`（master result）的不可变人员身份解析账本。
它不修改 `000308` 已核验的 117 条人员关系与 234 条 subject/assessor 身份计数。

## 执行边界

- 只接受同一 production import operation、同一 T0 owner batch、相同 tenant/park/target scope、
  已成功的 `000308` receipt 和已消费的一次性授权。
- sealed binding 预先固定父级 performance-relations 合同哈希；父级 receipt 因包含 sealed-plan hash，
  只能在 `000308` 成功后由运行时传入。数据库锁定父级 receipt 并逐项核对，不接受调用方自报替代。
- 还必须传入同 operation/batch/scope/T0/fact-set 的生产事实 loader receipt。`000310` 内置依赖 hook
  默认恒为 false；后置的受控生产事实 loader 迁移只覆盖该 hook 并锁定自己的成功 receipt。因而单独安装
  `000310`（包括空集合）也不能执行，不存在用实验库改状态或任意预存 facts 绕过生产 writer 的路径。
- fact-set v1 只包含事实类型、源身份哈希、源行哈希、人员身份哈希和源周期 ID；不保存姓名、人员编码或工资值。
- 人员映射只调用权威 `hr_performance_yuzhou_t0_person_candidate`；0、1、多个候选分别保存
  unmatched、resolved、ambiguous，不按姓名、大小写或其他个人字段猜测。
- 周期未解析不阻断人员解析：已解析人员可保存 `SESSION_BINDING_UNRESOLVED`，供旧查询按当前人员身份展示。
- 重放必须同时满足事实集合、解析状态和 receipt hash；事实增删、候选漂移或参数漂移均失败关闭。
- 回滚只删除本扩展创建的 master/dimension identity 行，并强制逆序为
  `fact identity -> 000308 performance relations -> production facts`。原因是 `score_source` 仍可能引用
  dimension profile；即使当前 `asssour` 是空表，也不能依赖偶然的零行绕过真实外键顺序。

## 当前能力限制

受控源证据中 `assessmentdetail` 和 `assessmentmaster` 当前均为 0 行，所以后续生产事实 loader 可验证空集合，
空集合 fact-set SHA-256 为
`4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`。

仓库中的 `000301` dimension writer 与 `000303` master writer 在本迁移基线仍是 lab-only；现有 sealed production
phase writer 不会生成非空 master/dimension facts。因此必须由独立后置迁移把 000301/000303 的严格字段映射、
record-map 守恒和回滚规则接入 sealed production fact writer，并以成功 receipt 激活本迁移的依赖 hook。
在该后置迁移及其真实 PostgreSQL 整链验证合并前，`000310` 只是 fail-closed primitive，不宣称事实装载完成。

本切片不执行真实生产连接、不读取人员值、不提高兼容积分，也不宣称生产历史导入完成。
