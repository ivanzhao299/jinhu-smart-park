# 测试反馈缺陷修复

## Goal

修复 `D:\lishuai\TempFiles\测试问题记录.xlsx` 中 10 条待处理测试反馈，并为每条反馈建立可独立审查、验证和回滚的分支与提交。

## Confirmed Facts

- 基线为用户批准时的当前 HEAD `696873a`。
- 当前工作区有其他未提交 Trellis 目录，修复必须通过独立 worktree 隔离。
- 10 条反馈分别对应表格序号 2、3、4、5、6、11、12、13、19、30。
- 每个子任务拥有一个独立 `fix/uat-*` 分支和一个独立提交。

## Requirements

- 不把多个反馈合并到同一修复分支。
- 每个分支只包含该反馈所需的代码和针对性测试。
- 前端变更遵循共享设计系统、文件上传基线和移动端基线。
- 不修改迁移、生产配置、财务规则或权限语义，除非该反馈明确要求。
- 每个分支至少运行类型检查或更窄的自动化验证；用户界面分支在可运行环境允许时检查桌面与 390px。

## Child Mapping

1. `07-30-building-delete-feedback`
2. `07-30-floor-edit-existing-plan`
3. `07-30-floor-plan-delete-state`
4. `07-30-upload-filename-encoding`
5. `07-30-floor-delete-feedback`
6. `07-30-contract-unit-link`
7. `07-30-contract-change-dicts`
8. `07-30-checkout-dicts`
9. `07-30-iot-alert-rule-device-crash`
10. `07-30-energy-adjustment-billing-item-picker`

## Acceptance Criteria

- [ ] 10 个子任务均有独立分支和提交。
- [ ] 每条反馈的根因、改动、验证结果可单独说明。
- [ ] 分支均从同一批准基线创建，不意外携带当前未提交目录。
- [ ] 不相关文件无改动，剩余风险与未执行验证有明确说明。

## Out of Scope

- 回写原始测试反馈表。
- 生产部署、生产数据修复和真人复验签署。
