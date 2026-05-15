export interface ParkDto {
  id: string;
  tenantId: string;
  parkId: string;
  parkCode: string;
  parkName: string;
  address: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  lng: string | null;
  lat: string | null;
  totalArea: string;
  landArea: string;
  status: number;
  createTime: Date;
  updateTime: Date;
  remark: string | null;
}
