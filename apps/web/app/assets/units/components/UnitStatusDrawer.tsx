import { Drawer } from "@jinhu/ui";
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
      <div className="task-item">
        <h2 className="panel-title">{unit.unitName} {panelMode === "change" ? "状态流转" : "状态日志"}</h2>
        <button className="drawer-close-button" type="button" title="关闭" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="task-item">
        <span>当前状态</span>
        <strong><DictBadge items={dicts.unit_rental_status} value={unit.rentalStatus} /></strong>
      </div>
      {canChangeStatus && panelMode === "change" ? (
        <form className="form-stack" onSubmit={onSubmit}>
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
          <button className="primary-button" type="submit" disabled={!transitionStatus}>确认流转</button>
        </form>
      ) : null}
      <UnitStatusLogsPanel
        statusLogPage={statusLogPage}
        dicts={dicts}
        onPageChange={onStatusLogPageChange}
      />
    </Drawer>
  );
}
