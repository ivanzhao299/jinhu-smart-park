import { DrawerDetailGrid, DrawerDetailItem } from "@jinhu/ui";
import type { DictItemRow, WorkOrderRow } from "../types";
import { formatDateTime, labelFor } from "../lib/workorder-page-utils";
import { WorkOrderPriorityBadge } from "./WorkOrderPriorityBadge";
import { WorkOrderStatusBadge } from "./WorkOrderStatusBadge";

interface WorkOrderDetailSummaryProps {
  detail: WorkOrderRow;
  typeItems: DictItemRow[];
  priorityItems: DictItemRow[];
  statusItems: DictItemRow[];
  reporterMobileText: string;
  evaluationText: string;
  descriptionText: string;
}

export function WorkOrderDetailSummary({
  detail,
  typeItems,
  priorityItems,
  statusItems,
  reporterMobileText,
  evaluationText,
  descriptionText
}: WorkOrderDetailSummaryProps) {
  return (
    <DrawerDetailGrid>
      <DrawerDetailItem label="工单编号" value={detail.woCode} />
      <DrawerDetailItem label="类型" value={labelFor(typeItems, detail.woType)} />
      <DrawerDetailItem label="优先级" value={<WorkOrderPriorityBadge items={priorityItems} value={detail.priority} />} />
      <DrawerDetailItem label="状态" value={<WorkOrderStatusBadge items={statusItems} value={detail.status} />} />
      <DrawerDetailItem label="租户企业" value={detail.parkTenant?.companyName ?? "-"} />
      <DrawerDetailItem label="房源" value={detail.unit ? `${detail.unit.unitCode} ${detail.unit.unitName}` : "-"} />
      <DrawerDetailItem label="位置" value={detail.location ?? detail.roomLabel ?? "-"} />
      <DrawerDetailItem label="报告人" value={detail.reporterName ?? "-"} />
      <DrawerDetailItem label="报告电话" value={reporterMobileText} />
      <DrawerDetailItem label="处理人" value={detail.assigneeName ?? "-"} />
      <DrawerDetailItem label="是否超时" value={detail.overdueFlag ? "超时" : "正常"} />
      <DrawerDetailItem label="接单时间" value={formatDateTime(detail.acceptTime)} />
      <DrawerDetailItem label="开始处理" value={formatDateTime(detail.startTime)} />
      <DrawerDetailItem label="待物料时间" value={formatDateTime(detail.waitMaterialTime)} />
      <DrawerDetailItem label="完成时间" value={formatDateTime(detail.finishTime)} />
      <DrawerDetailItem label="确认时间" value={formatDateTime(detail.confirmTime)} />
      <DrawerDetailItem label="关闭时间" value={formatDateTime(detail.closeTime)} />
      <DrawerDetailItem label="创建时间" value={formatDateTime(detail.createTime)} />
      <DrawerDetailItem label="处理说明" value={detail.resolveNote ?? "-"} />
      <DrawerDetailItem label="满意度" value={detail.satisfaction ? `${detail.satisfaction} / 5` : "-"} />
      <DrawerDetailItem label="评价" value={evaluationText} />
      <DrawerDetailItem label="问题描述" value={descriptionText} />
      <DrawerDetailItem label="备注" value={detail.remark ?? "-"} />
    </DrawerDetailGrid>
  );
}
