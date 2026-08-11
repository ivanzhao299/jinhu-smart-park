## Bug Analysis: 民宿运营台流程完整性与目标状态所有权

### 1. Root Cause Category

- **Category**: D - Test Coverage Gap; E - Implicit Assumption; C - Change Propagation Failure
- **Specific Cause**: 前几轮验证以已呈现流程和单个 Review 行为为中心，没有建立“后台 MVP 端点必须存在 Web 消费者”的端点—页面矩阵，也没有完整枚举订单目标切换时的所有可提交草稿。两个表单还因共用同一候选端点而错误共用分页状态；附件动作则把列表快照误当成当前文件关联。

### 2. Why Fixes Failed

1. **Surface Fix**: 上一轮分离了列表、详情、错误和价格目标，却只处理了 Review 已点名的状态，没有审计住客、财务、改期和日期覆盖价的完整兄弟流程。
2. **Incomplete Scope**: “选中订单独立于分页”被误当成完成状态所有权，遗漏了挂在订单下的可提交草稿。
3. **Mental Model**: 把共享候选 API 等同于共享 UI 状态，把任务 JSON 中的附件 ID 等同于附件服务的实时关联。
4. **Test Gap**: 单元与构建测试能发现类型和静态调用错误，但没有覆盖双击、模糊失败重试、切换目标、独立分页、只读不下载权限和附件删除后的动作组合。

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | 价格与预订候选分页、数组和选择分别持有 | DONE |
| P0 | Runtime | 价格、覆盖价、预订创建和住客登记使用同步锁及稳定重试键 | DONE |
| P0 | State ownership | 订单 ID 改变时统一重置住客、凭证、财务、终止和改期草稿 | DONE |
| P0 | Workflow parity | 补齐日期覆盖价、订单改期和实名住客名单 Web 流程 | DONE |
| P0 | Attachment lifecycle | 保洁动作发送空 ID 列表，由后端重新派生有效关联 | DONE |
| P1 | Permission boundary | `file:read` 与 `file:download` 分离，禁止无下载权限的缩略图副作用 | DONE |
| P1 | Test coverage | 增加端点消费者、分页隔离、提交锁、草稿重置、住客名单和附件权限断言 | DONE |
| P1 | Documentation | 更新房产业务、文件控件和跨层检查规范 | DONE |

### 4. Systematic Expansion

- **Similar Issues**: 其他同时使用候选列表的表单、所有选择详情后挂载的财务/附件/审批草稿、所有 compact 附件列表、所有带幂等拦截器的前端写操作。
- **Design Improvement**: UI 状态按“服务端投影、目标绑定草稿、提交事务、候选分页、权限能力”分区；共享端点不自动意味着共享状态。
- **Process Improvement**: 每次申请 Review 前输出后端 MVP 端点—Web 调用矩阵和写操作幂等矩阵，逐项确认桌面与 390px 入口。

### 5. Knowledge Capture

- [x] 更新 `.trellis/spec/api/backend/property-business-controls.md`
- [x] 更新 `.trellis/spec/web/frontend/file-upload-and-form-controls.md`
- [x] 更新 `.trellis/spec/guides/cross-layer-thinking-guide.md`
- [x] 增加本轮前端回归断言
- [x] 检查模板同步路径；本仓库不存在 `src/templates/markdown/spec/`，无需同步
