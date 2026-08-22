# Issue #273 住房报修任务槽与前端回归

## 目标
补齐 housing_repair 共享运行时任务槽，并以当前候选提交完成民宿/住房真实前端技术验收。

## 要求
- 先验证后端确实生成 housing_repair property task source。
- 接入 RuntimeSlots 并补 shared contract/static test。
- 回归所有 canonical workbench、详情、landing、菜单、上传、离线和错误态。
- 使用非超管角色覆盖正向、缺权、跨园区、模块禁用；desktop/390px、键盘、zoom/reflow。

## 验收
- housing_repair 出现在共享槽并正确深链，缺权时不可见。
- 页面无横向溢出和控制台错误；证据绑定 commit/环境。
- PR223 blocker 清零或明确转交环境负责人；不虚构真人签署。
- Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/273
