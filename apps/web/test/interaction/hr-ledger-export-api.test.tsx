import {expect,it,vi} from "vitest";
import {hrApi} from "../../lib/hr-api";
import {apiRequest} from "../../lib/api-client";
vi.mock("../../lib/api-client",()=>({apiRequest:vi.fn(),createIdempotencyKey:vi.fn()}));
it("insurance employee scope and export cancellation reach the actual API helper",async()=>{
 const controller=new AbortController(),id="11111111-1111-4111-8111-111111111111";vi.mocked(apiRequest).mockResolvedValue({data:{items:[],total:0,page:2,page_size:100}} as Awaited<ReturnType<typeof apiRequest>>);
 await hrApi.insurancePeriods("synthetic-token",2,100,{employeeId:id,year:2026,month:8,needsReview:true},true,controller.signal);
 expect(apiRequest).toHaveBeenCalledWith(`/hr/insurance/periods/me?page=2&page_size=100&employee_id=${id}&year=2026&month=8&needs_review=true`,{token:"synthetic-token",signal:controller.signal});
});
