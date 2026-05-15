export interface FloorDto {
  id: string;
  tenantId: string;
  parkId: string;
  buildingId: string;
  floorCode: string;
  floorNo: number;
  floorName: string;
  floorArea: string;
  layoutFileId: string | null;
  layoutUrl: string | null;
  status: number;
  sortNo: number;
  createTime: Date;
  updateTime: Date;
  remark: string | null;
}
