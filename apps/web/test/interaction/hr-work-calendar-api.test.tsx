import {beforeEach,expect,it,vi} from "vitest";
import {workCalendarApi} from "../../lib/hr-work-calendar-api";
import {apiRequest} from "../../lib/api-client";
vi.mock("../../lib/api-client",()=>({apiRequest:vi.fn()}));
beforeEach(()=>{vi.clearAllMocks();vi.mocked(apiRequest).mockResolvedValue({data:{}} as Awaited<ReturnType<typeof apiRequest>>)});
it("sends the exact bounded range and cancellation signal",async()=>{
 const signal=new AbortController().signal;await workCalendarApi.range("2026-07-01","2026-07-31","token",signal);expect(apiRequest).toHaveBeenCalledWith("/hr/attendance/work-calendar?from=2026-07-01&to=2026-07-31",{token:"token",signal});
});
it("preserves full CAS request body and caller replay key",async()=>{
 const body={expectedVersion:2,dayKind:"unset" as const,dayName:"撤销日历设置",reason:"业务调整"};await workCalendarApi.put("2026-07-01",body,"token","same-key");expect(apiRequest).toHaveBeenCalledWith("/hr/attendance/work-calendar/2026-07-01",{method:"PUT",token:"token",body,idempotencyKey:"same-key"});
});
it("keeps exact date and history page size",async()=>{
 const signal=new AbortController().signal;await workCalendarApi.history("2026-07-01",2,"token",signal);expect(apiRequest).toHaveBeenCalledWith("/hr/attendance/work-calendar/2026-07-01/history?page=2&page_size=20",{token:"token",signal});
});
