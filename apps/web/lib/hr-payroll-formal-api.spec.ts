import assert from "node:assert/strict";
import test from "node:test";
import { hrApi } from "./hr-api";
import { ApiError } from "./api-client";

test("payroll batch operations carry selected input versions, review reasons and stable retry keys", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ code: 0, message: "success", data: { id: "run", version: 2 } }), { headers: { "Content-Type": "application/json" } });
  };
  try {
    const selection = { inputId: "confirmed-input", expectedInputVersion: 4, attendanceInputBatchId: "closed-attendance" };
    await hrApi.createFormalPayrollRun(selection, undefined, "run-key");
    assert.equal(calls[0]!.url, "/api/v1/hr/payroll/formal-runs");
    assert.deepEqual(JSON.parse(calls[0]!.init!.body as string), selection);
    const review = { expectedVersion: 1, reason: "核对分项和金额" };
    await hrApi.reviewFormalPayrollRun("run", review, undefined, "review-key");
    assert.deepEqual(JSON.parse(calls[1]!.init!.body as string), review);
    assert.equal(new Headers(calls[1]!.init!.headers).get("X-Idempotency-Key"), "review-key");
    await hrApi.confirmFormalPayrollRun("run", { expectedVersion: 2, reason: "核算确认" }, undefined, "confirm-key");
    assert.equal(calls[2]!.url, "/api/v1/hr/payroll/formal-runs/run/confirm");
    const controller = new AbortController();
    await hrApi.formalPayrollRun("run", { page: 2, pageSize: 10 }, undefined, controller.signal);
    assert.equal(calls[3]!.url, "/api/v1/hr/payroll/formal-runs/run?page=2&pageSize=10");
    assert.equal(calls[3]!.init!.signal, controller.signal);
  } finally { globalThis.fetch = originalFetch; }
});

test("formal payroll requests preserve exact structured input, explicit versions and retry identity", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ code: 0, message: "success", data: { id: "synthetic-input", status: "draft" } }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const body = { periodId: "period", ruleSetId: "rules", ruleVersionId: "approved-version", expectedHeadRevision: 4,
      employees: [{ employeeId: "employee", expectedEmployeeVersion: 7, directItems: { 工资: "123.4500", 税: "0.0000" } }], reason: "当期核对" };
    await hrApi.createPayrollInput(body, "synthetic-token", "synthetic-retry-key");
    await hrApi.createPayrollInput(body, "synthetic-token", "synthetic-retry-key");
    for (const call of calls) {
      assert.equal(call.url, "/api/v1/hr/payroll/inputs");
      assert.equal(call.init?.method, "POST");
      assert.deepEqual(JSON.parse(call.init?.body as string), body);
      assert.equal(new Headers(call.init?.headers).get("X-Idempotency-Key"), "synthetic-retry-key");
    }
    await hrApi.updatePayrollInput("input", { expectedVersion: 3, employees: body.employees, reason: body.reason }, undefined, "edit-key");
    assert.equal(calls.at(-1)?.init?.method, "PUT");
    await hrApi.confirmPayrollInput("input", { expectedVersion: 4 }, undefined, "confirm-key");
    assert.equal(calls.at(-1)?.url, "/api/v1/hr/payroll/inputs/input/confirm");
  } finally { globalThis.fetch = originalFetch; }
});

test("formal payroll reads encode scope filters, carry cancellation and unwrap standard pagination", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const page = { items: [], total: 0, page: 2, page_size: 20 };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ code: 0, message: "success", data: page }), { headers: { "Content-Type": "application/json" } });
  };
  try {
    const controller = new AbortController();
    assert.deepEqual(await hrApi.payrollInputs({ periodId: "period", ruleSetId: "rules", page: 2 }, undefined, controller.signal), page);
    assert.match(calls[0]!.url, /periodId=period&ruleSetId=rules&page=2&pageSize=20$/u);
    assert.equal(calls[0]!.init?.signal, controller.signal);
    await hrApi.payrollRuleVersions("rules", { page: 2 }, undefined, controller.signal);
    assert.equal(calls.at(-1)?.url, "/api/v1/hr/payroll/rules/rules/versions?page=2&pageSize=20");
    await hrApi.payrollEffectiveRule("rules", "2026-10", undefined, controller.signal);
    assert.equal(calls.at(-1)?.url, "/api/v1/hr/payroll/rules/rules/effective?month=2026-10");
  } finally { globalThis.fetch = originalFetch; }
});

