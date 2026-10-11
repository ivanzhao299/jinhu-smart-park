# 来源与当前生产依据

- 源证据：只读恢复 SQL Server atomic-columns.json；SHA256 d72afe42ce266abeaf2768c4050ae51728d2e5e826e2fb963601fe98835a25d5. 2026-10-02 retained catalog，非实时业务界面或计算规则证据。
- dbo.overtime: id/person/starttime/endtime/recdate/operator/memo。起止时间可空，没有独立计薪数量字段。
- dbo.errand: id/person/startdate/enddate/days/pay/description/recdate/operator。days nullable int；pay nullable money(19,4)，其业务含义未证明。当前正式请求已承载 declared_days，尚无独立 pay 正式字段。
- 原 u_errandrecords 六字段投影不包含 pay，不能据此宣称全部源字段已承载。
- 原请假内核 approvedLeaveMinutesForWindow 依赖保存班表区间，合并后按分钟向下截断；保持现有请假合同。
- 当前工资考勤字段仅工作/迟到/早退分钟、缺勤/缺卡天数、批准请假分钟；未接入本任务新数量。
- 生产只读观察38176203422：7月93记录、64不同员工、2295项目；账套34共54记录，账套35共39记录，跨账套重叠29员工，保留全部93。有效封账考勤/社保输入、批准试算公式、正式试算均为0。实际金额试算 NOT_EXECUTED。
