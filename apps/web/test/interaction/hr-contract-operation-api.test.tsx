import {beforeEach,expect,it,vi} from "vitest";
import {apiRequest,createIdempotencyKey} from "../../lib/api-client";
vi.mock("../../lib/api-client",()=>({apiRequest:vi.fn(),createIdempotencyKey:vi.fn()}));
import {hrApi} from "../../lib/hr-api";
beforeEach(()=>{vi.resetAllMocks();vi.mocked(apiRequest).mockResolvedValue({data:{}} as Awaited<ReturnType<typeof apiRequest>>);vi.mocked(createIdempotencyKey).mockReturnValue("fallback-key");});
it("six contract operations preserve the exact caller key and body for existing replay semantics",async()=>{
 const body={contractNo:"SYN",employeeId:"employee",expectedVersion:7};
 await hrApi.createContract(body,"token","create");await hrApi.updateContract("contract",body,"token","edit");await hrApi.reviewContractInformation("contract",body,"token","review");await hrApi.contractAction("contract","activate","token","action");await hrApi.createContractChange("contract",body,"token","change");await hrApi.contractChangeAction("contract","change","apply","token","apply");
 const expected=[["/hr/contracts","POST",body,"create"],["/hr/contracts/contract","PUT",body,"edit"],["/hr/contracts/contract/review-information","POST",body,"review"],["/hr/contracts/contract/actions","POST",{action:"activate"},"action"],["/hr/contracts/contract/changes","POST",body,"change"],["/hr/contracts/contract/changes/change/actions","POST",{action:"apply"},"apply"]] as const;
 for(const [index,[route,method,payload,key]] of expected.entries())expect(apiRequest).toHaveBeenNthCalledWith(index+1,route,{method,body:payload,token:"token",idempotencyKey:key});expect(createIdempotencyKey).not.toHaveBeenCalled();
});
it("existing callers without a retained key remain compatible",async()=>{
 await hrApi.createContract({},"token");await hrApi.updateContract("c",{},"token");await hrApi.reviewContractInformation("c",{},"token");await hrApi.contractAction("c","cancel","token");await hrApi.createContractChange("c",{},"token");await hrApi.contractChangeAction("c","x","cancel","token");expect(apiRequest).toHaveBeenCalledTimes(6);for(const call of vi.mocked(apiRequest).mock.calls)expect(call[1]?.idempotencyKey).toEqual(expect.any(String));
});
