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