test("rule review and input failure retain actual server errors without reporting success", async () => {
  const originalFetch = globalThis.fetch;
  let captured: RequestInit | undefined;
  globalThis.fetch = async (_url, init) => {
    captured = init;
    return new Response(JSON.stringify({ code: 409, message: "Effective payroll rules changed", data: null }), { status: 409, headers: { "Content-Type": "application/json" } });
  };
  try {
    const body = { expectedVersion: 3, decision: "approve" as const, effectiveFrom: "2026-10", reason: "独立复核" };
    await assert.rejects(() => hrApi.reviewPayrollRuleVersion("version", body, undefined, "review-key"), (error: unknown) => error instanceof ApiError && error.status === 409 && error.message === "Effective payroll rules changed");
    assert.deepEqual(JSON.parse(captured?.body as string), body);
    assert.equal(new Headers(captured?.headers).get("X-Idempotency-Key"), "review-key");
  } finally { globalThis.fetch = originalFetch; }
});

test("payroll preparation encodes business selection and supports cancellation without a write", async () => {
  const originalFetch=globalThis.fetch;
  let observedUrl="";let observedInit:RequestInit|undefined;
  const data={items:[],total:0,page:3,page_size:10,expectedHeadRevision:2};
  globalThis.fetch=async(url,init)=>{observedUrl=String(url);observedInit=init;return new Response(JSON.stringify({code:0,message:"success",data}),{headers:{"Content-Type":"application/json"}});};
  try {
    const abort=new AbortController();
    assert.deepEqual(await hrApi.payrollPreparation({periodId:"period",ruleSetId:"rules",keyword:"姓名 & 工号",page:3,pageSize:10},undefined,abort.signal),data);
    const url=new URL(observedUrl,"http://localhost");
    assert.equal(url.pathname,"/api/v1/hr/payroll/inputs/preparation");
    assert.equal(url.searchParams.get("keyword"),"姓名 & 工号");
    assert.equal(url.searchParams.get("page"),"3");
    assert.equal(observedInit?.signal,abort.signal);
    assert.equal(observedInit?.body,undefined);
  } finally {globalThis.fetch=originalFetch;}
});

test("formal payroll source options bind selected confirmed input and version", async () => {
  const originalFetch=globalThis.fetch;
  let url="";let init:RequestInit|undefined;
  const data={items:[],total:1,page:2,page_size:20,inputId:"confirmed",inputVersion:7};
  globalThis.fetch=async(value,options)=>{url=String(value);init=options;return new Response(JSON.stringify({code:0,message:"success",data}),{headers:{"Content-Type":"application/json"}});};
  try {
    const abort=new AbortController();
    assert.deepEqual(await hrApi.formalPayrollRunOptions({inputId:"confirmed",expectedInputVersion:7,page:2},undefined,abort.signal),data);
    assert.equal(url,"/api/v1/hr/payroll/formal-runs/options?inputId=confirmed&expectedInputVersion=7&page=2&pageSize=20");
    assert.equal(init?.signal,abort.signal);assert.equal(init?.body,undefined);
  } finally {globalThis.fetch=originalFetch;}
});

test("formal payroll source options carry an explicit attendance inspection batch", async () => {
  const originalFetch=globalThis.fetch;
  let url="";
  globalThis.fetch=async(value)=>{url=String(value);return new Response(JSON.stringify({code:0,message:"success",data:{items:[],total:0,page:1,page_size:20}}),{headers:{"Content-Type":"application/json"}});};
  try {
    await hrApi.formalPayrollRunOptions({inputId:"confirmed",expectedInputVersion:7,attendanceInputBatchId:"attendance",page:1,pageSize:20});
    assert.equal(url,"/api/v1/hr/payroll/formal-runs/options?inputId=confirmed&expectedInputVersion=7&page=1&pageSize=20&attendanceInputBatchId=attendance");
  } finally { globalThis.fetch=originalFetch; }
});


