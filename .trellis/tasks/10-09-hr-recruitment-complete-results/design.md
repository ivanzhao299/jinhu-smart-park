# 设计
复用 onboardingApplications 分页和status参数，固定entryType=initial。新page/total/status仅属于入职列表。现有generation+AbortSignal保持请求代际；Promise.allSettled分别处理三个列表结果，单域错误不冻结其他域。超出入职最后一页时重载可达末页。身份上下文key remount清空所有本地状态。

领域记录列表CSS显式display:grid覆盖ds-mobile-record-list桌面默认隐藏，仅增加分页最小高度及不拆字布局。保留所有写入API、审批权限和原状态链。无数据库变化。
