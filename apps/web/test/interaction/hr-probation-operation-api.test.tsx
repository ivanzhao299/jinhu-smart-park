import {beforeEach,expect,it,vi} from "vitest";
import {apiRequest,createIdempotencyKey} from "../../lib/api-client";
vi.mock("../../lib/api-client",()=>({apiRequest:vi.fn(),createIdempotencyKey:vi.fn()}));
import {hrApi} from "../../lib/hr-api";

beforeEach(()=>{vi.clearAllMocks();vi.mocked(apiRequest).mockResolvedValue({data:{}} as Awaited<ReturnType<typeof apiRequest>>);vi.mocked(createIdempotencyKey).mockReturnValue("generated-key");});

it("all five probation writes forward caller retry keys and immutable bodies",async()=>{
 const body={applicationName:"Synthetic",applicationDate:"2026-10-10",reason:"Reason",participants:[{employeeId:"employee",plannedConfirmationDate:"2026-10-11"}]};
 await hrApi.createProbationApplication(body,"token","create-key");await hrApi.updateProbationApplication("application",body,"token","update-key");await hrApi.probationApplicationAction("application","submit","token","action-key");await hrApi.reviewProbationApplication("application","return","Actual opinion","token","review-key");await hrApi.confirmProbationApplication("application","token","confirm-key");
 expect(apiRequest).toHaveBeenNthCalledWith(1,"/hr/probation-applications",{method:"POST",body,token:"token",idempotencyKey:"create-key"});expect(apiRequest).toHaveBeenNthCalledWith(2,"/hr/probation-applications/application",{method:"PUT",body,token:"token",idempotencyKey:"update-key"});expect(apiRequest).toHaveBeenNthCalledWith(3,"/hr/probation-applications/application/actions",{method:"POST",body:{action:"submit"},token:"token",idempotencyKey:"action-key"});expect(apiRequest).toHaveBeenNthCalledWith(4,"/hr/probation-applications/application/review",{method:"POST",body:{action:"return",comment:"Actual opinion"},token:"token",idempotencyKey:"review-key"});expect(apiRequest).toHaveBeenNthCalledWith(5,"/hr/probation-applications/application/confirm",{method:"POST",token:"token",idempotencyKey:"confirm-key"});expect(createIdempotencyKey).not.toHaveBeenCalled();
});

it("existing probation callers without an explicit key still receive generated action keys",async()=>{
 await hrApi.createProbationApplication({},"token");await hrApi.updateProbationApplication("application",{},"token");await hrApi.probationApplicationAction("application","resubmit","token");await hrApi.reviewProbationApplication("application","approve","","token");await hrApi.confirmProbationApplication("application","token");
 expect(createIdempotencyKey.mock.calls.map(call=>call[0])).toEqual(["hr-probation-create","hr-probation-update","hr-probation-resubmit","hr-probation-approve","hr-probation-confirm"]);expect(apiRequest).toHaveBeenCalledTimes(5);for(const call of vi.mocked(apiRequest).mock.calls)expect(call[1]).toEqual(expect.objectContaining({idempotencyKey:"generated-key"}));
});
