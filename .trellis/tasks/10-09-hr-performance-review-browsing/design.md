# 设计

新增GET performance-v2/review-page，扩展原查询DTO的页码/页容量。服务中抽取统一授权条件和评价查询，旧reviews继续数组契约；新页在REPEATABLE READ只读快照中统计并限量投影，统计只含总数/待办/已确认。复用原projection和required read audit，不能以筛选扩权。动作历史按精确对象查可见性，避免读取全部评价。

工作台沿用身份key、读generation/Abort与原状态机，接入页响应。筛选/分页即时清旧数据并关闭旧目标，控件共享busy。读取失败可重试，成功写入后刷新失败保留成功事实。只添加领域布局CSS，不复制按钮主题。保留cycles、模板及校准现有契约；本切片只限量评价，不宣称所有配置列表已分页。

无DDL；回退应用即可。原reviews兼容现有消费者和测试。
