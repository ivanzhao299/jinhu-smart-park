import assert from "node:assert/strict";
import { after,before,describe,it } from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrContractChangeEntity,HrContractEntity,HrContractTypeEntity,HrEmployeeEntity } from "./entities/hr.entities";
import { HrService } from "./hr.service";

const required=process.env.HR_CONTRACT_READ_PG_REQUIRED==="1";
if(required&&!process.env.POSTGRES_PASSWORD)throw new Error("POSTGRES_PASSWORD is required for the HR contract-read PostgreSQL gate");
const suite=required?describe:describe.skip;

suite("HR contract read PostgreSQL gate",()=>{
 let dataSource:DataSource,service:HrService;
 const audits:Array<Record<string,unknown>>=[];
 const scope={tenantId:"10000001",parkId:"20000001"};
 const employee="00000000-0000-4000-8000-00000000c101",foreignEmployee="00000000-0000-4000-8000-00000000c102",onlineEmployee="00000000-0000-4000-8000-00000000c103",cancelEmployee="00000000-0000-4000-8000-00000000c104";
 const type="00000000-0000-4000-8000-00000000c201",foreignType="00000000-0000-4000-8000-00000000c202";
 const contract="00000000-0000-4000-8000-00000000c301",foreignContract="00000000-0000-4000-8000-00000000c302",change="00000000-0000-4000-8000-00000000c401";
 const actor:JwtPrincipal={sub:"00000000-0000-4000-8000-00000000c001",username:"contract-gate",tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions:[HR_PERMISSIONS.HR_CONTRACT_READ]};

 before(async()=>{
  dataSource=new DataSource({type:"postgres",host:process.env.POSTGRES_HOST??"127.0.0.1",port:Number(process.env.POSTGRES_PORT??"5432"),database:process.env.POSTGRES_DB??"jinhu_smart_park",username:process.env.POSTGRES_USER??"jinhu",password:process.env.POSTGRES_PASSWORD,entities:[HrEmployeeEntity,HrContractTypeEntity,HrContractEntity,HrContractChangeEntity]});
  await dataSource.initialize();
  const args=Array(27).fill(undefined);
  args[0]=dataSource.getRepository(HrEmployeeEntity);args[19]=dataSource.getRepository(HrContractTypeEntity);args[20]=dataSource.getRepository(HrContractEntity);args[21]=dataSource.getRepository(HrContractChangeEntity);args[25]=dataSource;args[26]={recordOperationRequired:async(input:Record<string,unknown>)=>{audits.push(input);}};
  service=Reflect.construct(HrService,args) as HrService;
  await dataSource.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status) VALUES ($1,$2,$3,'M5-LOCAL','本园区员工','active'),($4,$2,'m5-foreign-park','M5-FOREIGN','外园区员工','active'),($5,$2,$3,'M5-ONLINE','在线合同员工','active'),($6,$2,$3,'M5-CANCEL','取消合同员工','active')",[employee,scope.tenantId,scope.parkId,foreignEmployee,onlineEmployee,cancelEmployee]);
  await dataSource.query("INSERT INTO hr_contract_type(id,tenant_id,park_id,type_code,type_name,is_historical_import) VALUES ($1,$2,$3,'M5-FIXED','固定期限',true),($4,$2,'m5-foreign-park','M5-FOREIGN','外园区类型',true)",[type,scope.tenantId,scope.parkId,foreignType]);
  await dataSource.query("INSERT INTO hr_contract(id,tenant_id,park_id,employee_id,contract_type_id,contract_no,start_date,end_date,status,base_salary,legacy_file_reference,source_snapshot,is_historical_import) VALUES ($1,$2,$3,$4,$5,'M5-LOCAL-001','2024-01-01','2027-12-31','active',999999,'secret/path',jsonb_build_object('raw','secret'),true),($6,$2,'m5-foreign-park',$7,$8,'M5-FOREIGN-001','2024-01-01','2027-12-31','active',999999,'foreign/path',jsonb_build_object('raw','foreign'),true)",[contract,scope.tenantId,scope.parkId,employee,type,foreignContract,foreignEmployee,foreignType]);
  await dataSource.query("INSERT INTO hr_contract_change(id,tenant_id,park_id,contract_id,sequence_no,change_type,new_start_date,new_end_date,source_snapshot,is_historical_import) VALUES ($1,$2,$3,$4,1,'renewal','2027-01-01','2027-12-31',jsonb_build_object('raw','change-secret'),true)",[change,scope.tenantId,scope.parkId,contract]);
 });
 after(async()=>{
  if(dataSource?.isInitialized){
   await dataSource.query("DELETE FROM hr_contract_change WHERE id=$1 OR contract_id IN (SELECT id FROM hr_contract WHERE contract_no IN ('M5-ONLINE-001','M5-CANCEL-001'))",[change]);
   await dataSource.query("DELETE FROM hr_contract WHERE contract_no IN ('M5-ONLINE-001','M5-CANCEL-001')");
   await dataSource.query("DELETE FROM hr_contract WHERE id IN ($1,$2)",[contract,foreignContract]);
   await dataSource.query("DELETE FROM hr_contract_type WHERE id IN ($1,$2)",[type,foreignType]);
   await dataSource.query("DELETE FROM hr_employee WHERE id IN ($1,$2,$3,$4)",[employee,foreignEmployee,onlineEmployee,cancelEmployee]);
   await dataSource.destroy();
  }
 });

 it("enforces park scope and returns only the public allowlist",async()=>{
  const page=await service.listContracts(scope,actor,{page:1,page_size:20});
  assert.equal(page.total,1);
  assert.deepEqual(Object.keys(page.items[0]!).sort(),["contractNo","contractTypeId","contractTypeName","employeeCode","employeeId","employeeName","endDate","id","isHistoricalImport","probationEndDate","startDate","status"].sort());
  assert.equal(page.items[0]!.contractNo,"M5-LOCAL-001");
  const detail=await service.contractDetail(scope,actor,contract);
  assert.deepEqual(Object.keys(detail).sort(),["changes","contractNo","contractTypeId","contractTypeName","employeeCode","employeeId","employeeName","endDate","id","isHistoricalImport","probationEndDate","startDate","status"].sort());
  assert.deepEqual(Object.keys(detail.changes[0]!).sort(),["changeType","id","isHistoricalImport","newEndDate","newStartDate","previousEndDate","previousStartDate","sequenceNo","status"].sort());
  await assert.rejects(service.contractDetail(scope,actor,foreignContract),/Contract not found/u);
  assert.equal(audits.length,2);
  assert.ok(audits.every(audit=>JSON.stringify(audit).includes("employment_contract")));
  const auditHolder=service as unknown as {auditService:{recordOperationRequired:(input:Record<string,unknown>)=>Promise<unknown>}};
  const originalAudit=auditHolder.auditService;
  auditHolder.auditService={recordOperationRequired:async()=>{throw new Error("audit unavailable");}};
  await assert.rejects(service.listContracts(scope,actor,{page:1,page_size:20}),/audit unavailable/u);
  auditHolder.auditService=originalAudit;
 });

 it("creates online drafts transactionally and keeps imported history immutable",async()=>{
  const manager={...actor,permissions:[HR_PERMISSIONS.HR_CONTRACT_MANAGE,HR_PERMISSIONS.HR_CONTRACT_READ]};
  const created=await service.createContract(scope,manager,{employeeId:onlineEmployee,contractTypeId:type,contractNo:"M5-ONLINE-001",startDate:"2027-01-01",endDate:"2028-12-31"});
  assert.equal(created.status,"draft");
  assert.equal(created.isHistoricalImport,false);
  await assert.rejects(service.createContract(scope,manager,{employeeId:onlineEmployee,contractTypeId:type,contractNo:"M5-ONLINE-002",startDate:"2027-01-01"}),/active or draft contract/u);
  assert.equal((await service.actContract(scope,manager,created.id,{action:"activate"})).status,"active");
  await assert.rejects(service.actContract(scope,manager,created.id,{action:"cancel"}),/Only a draft/u);
  const draft=await service.createContractChange(scope,manager,created.id,{changeType:"renewal",newStartDate:"2029-01-01",newEndDate:"2030-12-31"});
  assert.equal(draft.status,"draft");
  assert.equal(draft.isHistoricalImport,false);
  await assert.rejects(service.createContractChange(scope,manager,created.id,{changeType:"amendment",newStartDate:"2029-01-01"}),/pending change draft/u);
  await dataSource.query("DELETE FROM hr_contract_change WHERE id=$1",[draft.id]);
  const race=await Promise.allSettled([
   service.createContractChange(scope,manager,created.id,{changeType:"amendment",newStartDate:"2029-02-01"}),
   service.createContractChange(scope,manager,created.id,{changeType:"correction",newStartDate:"2029-03-01"})
  ]);
  assert.equal(race.filter(result=>result.status==="fulfilled").length,1);
  assert.equal(race.filter(result=>result.status==="rejected").length,1);
  const winner=race.find((result):result is PromiseFulfilledResult<Awaited<ReturnType<HrService["createContractChange"]>>> => result.status==="fulfilled");
  assert.ok(winner);
  assert.equal((await service.actContractChange(scope,manager,created.id,winner.value.id,{action:"apply"})).status,"effective");
  await assert.rejects(service.actContractChange(scope,manager,created.id,winner.value.id,{action:"cancel"}),/Only a draft/u);
  const cancelledChange=await service.createContractChange(scope,manager,created.id,{changeType:"correction",newStartDate:"2029-04-01"});
  assert.equal((await service.actContractChange(scope,manager,created.id,cancelledChange.id,{action:"cancel"})).status,"cancelled");
  const cancelledContract=await service.createContract(scope,manager,{employeeId:cancelEmployee,contractTypeId:type,contractNo:"M5-CANCEL-001",startDate:"2027-01-01"});
  assert.equal((await service.actContract(scope,manager,cancelledContract.id,{action:"cancel"})).status,"cancelled");
  await assert.rejects(service.actContract(scope,manager,contract,{action:"cancel"}),/immutable/u);
  await assert.rejects(service.createContractChange(scope,manager,contract,{changeType:"renewal",newStartDate:"2028-01-01"}),/immutable/u);
 });
});
