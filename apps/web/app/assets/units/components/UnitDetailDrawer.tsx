import { Drawer, DrawerActions, DrawerBody, DrawerHeader, DrawerTabButton, DrawerTabs } from "@jinhu/ui";
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
    <Drawer className="asset-space-detail-drawer" size="lg" onClose={onClose}>
      <DrawerHeader
        eyebrow="资产空间"
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
      <DrawerTabs aria-label="资产空间详情">
        <DrawerTabButton active={activeTab === "info"} onClick={() => onTabChange("info")}>基础信息</DrawerTabButton>
        <DrawerTabButton active={activeTab === "workorders"} onClick={() => onTabChange("workorders")}>关联工单</DrawerTabButton>
        <DrawerTabButton active={activeTab === "hazards"} onClick={() => onTabChange("hazards")}>安全隐患</DrawerTabButton>
        <DrawerTabButton active={activeTab === "emergencies"} onClick={() => onTabChange("emergencies")}>应急事件</DrawerTabButton>
        <DrawerTabButton active={activeTab === "workPermits"} onClick={() => onTabChange("workPermits")}>作业许可</DrawerTabButton>
        <DrawerTabButton active={activeTab === "devices"} onClick={() => onTabChange("devices")}>设备</DrawerTabButton>
        <DrawerTabButton active={activeTab === "deviceAlerts"} onClick={() => onTabChange("deviceAlerts")}>设备告警</DrawerTabButton>
      </DrawerTabs>
      <DrawerBody className="asset-space-detail-body">
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
      </DrawerBody>
    </Drawer>
  );
}
