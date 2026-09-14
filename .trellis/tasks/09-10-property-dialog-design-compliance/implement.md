## 实施进度
- [x] G1/G2产品修复与代表浏览器/真实API验收
- [x] D11基线对照：既有风险，未修改Drawer
- [ ] PR必要门禁 / squash merge / 精确main CI / 自动Deploy清理 / 归档

## 2026-09-10 已批准审核决定（优先于下方历史规划）

主助手已实际复核报告、CSS/Parts 和 primary-390.png，批准 G1+G2：D01/D02/D03/D05/D06。保留 native dialog/showModal、closed 隐藏、锁/幂等指纹/API/payload/权限/审批和金融语义；原因 trim 2–500，民宿未到店/遗失 busy/error 接入，占用释放局部错误+false。
G3 不批准：保留取消清空原因契约，失败保留有效输入，取消不重置 caller 原表单。G4/G5 不批准额外确认或 leasing 批量迁移，登记为非违规建议，不算漏项。D11 必做代表回归，仅证实与本共享改动相关回归时最小修复留证；D12 不改。
授权激活、正常分支实现、Issue/PR、必要 PR CI/Release Smoke 全通过后 squash merge；核验精确 main SHA 的 CI/自动 Deploy 与清理后归档。禁止豁免、force push、手动生产操作或修改他人环境。
验收必须分开 mock 前端与隔离真实 API/DB：原路径唯一申请回读、执行前配置未变，以及修改 caller 代表失败/成功；1440/390、焦点/Escape/busy/回焦、短屏/200% 重排、复杂长内容及可构造错误分级。必要验收受阻保持未闭环。
Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/732
基线核对：HEAD = fetched origin/main = 563af3a1890b89166f664dd5427e47267ae90b7e；本 worktree 仅既有专项未跟踪工件；COST_GUARD 延续，未重扫145文件。

# 实施计划（未激活）

主助手复核前禁止执行下列产品变更。当前status=planning，未运行task.py start。

## Review gate
- [ ] 主助手复核报告、G1/G2缺陷与证据，明确G3/G4/G5批准范围。
- [ ] 明确取消留稿的作用域、初始焦点、独立真实后端验收环境。
- [ ] 检查该worktree独占、基线漂移与现有任务；若需rebase另行保存本报告固定SHA证据。
- [ ] 复核通过后才激活task，不自动提交或合并报告。

## 有序执行
1. G1共享ConsequenceDialog布局/字段/错误/action区最小修改，保留native dialog隐藏及键盘契约。
2. G2模式原因500上限、民宿busy/error传递、占用释放modal-local错误/false；不改请求语义。
3. 经批准才做G3受控留稿兼容，不改变未迁移caller默认行为。
4. 经批准按G4/G5迁移高风险页内动作/原生意见；保持字段及权限，独立证实嵌套风险。
5. 按整个已批准范围验证、审查产品diff，不只测最后一组。

## 定向验证命令
在apps/web：
```sh
NODE_ENV=test TS_NODE_TRANSPILE_ONLY=true TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node","jsx":"react-jsx"}' node --test --require ts-node/register features/property-shared/dialog/dialog-state.spec.ts features/property-shared/dialog/dialog-contract.spec.ts features/property-shared/dialog/consequence-actions-adoption.spec.ts
```
修复后从仓库根运行：
```sh
pnpm --filter @jinhu/web typecheck
pnpm --filter @jinhu/web lint
pnpm --filter @jinhu/web build
pnpm --filter @jinhu/web test:unit:interaction -- consequence-dialog
```
共享UI包若确实变更再运行该包typecheck。追加测试必须验证行为：closed hidden、取消留稿隔离、失败局部错误、busy双击、初始/循环/回归焦点、长文本/390px、嵌套topmost Escape；不以正则存在性替代运行测试。

## 浏览器与真实业务验收
- 原路径完整列表→详情→选择模式→提交；桌面/390px均测空白/1/2/500/501字符、取消、Escape、错误、重试成功、刷新失败。
- 民宿未到店/遗失及入住退房；housing租约/财务/采购；共享占用；纳入的leasing审批及父Drawer嵌套。
- 短高度/长页/长对象名与ID/手机软键盘/200%重排；modal内部滚动不带动背景，footer和取消可达。
- 单独标注mock API证据；在本任务disposable环境补真实批准/执行、版本冲突、无权限、重复请求与金融/占用不变量证据。不得借他人容器/生产数据。

## 收尾
- [ ] 更新报告矩阵中的每项结果和证据路径，记录跳过及原因，消除主要缺口后再宣称修复闭环。
- [ ] 复核对API/权限/审批/金融没有漂移，必要规范更新随批准后的改动。
- [ ] 提交/合并按后续明确指令，本planning交付不自动执行。
