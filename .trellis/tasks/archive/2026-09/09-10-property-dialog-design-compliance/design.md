## 2026-09-10 已批准审核决定（优先于下方历史规划）

主助手已实际复核报告、CSS/Parts 和 primary-390.png，批准 G1+G2：D01/D02/D03/D05/D06。保留 native dialog/showModal、closed 隐藏、锁/幂等指纹/API/payload/权限/审批和金融语义；原因 trim 2–500，民宿未到店/遗失 busy/error 接入，占用释放局部错误+false。
G3 不批准：保留取消清空原因契约，失败保留有效输入，取消不重置 caller 原表单。G4/G5 不批准额外确认或 leasing 批量迁移，登记为非违规建议，不算漏项。D11 必做代表回归，仅证实与本共享改动相关回归时最小修复留证；D12 不改。
授权激活、正常分支实现、Issue/PR、必要 PR CI/Release Smoke 全通过后 squash merge；核验精确 main SHA 的 CI/自动 Deploy 与清理后归档。禁止豁免、force push、手动生产操作或修改他人环境。
验收必须分开 mock 前端与隔离真实 API/DB：原路径唯一申请回读、执行前配置未变，以及修改 caller 代表失败/成功；1440/390、焦点/Escape/busy/回焦、短屏/200% 重排、复杂长内容及可构造错误分级。必要验收受阻保持未闭环。
Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/732
基线核对：HEAD = fetched origin/main = 563af3a1890b89166f664dd5427e47267ae90b7e；本 worktree 仅既有专项未跟踪工件；COST_GUARD 延续，未重扫145文件。

# 技术方案（待主助手复核）

基线：563af3a1890b89166f664dd5427e47267ae90b7e。唯一发现矩阵见 `docs/reviews/property-dialog-design-compliance-audit-2026-09-10.md`，本文件只记录方案边界。

## 现状与边界
用户路径：列表Link→详情页内目标模式选择→ConsequenceDialog原因/确认→POST mode-transitions→后端冻结审批→关闭并刷新。没有前端审批配置/预览。
通用展示留在property-shared；领域caller持有草稿、对象、权限、payload、key、错误；packages/ui保持纯展示，不调用业务API。

## 最小设计
- G1：在现有ConsequenceDialog及Parts/CSS补完整共享表面；保留native showModal、top layer、Tab/Escape/focus逻辑。局部声明居中、安全间距、可滚动内容和操作区、文本token与长文本换行；使用form-field、ds-field-error和共用action布局。禁止修改全局reset，不引入新Modal框架。
- 新布局不能覆盖closed dialog的隐藏语义；不得用无条件display:grid暴露关闭框。
- G2：模式切换reasonPolicy加500上限；民宿StayActions传busy/error；占用释放失败返回false并绑定当前框错误。保留现有同步锁与key策略，busy防二次提交和关闭。
- G3建议：ConsequenceDialog提供可选受控reason接口，caller按对象+动作+版本存临时草稿。默认关闭清稿保持兼容；经复核选定流程取消退出确认但不清原表单，成功/换对象清空。避免将stable target id伪造为复合业务标识。
- G4：需审核是否为页内高风险动作增加后果确认；普通登记保留单步。只显示现有可读对象和当前→申请后状态，不能推断审批人/冻结阶段。
- G5：迁移leasing审批意见prompt时保留opinion/reject_reason等独立字段。先证明嵌套Escape问题再协调关闭；不直接修改所有Drawer消费者。

## 数据和状态约束
提交前完整校验；同步single-flight；同payload失败重试沿用原实现key；payload变化按原策略换key。版本、权限、allowedActions及金融条件仍由原caller/API决定。
失败→modal-local alert+保留输入+false；成功→清草稿/关闭+页面成功状态；刷新失败单独提示。旧请求结果不能关闭另一对象/动作。
取消留稿仅影响本地临时状态，不增加离线持久化或接口参数。真正业务状态仅取服务端返回/回读。

## 兼容和风险
共享CSS影响至少原路径、民宿入住/退房/未到店/遗失、housing租约/财务/采购和leasing结算/生效；逐代表回归。
native dialog是正确基础，不能因为默认样式异常就换成不带focus/top-layer的自绘div。Drawer目前document级Escape监听有嵌套风险，作为实测待决项。
现有关闭清空测试不能删除换绿；为受控/opt-in模式新增独立契约，保留默认行为。

## 验收/回滚
按照报告第7节矩阵；mock验证真实页面交互，真实后端验证审批/金融语义。无API、DB或部署变化。
按G1/G2/G3/G4/G5分组审查；若共享布局回归，只撤回对应本任务改动，禁止重置其他worktree或他人变更。
本轮没有产品diff可回滚，保留planning待复核。
