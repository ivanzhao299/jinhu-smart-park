import {expect,it,vi} from "vitest";
import {hrApi} from "../../lib/hr-api";
import {apiRequest} from "../../lib/api-client";

vi.mock("../../lib/api-client",()=>({apiRequest:vi.fn(),createIdempotencyKey:vi.fn()}));

it("transports a supplied directory organization as org_id without changing unfiltered callers",async()=>{
 vi.mocked(apiRequest).mockResolvedValue({data:{items:[],total:0,page:2,page_size:50}} as Awaited<ReturnType<typeof apiRequest>>);
 const signal=new AbortController().signal;
 await hrApi.employees("synthetic-token",2,50,{keyword:"SYN",status:"active",orgId:"org-1"},signal);
 expect(apiRequest).toHaveBeenLastCalledWith("/hr/employees?page=2&page_size=50&keyword=SYN&status=active&org_id=org-1",{token:"synthetic-token",signal});
 await hrApi.employees("synthetic-token",1,50,{keyword:""});
 expect(apiRequest).toHaveBeenLastCalledWith("/hr/employees?page=1&page_size=50",{token:"synthetic-token",signal:undefined});
});
