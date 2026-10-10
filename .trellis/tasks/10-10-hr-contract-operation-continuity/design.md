# 设计

hr.controller35–40已对六合同写入口使用IdempotencyInterceptor；hr-api470–475每次调用新key，页面未保留操作尝试。contract-ledger mutate写成功后刷新失败会提前返回而不显示成功。延续现有业务内核，adapter新增可选稳定key兼容既有调用，页面绑定body/route/context的重试尝试；ledger保留已写成功证据并单独呈现刷新状态，避免仅改变文案或用新写重试回读。

完整读取受影响组件/ledger和相关规范；处理同步双击、过期回执、表单在途改动、actor/选择变化、成功后失败刷新以及缺少ID回执的情况。合同事实与版本由服务端权威校验；不得新增签署动作或绕过权限。共享CSS仅必要布局，不影响其他HR页面。
