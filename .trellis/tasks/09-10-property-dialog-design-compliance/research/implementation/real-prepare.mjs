import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const env=JSON.parse(fs.readFileSync('/tmp/jinhu-housing-uat-20260910-732/env.json'));
const parkId=env.PARK_ID,runId='dialog-732';
assert.equal(env.POSTGRES_DB,'jinhu_housing_uat_20260910_732');
async function request(path,{token,body,idempotent,...options}={}){
const r=await fetch('http://127.0.0.1:3418/api/v1'+path,{...options,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...(idempotent?{'x-idempotency-key':randomUUID()}: {})},body:body?JSON.stringify(body):undefined});
const data=await r.json();if(!r.ok)throw new Error(path+': '+r.status+' '+JSON.stringify(data));return data.data??data;
}
async function createOperatingUnit(token, suffix) {
  const parks = await request("/assets/parks?page=1&page_size=100", { token });
  const assetPark = parks.items.find((item) => item.parkId === parkId) ?? parks.items[0];
  assert(assetPark?.id, "resolved the scoped physical asset park");
  const building = await request("/assets/buildings", {
    method: "POST", token, idempotent: true,
    body: { assetParkId: assetPark.id, buildingCode: `M03B${suffix}`, buildingName: `M03楼栋-${suffix}`, floorCount: 1, status: "enabled" }
  });
  const floor = await request("/assets/floors", {
    method: "POST", token, idempotent: true,
    body: { buildingId: building.id, floorCode: `M03F${suffix}`, floorName: `M03楼层-${suffix}`, floorNo: 1, status: "enabled" }
  });
  const assetUnit = await request("/assets/units", {
    method: "POST", token, idempotent: true,
    body: { floorId: floor.id, unitCode: `M03U${suffix}`, unitName: `M03房源-${suffix}`, unitNo: `M03-${suffix}`, buildingArea: 60, rentableArea: 50, status: "enabled" }
  });
  await request(`/assets/buildings/${building.id}/operating-building`, {
    method: "POST", token, idempotent: true, body: { mode: "create", reason: `M-03 ${runId}` }
  });
  await request(`/assets/floors/${floor.id}/operating-floor`, {
    method: "POST", token, idempotent: true, body: { mode: "create", reason: `M-03 ${runId}` }
  });
  const operatingUnit = await request(`/assets/units/${assetUnit.id}/operating-unit`, {
    method: "POST", token, idempotent: true,
    body: { usageType: 70, rentalStatus: 10, fittingStatus: 10, reason: `M-03 ${runId}` }
  });
  return { assetUnit, operatingUnit };
}


const login=await request('/auth/login',{method:'POST',body:{tenantId:env.TENANT_ID,parkId,username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD}});
const token=login.accessToken;
const {operatingUnit}=await createOperatingUnit(token,'D732');
const start=new Date(Date.now()-60000).toISOString(),end=new Date(Date.now()+3600000).toISOString();
const occupancy=await request('/property/occupancies',{method:'POST',token,idempotent:true,body:{unit_id:operatingUnit.id,source_domain:'operations',source_type:'manual',source_id:'dialog-732',start_at:start,end_at:end,status:'active',remark:'独立弹窗验收'}});
fs.writeFileSync('/tmp/jinhu-housing-uat-20260910-732/fixture.json',JSON.stringify({unitId:operatingUnit.id,occupancyId:occupancy.id}));
console.log(JSON.stringify({unitId:operatingUnit.id,occupancyId:occupancy.id}));
