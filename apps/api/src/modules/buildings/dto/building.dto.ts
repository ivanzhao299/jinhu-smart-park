export interface BuildingDto {
  id: string;
  tenantId: string;
  parkId: string;
  buildingCode: string;
  buildingName: string;
  floorCount: number;
  buildArea: string;
  status: number;
  sortNo: number;
  createTime: Date;
  updateTime: Date;
  remark: string | null;
}
