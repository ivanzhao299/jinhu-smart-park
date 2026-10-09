import {expect,it,vi} from "vitest";
import {hrApi} from "../../lib/hr-api";
import {apiRequest} from "../../lib/api-client";
vi.mock("../../lib/api-client",()=>({apiRequest:vi.fn(),createIdempotencyKey:vi.fn()}));
it("insurance transports exact employee and month on both scoped list entries",async()=>{
 vi.mocked(apiRequest).mockResolvedValue({data:{items:[],total:0,page:2,page_size:30}} as Awaited<ReturnType<typeof apiRequest>>);
 for(const selfOnly of [false,true]){
  await hrApi.insurancePeriods("synthetic-token",2,30,{employeeId:"11111111-1111-4111-8111-111111111111",year:2026,month:8},selfOnly);
  const url=vi.mocked(apiRequest).mock.lastCall?.[0] as string;
  expect(url.split("?")[0]).toBe(`/hr/insurance/periods${selfOnly?"/me":""}`);
  expect(Object.fromEntries(new URLSearchParams(url.split("?")[1]))).toEqual({page:"2",page_size:"30",employee_id:"11111111-1111-4111-8111-111111111111",year:"2026",month:"8"});
 }
});
