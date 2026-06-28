import { Drawer, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader } from "@jinhu/ui";
import { X } from "lucide-react";
import type { FormEvent } from "react";
import { getTransitionOptions } from "../lib/unit-page-utils";
import type { DictItemRow, UnitRow, UnitStatusLogPage, UnitStatusPanelMode } from "../types";
import { DictBadge, DictSelect, TextField } from "./UnitPageFields";
import { UnitStatusLogsPanel } from "./UnitStatusLogsPanel";

export function UnitStatusDrawer({
  unit,
  panelMode,
  dicts,
  canChangeStatus,
  canForceChangeStatus,
  transitionStatus,
  transitionReason,
  transitionLockReason,
  transitionLockExpireTime,
  statusLogPage,
  onClose,
  onSubmit,
  onTransitionStatusChange,
  onTransitionReasonChange,
  onTransitionLockReasonChange,
  onTransitionLockExpireTimeChange,
  onStatusLogPageChange
}: {
  unit: UnitRow;
  panelMode: UnitStatusPanelMode;
  dicts: Record<string, DictItemRow[]>;
  canChangeStatus: boolean;
  canForceChangeStatus: boolean;
  transitionStatus: string;
  transitionReason: string;
  transitionLockReason: string;
  transitionLockExpireTime: string;
  statusLogPage: UnitStatusLogPage;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTransitionStatusChange: (value: string) => void;
  onTransitionReasonChange: (value: string) => void;
  onTransitionLockReasonChange: (value: string) => void;
  onTransitionLockExpireTimeChange: (value: string) => void;
  onStatusLogPageChange: (page: number) => void;
}) {
  return (
    <Drawer size="md" onClose={onClose}>
      <DrawerHeader
        eyebrow="资产空间"
        title={`${unit.unitName} ${panelMode === "change" ? "状态流转" : "状态日志"}`}
        description="管理房源出租状态的流转与历史记录。"
        onClose={onClose}
        closeIcon={<X size={18} />}
      />
      <div className="task-item">
        <span>当前状态</span>
        <strong><DictBadge items={dicts.unit_rental_status} value={unit.rentalStatus} /></strong>
      </div>
      {canChangeStatus && panelMode === "change" ? (
        <DrawerForm onSubmit={onSubmit}>
          <DrawerFormGrid>
            <DictSelect
              label="目标状态"
              value={transitionStatus}
              required
              items={getTransitionOptions(unit.rentalStatus, dicts.unit_rental_status, canForceChangeStatus)}
              onChange={onTransitionStatusChange}
            />
            <TextField label="流转原因" value={transitionReason} required onChange={onTransitionReasonChange} />
            {Number(transitionStatus) === 20 ? (
              <>
                <TextField label="锁定原因" value={transitionLockReason} onChange={onTransitionLockReasonChange} />
                <div className="field">
                  <label>锁定到期时间</label>
                  <input type="datetime-local" value={transitionLockExpireTime} onChange={(event) => onTransitionLockExpireTimeChange(event.target.value)} />
                </div>
              </>
            ) : null}
          </DrawerFormGrid>
          <DrawerFooter>
            <button className="secondary-button" type="button" onClick={onClose}>取消</button>
            <button className="primary-button" type="submit" disabled={!transitionStatus}>确认流转</button>
          </DrawerFooter>
        </DrawerForm>
      ) : null}
      <UnitStatusLogsPanel
        statusLogPage={statusLogPage}
        dicts={dicts}
        onPageChange={onStatusLogPageChange}
      />
    </Drawer>
  );
}
