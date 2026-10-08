# 设计

新 GET training employee-options 与对应 DTO 遵循已验证的小页、严格标量数字、参数化搜索、metadata audit；服务端候选权限保持当前 planOptions 的精确 PLAN_MANAGE，而非新添加 READ。候选仅最小 id/code/name，完整 count/稳定排序和作用域校验。兼容既有plan-options；页面仍加载课程，不受独立候选故障影响。触控复选列表+已选清单+移除，隐藏表单 employeeIds/name employees 保持原 createPlan FormData 契约。限定最多500个唯一 id，不能用第一页候选替换全部选中。受控或显式submit事件保留失败草稿，账号完整上下文切换 reset。

离职 PR877 正在独立 checkout 发布；本工作区已同步main6985319d6（PR877合并），只实施培训文件。最终验证/提交前同步最新已合并main，并检查共用hr-api/css/spec中的离职改动，不可覆写。
