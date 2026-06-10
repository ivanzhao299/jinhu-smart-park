import { Drawer, DrawerActions, DrawerFooter, DrawerHeader } from "@jinhu/ui";
import type { UserContext } from "@jinhu/shared";
import { X } from "lucide-react";
import type {
  DictItemRow,
  UnitAttachmentMode,
  UnitDevicesResponse,
  UnitEmergenciesResponse,
  UnitHazardsResponse,
  UnitRow,
  UnitWorkOrdersResponse,
  UnitWorkPermitsResponse
} from "../types";
import { UnitDetailSummary } from "./UnitDetailSummary";
import { UnitDeviceAlertsPanel, UnitDevicesPanel } from "./UnitIotPanel";
import { UnitRelatedWorkordersPanel } from "./UnitRelatedWorkordersPanel";
import { UnitEmergenciesPanel, UnitHazardsPanel, UnitWorkPermitsPanel } from "./UnitSecurityPanel";
import { UnitStatusActions } from "./UnitStatusActions";

export type UnitDetailTab = "info" | "workorders" | "hazards" | "emergencies" | "workPermits" | "devices" | "deviceAlerts";

export function UnitDetailDrawer({
  unit,
  dicts,
  activeTab,
  authUser,
  canViewRefPrice,
  canViewRemark,
  canViewPhotoUrls,
  canViewWorkOrderReporterMobile,
  workorders,
  workordersLoading,
  workordersError,
  hazards,
  hazardsLoading,
  hazardsError,
  emergencies,
  emergenciesLoading,
  emergenciesError,
  workPermits,
  workPermitsLoading,
  workPermitsError,
  devices,
  devicesLoading,
  devicesError,
  onTabChange,
  onClose,
  onOpenAttachments,
  onOpenTransition,
  onOpenStatusLogs
}: {
  unit: UnitRow;
  dicts: Record<string, DictItemRow[]>;
  activeTab: UnitDetailTab;
  authUser: UserContext | null;
  canViewRefPrice: boolean;
  canViewRemark: boolean;
  canViewPhotoUrls: boolean;
  canViewWorkOrderReporterMobile: boolean;
  workorders: UnitWorkOrdersResponse | null;
  workordersLoading: boolean;
  workordersError: string;
  hazards: UnitHazardsResponse | null;
  hazardsLoading: boolean;
  hazardsError: string;
  emergencies: UnitEmergenciesResponse | null;
  emergenciesLoading: boolean;
  emergenciesError: string;
  workPermits: UnitWorkPermitsResponse | null;
  workPermitsLoading: boolean;
  workPermitsError: string;
  devices: UnitDevicesResponse | null;
  devicesLoading: boolean;
  devicesError: string;
  onTabChange: (tab: UnitDetailTab) => void;
  onClose: () => void;
  onOpenAttachments: (mode: UnitAttachmentMode) => void;
  onOpenTransition: () => void;
  onOpenStatusLogs: () => void;
}) {
  return (
    <Drawer size="md" onClose={onClose}>
      <DrawerHeader
        eyebrow="房源详情"
        title={unit.unitName}
        description={`${unit.unitCode} · ${unit.building ? unit.building.buildingName : "未关联楼栋"} · ${unit.floor ? unit.floor.floorName : "未关联楼层"}`}
        onClose={onClose}
        closeIcon={<X size={18} />}
      />
      <DrawerActions>
        <UnitStatusActions
          variant="drawer"
          onOpenTransition={onOpenTransition}
          onOpenStatusLogs={onOpenStatusLogs}
        />
        {canViewPhotoUrls ? <button className="drawer-action-button" type="button" onClick={() => onOpenAttachments("photos")}>查看照片</button> : null}
        <button className="drawer-action-button" type="button" onClick={() => onOpenAttachments("floorplan")}>查看平面图</button>
      </DrawerActions>
      <div className="system-tabs">
        <button className={activeTab === "info" ? "primary-button" : undefined} type="button" onClick={() => onTabChange("info")}>基础信息</button>
        <button className={activeTab === "workorders" ? "primary-button" : undefined} type="button" onClick={() => onTabChange("workorders")}>关联工单</button>
        <button className={activeTab === "hazards" ? "primary-button" : undefined} type="button" onClick={() => onTabChange("hazards")}>安全隐患</button>
        <button className={activeTab === "emergencies" ? "primary-button" : undefined} type="button" onClick={() => onTabChange("emergencies")}>应急事件</button>
        <button className={activeTab === "workPermits" ? "primary-button" : undefined} type="button" onClick={() => onTabChange("workPermits")}>作业许可</button>
        <button className={activeTab === "devices" ? "primary-button" : undefined} type="button" onClick={() => onTabChange("devices")}>设备</button>
        <button className={activeTab === "deviceAlerts" ? "primary-button" : undefined} type="button" onClick={() => onTabChange("deviceAlerts")}>设备告警</button>
      </div>
      {activeTab === "info" ? (
        <UnitDetailSummary
          unit={unit}
          dicts={dicts}
          authUser={authUser}
          canViewRefPrice={canViewRefPrice}
          canViewRemark={canViewRemark}
        />
      ) : null}
      {activeTab === "workorders" ? (
        <UnitRelatedWorkordersPanel
          data={workorders}
          loading={workordersLoading}
          error={workordersError}
          dicts={dicts}
          authUser={authUser}
          canViewReporterMobile={canViewWorkOrderReporterMobile}
        />
      ) : null}
      {activeTab === "hazards" ? (
        <UnitHazardsPanel
          data={hazards}
          loading={hazardsLoading}
          error={hazardsError}
          dicts={dicts}
        />
      ) : null}
      {activeTab === "emergencies" ? (
        <UnitEmergenciesPanel
          data={emergencies}
          loading={emergenciesLoading}
          error={emergenciesError}
          dicts={dicts}
        />
      ) : null}
      {activeTab === "workPermits" ? (
        <UnitWorkPermitsPanel
          data={workPermits}
          loading={workPermitsLoading}
          error={workPermitsError}
          dicts={dicts}
        />
      ) : null}
      {activeTab === "devices" ? (
        <UnitDevicesPanel
          data={devices}
          loading={devicesLoading}
          error={devicesError}
          dicts={dicts}
        />
      ) : null}
      {activeTab === "deviceAlerts" ? (
        <UnitDeviceAlertsPanel
          data={devices}
          loading={devicesLoading}
          error={devicesError}
          dicts={dicts}
        />
      ) : null}
      <DrawerFooter>
        <button type="button" onClick={onClose}>关闭</button>
      </DrawerFooter>
    </Drawer>
  );
}
