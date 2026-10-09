# 已批准奖惩追加更正

## 1. Scope / Trigger
现代奖惩详情对正式已批准事项追加业务更正；历史来源不影响操作资格。

## 2. Signatures
`hrApi.appendRewardCorrection(id,{type:"correction",summary,reason},token,key)` 调用既有 POST cases/:id/corrections。`RewardCorrections` 复用父 workspace mutation lock。

## 3. Contracts
只在 approved+MANAGE 显示填写表单；READ/TEAM/SELF 不自动获得写权。后端终态、scope、MANAGE 和 FOR UPDATE 保持权威。历史仅显示详情接口已授权的 corrections 摘要，不读取/暴露原因；未返回历史不等于空历史。更正保留原审批、制度、证据。摘要300/原因1000，前端不得空白。
未知保存结果保留草稿、请求体及幂等键；内容变化阻止重发。确定400/403/404/422后允许新内容新键。同步防双击；确认响应后立即显示已保存，读取失败单独警告，读取重试不重发POST。身份/园区切换卸载旧组件，旧响应不发布不读取。完整历史采用既有无分页服务响应；不截断数组。

## 4. Validation & Error Matrix
非批准/无manage无表单；未知失败相同key重试；非法response不确认；空白阻止；保存成功+读取失败仍显示保存成功；坏历史局部错误；无投影显示权限提示。

## 5. Cases
Good: 原记录保留、下一条更正独立编号。Base: 只读HR查看服务端返回摘要。Bad: 为员工申诉推测本人关系、修改原已批准事项、失败清空草稿、读失败再次写入。

## 6. Tests Required
实际父页面和局部组件覆盖权限、状态、稳定key、失败草稿、并发、刷新失败、身份替换。adapter route/body/key。Web typecheck/lint/HR/build；桌面和390px DS卡片及44px按钮。

## 7. Wrong vs Correct
Wrong: `rewardCaseAction(id,"approve")` 重走审批或 PUT 原记录。
Correct: 独立幂等 corrections POST，已确认后独立重读详情。
