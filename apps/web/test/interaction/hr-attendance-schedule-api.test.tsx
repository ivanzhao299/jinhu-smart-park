import {beforeEach,expect,it,vi} from "vitest";
import {hrApi} from "../../lib/hr-api";
import {apiRequest,createIdempotencyKey} from "../../lib/api-client";
vi.mock("../../lib/api-client",()=>({apiRequest:vi.fn(),createIdempotencyKey:vi.fn()}));
beforeEach(()=>{vi.clearAllMocks();vi.mocked(apiRequest).mockResolvedValue({data:null} as Awaited<ReturnType<typeof apiRequest>>)});
it("exact schedule query retains employee/date and abort signal",async()=>{
 const signal=new AbortController().signal;await hrApi.attendanceSchedule("employee","2026-10-10","synthetic-token",signal);
 expect(apiRequest).toHaveBeenCalledWith("/hr/attendance/schedules?employee_id=employee&work_date=2026-10-10",{token:"synthetic-token",signal});
});
it("create and adjustment preserve caller retry keys and structured bodies",async()=>{
 const create={employeeId:"employee",shiftId:"A",workDate:"2026-10-10"},update={shiftId:"B",expectedVersion:2,reason:"正式调班"};
 await hrApi.createAttendanceSchedule(create,"synthetic-token","stable-create");expect(apiRequest).toHaveBeenLastCalledWith("/hr/attendance/schedules",{method:"POST",body:create,token:"synthetic-token",idempotencyKey:"stable-create"});
 await hrApi.updateAttendanceSchedule("schedule",update,"synthetic-token","stable-update");expect(apiRequest).toHaveBeenLastCalledWith("/hr/attendance/schedules/schedule",{method:"PUT",body:update,token:"synthetic-token",idempotencyKey:"stable-update"});expect(createIdempotencyKey).not.toHaveBeenCalled();
});
