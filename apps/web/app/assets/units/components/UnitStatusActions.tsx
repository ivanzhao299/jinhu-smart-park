import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { History, RefreshCw } from "lucide-react";
import { PermissionButton } from "../../../../components/auth/PermissionButton";

export function UnitStatusActions({
  variant = "table",
  onOpenTransition,
  onOpenStatusLogs
}: {
  variant?: "table" | "drawer";
  onOpenTransition: () => void;
  onOpenStatusLogs: () => void;
}) {
  const transitionClassName = variant === "drawer" ? "drawer-action-button" : "ds-row-action ds-row-action-status";
  const logClassName = variant === "drawer" ? "drawer-action-button" : "ds-row-action ds-row-action-history";
  const iconSize = variant === "drawer" ? 14 : 20;

  return (
    <>
      <PermissionButton aria-label="状态流转" className={transitionClassName} permission={SYSTEM_PERMISSIONS.UNIT_CHANGE_STATUS} title={variant === "table" ? "状态流转" : undefined} type="button" onClick={onOpenTransition}>
        <RefreshCw size={iconSize} />{variant === "drawer" ? "状态流转" : <span className="ds-row-action-label">流转</span>}
      </PermissionButton>
      <PermissionButton aria-label="状态日志" className={logClassName} permission={SYSTEM_PERMISSIONS.UNIT_STATUS_LOG} title={variant === "table" ? "状态日志" : undefined} type="button" onClick={onOpenStatusLogs}>
        <History size={iconSize} />{variant === "drawer" ? "状态日志" : <span className="ds-row-action-label">日志</span>}
      </PermissionButton>
    </>
  );
}
