# Bug Analysis: 超级管理员被普通多租户歧义阻断

## 1. Root Cause Category

- **Category**: E — Implicit Assumption；同时存在 D — Test Coverage Gap。
- **Specific Cause**: 无 scope 登录默认把所有同用户名、同密码的有效账号视为同类租户身份，并在授权角色语义解析前按 tenantId 拒绝；测试只覆盖普通跨租户账号与同租户多园区选择，没有覆盖“唯一平台超级管理员 + 同名普通租户账号”。

## 2. Why The Earlier Fix Did Not Cover It

上一轮 #217 聚焦套餐候选与写入解析一致性，没有把“开通租户后可能新增同名管理员账号”扩展到认证候选歧义。表单问题修复后，复测继续向下走才暴露登录层组合场景。

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | 候选选择与 token 签发共用同一个有效角色/权限解析函数 | DONE |
| P0 | Test Coverage | 增加唯一超级、零超级、多个超级及普通上下文矩阵 | DONE |
| P1 | Documentation | 在 API 认证规范记录认证后角色选择及禁止用户名特判 | DONE |
| P1 | Code Review | 修改租户开户或登录候选逻辑时检查同名账号组合场景 | DONE |

## 4. Systematic Expansion

- **Similar Issues**: 密码上下文选择是唯一无 scope 多候选入口；短信登录显式要求 tenant/park，不存在相同歧义路径。
- **Design Improvement**: 超级身份必须来自有效角色/权限而不是用户名，并且只在密码、锁定、删除和启用检查后参与候选收窄。
- **Process Improvement**: 租户开户新增账号能力与认证候选必须做组合回归，不能只分别验证表单和登录 happy path。

## 5. Knowledge Capture

- [x] 更新 `.trellis/spec/api/backend/index.md`。
- [x] 添加认证行为回归测试。
- [x] 任务设计记录无租户数据库重构不在本次范围。
- [x] 本仓库没有 Trellis 源码模板目录，项目级规范无需同步模板副本。
