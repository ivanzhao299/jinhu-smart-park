# 玉舟个人通讯录兼容闭环：实施计划

## 0. Before implementation

- [ ] 重新 fetch，确认候选/远端/运行版本并保护所有工作树。
- [ ] 读取 HR API、Web、共享权限、跨层与复用规范；确认没有可复用且语义相同的目标领域模型。
- [ ] 以只读受控源分别完成客户端和 Group Web 的页面/字段/动作/角色采集，并生成差异矩阵和 M 字典包。
- [ ] 将 Group Web `legacyId=301` 映射状态保留为 `mapped`，直至实际实现和验证完成。

## 1. Domain and security contract

- [ ] 设计前向数据库迁移、实体/DTO、最小字段策略和批次 record map；不编辑既有迁移。
- [ ] 增加共享页面/动作/数据/字段权限和角色模板接线。
- [ ] 实现服务层 tenant/park、owner、状态、并发、幂等、审计和归档控制。
- [ ] 为控制器添加受保护 API、权限与审计元数据。

## 2. Web and compatibility mapping

- [ ] 增加 HR 菜单、路由与桌面/390px 视图，复用全局设计系统。
- [ ] 实现加载、空态、越权、冲突、深链和恢复行为。
- [ ] 更新客户端/Web → 字段/规则 → 迁移/API/RBAC/UI/测试映射及覆盖率统计。

## 3. Validation

- [ ] 单元、控制器/权限、跨 tenant/park、字段投影、幂等/并发、归档、审计和迁移合同测试。
- [ ] Shared build、API/Web typecheck、lint、build、受影响 E2E。
- [ ] 三角色 API、桌面与 390px 技术 UAT；不以管理员视图代替普通用户。
- [ ] 在当前 C/S/M 上完成串行隔离 A、逆序回滚零残留、独立 B、比例/守恒与技术 UAT。

## 4. Release and rollback

- [ ] 通过 PR、CI、合并、分类部署，验证候选=main=runtime、health/ready、受保护账号与 Docker cleanup。
- [ ] 更新当前生产门禁差距。历史导入始终 `HOLD`，直至所有独立生产证据与授权有效。