test("book options encode literal searches and cancellation; create preserves explicit book association", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify({ code: 0, data: { items: [], total: 0, page: 2, page_size: 20 } }), { headers: { "Content-Type": "application/json" } }); };
  try {
    const abort = new AbortController();
    await hrApi.payrollBookOptions({ page: 2, keyword: "工资 & 1%" }, undefined, abort.signal);
    const url = new URL(calls[0]!.url, "http://localhost");
    assert.equal(url.pathname, "/api/v1/hr/payroll/rules/book-options");
    assert.equal(url.searchParams.get("keyword"), "工资 & 1%");
    assert.equal(url.searchParams.get("page"), "2"); assert.equal(calls[0]!.init?.signal, abort.signal);
    const body = { ruleCode: "PAY", displayName: "正式工资", sourceBookId: "book" };
    await hrApi.createPayrollRules(body, undefined, "book-binding-key");
    assert.deepEqual(JSON.parse(calls[1]!.init!.body as string), body);
    assert.equal(new Headers(calls[1]!.init?.headers).get("X-Idempotency-Key"), "book-binding-key");
  } finally { globalThis.fetch = originalFetch; }
});


test("closed-period transport carries scoped window selection, abort signals and exact retry keys", async () => {
  const originalFetch=globalThis.fetch,calls:Array<{url:string;init?:RequestInit}>=[];
  globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return new Response(JSON.stringify({code:0,message:"success",data:{id:"synthetic"}}),{headers:{"Content-Type":"application/json"}});};
  try {
    const signal=new AbortController().signal;
    await hrApi.payrollPreparation({periodId:"period",ruleSetId:"rules",correctionWindowId:"window",keyword:"合成 员工"},undefined,signal);
    const preparation=new URL(calls.at(-1)!.url,"http://localhost");
    assert.equal(preparation.pathname,"/api/v1/hr/payroll/inputs/preparation");assert.equal(preparation.searchParams.get("correctionWindowId"),"window");assert.equal(preparation.searchParams.get("keyword"),"合成 员工");assert.equal(calls.at(-1)!.init!.signal,signal);
    await hrApi.payrollInputs({periodId:"period",correctionWindowId:"window"},undefined,signal);
    assert.equal(new URL(calls.at(-1)!.url,"http://localhost").searchParams.get("correctionWindowId"),"window");
    await hrApi.payrollPeriodLifecycle("period",undefined,signal);assert.equal(calls.at(-1)!.url,"/api/v1/hr/payroll/periods/period/lifecycle");assert.equal(calls.at(-1)!.init!.signal,signal);
    await hrApi.payrollCorrectionOptions("period",{page:2,pageSize:10},undefined,signal);assert.equal(calls.at(-1)!.url,"/api/v1/hr/payroll/periods/period/correction-options?page=2&pageSize=10");
    const action={expectedVersion:2,reason:"明确操作理由"};
    const writes=[
      {path:"periods/period/close",body:action,run:()=>hrApi.closePayrollPeriod("period",action,undefined,"stable-key")},
      {path:"periods/period/correction-windows",body:{...action,originalRunId:"original",expectedRunVersion:3},run:()=>hrApi.openPayrollCorrection("period",{...action,originalRunId:"original",expectedRunVersion:3},undefined,"stable-key")},
      {path:"correction-windows/window/cancel",body:action,run:()=>hrApi.cancelPayrollCorrection("window",action,undefined,"stable-key")},
      {path:"correction-windows/window/complete",body:{...action,completedRunId:"result"},run:()=>hrApi.completePayrollCorrection("window",{...action,completedRunId:"result"},undefined,"stable-key")},
      {path:"formal-runs/result/cancel",body:action,run:()=>hrApi.cancelFormalPayrollRun("result",action,undefined,"stable-key")},
    ];
    for(const write of writes){await write.run();await write.run();for(const call of calls.slice(-2)){assert.equal(call.url,`/api/v1/hr/payroll/${write.path}`);assert.equal(call.init!.method,"POST");assert.deepEqual(JSON.parse(call.init!.body as string),write.body);assert.equal(new Headers(call.init!.headers).get("X-Idempotency-Key"),"stable-key");}}
  } finally {globalThis.fetch=originalFetch;}
});
