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
  const className = variant === "drawer" ? "drawer-action-button" : undefined;
  const iconSize = variant === "drawer" ? 14 : 16;

  return (
    <>
      <PermissionButton className={className} permission={SYSTEM_PERMISSIONS.UNIT_CHANGE_STATUS} title={variant === "table" ? "状态流转" : undefined} type="button" onClick={onOpenTransition}>
        <RefreshCw size={iconSize} />{variant === "drawer" ? "状态流转" : null}
      </PermissionButton>
      <PermissionButton className={className} permission={SYSTEM_PERMISSIONS.UNIT_STATUS_LOG} title={variant === "table" ? "状态日志" : undefined} type="button" onClick={onOpenStatusLogs}>
        <History size={iconSize} />{variant === "drawer" ? "状态日志" : null}
      </PermissionButton>
    </>
  );
}
