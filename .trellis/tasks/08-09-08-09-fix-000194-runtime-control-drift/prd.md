# 修复 000194 runtime-control 生产漂移

## Goal

修复生产部署 run 31286011713 在 `000194_property_task_projection_contract_correction.sql`
暴露的 runtime-control scope exact-set 漂移，并把同一判定前移到只读诊断、部署前门禁和
生产形态 Release Smoke，避免再次在服务构建/重启后才发现迁移数据前提不满足。

## Requirements

- 保持生产已成功的 `000001` 至 `000193` migration 及已成功的 prerequisite 字节不变。
- 保持失败且事务已回滚的 `000194_property_task_projection_contract_correction.sql` 字节不变，
  通过新增、独立记历史的 ordered prerequisite 收敛缺失的 signed runtime controls。
- prerequisite 只能为每个有效 active asset assignment scope 插入缺失的 12 个固定 disabled
  controls；不得启用控制、修改已有控制、删除额外控制、猜测 scope，且遇到已有定义漂移或
  exact-set 额外项必须 fail closed。
- 新增只读诊断必须输出 scope、expected/actual/missing/extra/definition-drift 聚合计数和非敏感
  control key 分类，不得输出凭据、个人数据或执行写入。
- API/full 部署在 release marker、源码同步、migration、seed、image build 前必须同时通过
  `000189` asset scope parity 与 `000194` runtime-control parity；诊断模式不得部署或写库。
- Release Smoke 必须真实回放“生产已有 active asset assignment、runtime-control 表由 schema-only
  prerequisite 创建但 12 个 rows 全缺失”的失败历史，并证明新 prerequisite 后 unchanged 000194 成功。
- 覆盖额外 control、错误定义、非默认 scope、重复运行和 failed-history checksum retry，防止门禁与
  prerequisite 判定漂移。
- 同步 migration prerequisite 合同、部署/发布文档和 Trellis 运维规范。
- 自动回滚仍不得运行旧源码的 migration/seed；不自动部署或合并。

## Acceptance Criteria

- [x] 新 prerequisite 对合法 scope 补齐恰好 12 个 signed disabled controls，重复执行无写入。
- [x] 已有正确行保持不变；额外 key、错误 kind/target/adapter/hash/mode/state 均 fail closed。
- [x] unchanged `000194` 在生产同形缺失集合 fixture 上成功并生成完整 correction audit。
- [x] 只读诊断与 prerequisite 对 missing/extra/definition drift 给出一致分类。
- [x] API/full 部署在任何发布副作用前阻断 runtime-control drift；diagnose-only 保持只读。
- [ ] 静态合同、真实 PostgreSQL replay、Release Smoke、shell/YAML/diff 门禁通过。
- [ ] 生产诊断确认实际 drift 分类；修复合并后由人工重试部署。
- [ ] 提交、推送、创建 Draft PR 并完成最新 head Codex review 闭环；不自动部署或合并。
