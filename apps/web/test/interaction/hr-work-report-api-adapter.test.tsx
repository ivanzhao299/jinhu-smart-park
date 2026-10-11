import {beforeEach,expect,it,vi} from "vitest";
const calls=vi.hoisted(()=>({request:vi.fn()}));
vi.mock("../../lib/api-client",()=>({apiRequest:calls.request,createIdempotencyKey:()=>"unused"}));
import {hrApi} from "../../lib/hr-api";
beforeEach(()=>{calls.request.mockReset();calls.request.mockResolvedValue({data:{id:"synthetic"}});});
it("all work-report writes preserve supplied retry key through the actual adapter",async()=>{
 const body={title:"合成"},token="synthetic-token",key="same-operation";
 await hrApi.createWorkReport(body,token,key);await hrApi.updateWorkReport("r",body,token,key);await hrApi.submitWorkReport("r",token,key);await hrApi.cancelWorkReport("r",token,key);await hrApi.reviewWorkReport("r",body,token,key);
 expect(calls.request.mock.calls).toEqual([
 ["/hr/work-reports/me",{method:"POST",body,token,idempotencyKey:key}],
 ["/hr/work-reports/r",{method:"PUT",body,token,idempotencyKey:key}],
 ["/hr/work-reports/r/submit",{method:"POST",token,idempotencyKey:key}],
 ["/hr/work-reports/r",{method:"DELETE",token,idempotencyKey:key}],
 ["/hr/work-reports/r/review",{method:"POST",body,token,idempotencyKey:key}]]);
});
it("compatibility callers still receive fresh keys; action history propagates abort signal",async()=>{
 await hrApi.createWorkReport({},"synthetic");await hrApi.createWorkReport({},"synthetic");const keys=calls.request.mock.calls.map(c=>c[1].idempotencyKey);expect(keys[0]).toEqual(expect.any(String));expect(keys[0]).not.toBe(keys[1]);const controller=new AbortController();await hrApi.workReportActions("r","synthetic",controller.signal);expect(calls.request).toHaveBeenLastCalledWith("/hr/work-reports/r/actions",{token:"synthetic",signal:controller.signal});
});
