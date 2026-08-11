# 实施计划

## 1. API 授权与数据范围

- [x] 组织树传 actor 并复用 org data-scope predicate。
- [x] `org_and_children` 仅采用递归验证结果。
- [x] 补组织树和失效根单测。

## 2. 组织写入与目录

- [x] 同园区组织层级写入增加 transaction advisory lock。
- [x] 组织删除忽略软删用户历史关系。
- [x] 负责人候选移除静默截断。
- [x] 补并发/删除/候选回归。

## 3. 用户原子创建与跨园区隔离

- [x] CreateUserDto 接受可选 assignments。
- [x] 创建用户、园区关系、组织关系纳入同一事务。
- [x] 替换关系软删条件加入目标 tenant/park。
- [x] 补失败回滚和跨园区保留测试。

## 4. Web

- [x] 新建用户初始请求内提交 assignments，编辑保留关系替换请求。
- [x] 组织目录请求增加 generation 防旧响应覆盖。
- [x] 更新系统页面 source-contract/逻辑测试。

## 5. 验证与审查闭环

- [x] API/Web 目标单测。
- [x] API/Web lint、typecheck、build。
- [x] 组织专项 E2E 与完整 first-release regression。
- [ ] 提交、推送，逐线程回复/解决并对最新 head 重新请求 Codex review。
- [ ] 最新 CI、Release Smoke、Codex review、线程和可合并状态全部通过后合并。

## 6. 第二轮 Codex Review

- [x] 新建/编辑抽屉在登录设置 await 后再次校验组织目录 generation。
- [x] 新增按目标租户/园区解析的创建候选目录 API。
- [x] 创建与替换关系复用组织层级园区 advisory lock。
- [x] 并发关系替换回归验证不产生关系并集。
- [x] bootstrap-admin 保留既有非根主组织并补契约测试。
- [x] 完整质量门、数据库实跑与 bootstrap 重跑验证。
- [ ] 回复并解决第二轮 5 个线程，重新请求最新 head Codex review。

## 7. 第三轮 Codex Review

- [x] 迁移清理用户迁租后遗留的跨租户活动组织关系，同时保留同租户次园区关系。
- [x] 组织删除只统计仍属于目标租户的活动用户关系。
- [x] 用户角色与角色数据范围按当前园区收敛，防止跨园区旧绑定扩大权限。
- [x] Web 将不可见的非空上级标记为不可见，不再误显示为根组织。
- [x] 用户关系编辑器支持显式清空主组织且保留其他关系。
- [x] API/Web 全量质量门与独立 PostgreSQL 完整迁移实跑通过。
- [ ] 回复并解决第三轮 4 个线程，重新请求最新 head Codex review。
