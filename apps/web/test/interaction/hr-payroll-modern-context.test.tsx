import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { FormalPayrollSourcePreparation, FormalPayrollCorrectionPreparation } from "@jinhu/shared";
import { PayrollModernOperations } from "../../app/hr/payroll/PayrollModernOperations";
const state=vi.hoisted(()=>({user:{id:"author",tenant_id:"tenant",park_id:"park"},source:{reconciliationSourceId:"source",legacyBatchId:"batch",bookId:"book",bookName:"合成账套",month:"2026-07",recordCount:54},correction:{periodId:"period",month:"2026-07",windowId:"window",ruleSetId:"rules",ruleName:"合成规则",originalRunId:"original",originalRunNo:1}}));
vi.mock("../../lib/auth-context",()=>({useAuthUser:()=>state.user}));
vi.mock("../../app/hr/payroll/PayrollTrialComparison",()=>({PayrollTrialComparison:({onPrepareSource}:{onPrepareSource:(source:FormalPayrollSourcePreparation|null)=>void})=><button onClick={()=>onPrepareSource(state.source)}>选择合成账套来源</button>}));
vi.mock("../../app/hr/payroll/PayrollPeriodOperations",()=>({PayrollPeriodOperations:({onUseCorrection}:{onUseCorrection:(correction:FormalPayrollCorrectionPreparation|null)=>void})=><button onClick={()=>onUseCorrection(state.correction)}>进入合成更正窗口</button>}));
vi.mock("../../app/hr/payroll/PayrollInputPreparation",()=>({PayrollInputPreparation:({source,correction,onExitSource,onExitCorrection}:{source:FormalPayrollSourcePreparation|null;correction:FormalPayrollCorrectionPreparation|null;onExitSource:()=>void;onExitCorrection:()=>void})=><><output data-testid="preparation-context">{source?.reconciliationSourceId??"none"}:{correction?.windowId??"none"}</output><button onClick={onExitSource}>退出来源准备</button><button onClick={onExitCorrection}>退出更正准备</button></>}));
vi.mock("../../app/hr/payroll/PayrollInputOperations",()=>({PayrollInputOperations:()=>null}));
vi.mock("../../app/hr/payroll/PayrollRunCreation",()=>({PayrollRunCreation:({correction}:{correction:FormalPayrollCorrectionPreparation|null})=><output data-testid="creation-context">{correction?.windowId??"none"}</output>}));
vi.mock("../../app/hr/payroll/PayrollRunOperations",()=>({PayrollRunOperations:()=>null}));
beforeEach(()=>{state.user={id:"author",tenant_id:"tenant",park_id:"park"};});
it("actual modern coordinator keeps source preparation and correction mutually exclusive and binds run creation",()=>{
  render(<PayrollModernOperations/>);
  fireEvent.click(screen.getByRole("button",{name:"选择合成账套来源"}));expect(screen.getByTestId("preparation-context")).toHaveTextContent("source:none");
  fireEvent.click(screen.getByRole("button",{name:"进入合成更正窗口"}));expect(screen.getByTestId("preparation-context")).toHaveTextContent("none:window");expect(screen.getByTestId("creation-context")).toHaveTextContent("window");
  fireEvent.click(screen.getByRole("button",{name:"选择合成账套来源"}));expect(screen.getByTestId("preparation-context")).toHaveTextContent("source:none");expect(screen.getByTestId("creation-context")).toHaveTextContent("none");
  fireEvent.click(screen.getByRole("button",{name:"退出来源准备"}));expect(screen.getByTestId("preparation-context")).toHaveTextContent("none:none");
  fireEvent.click(screen.getByRole("button",{name:"进入合成更正窗口"}));fireEvent.click(screen.getByRole("button",{name:"退出更正准备"}));expect(screen.getByTestId("preparation-context")).toHaveTextContent("none:none");expect(screen.getByTestId("creation-context")).toHaveTextContent("none");
});
it("actual modern coordinator discards prior source or correction context on actor scope changes",()=>{
  const view=render(<PayrollModernOperations/>);
  fireEvent.click(screen.getByRole("button",{name:"选择合成账套来源"}));state.user={...state.user,park_id:"second"};view.rerender(<PayrollModernOperations/>);expect(screen.getByTestId("preparation-context")).toHaveTextContent("none:none");
  fireEvent.click(screen.getByRole("button",{name:"进入合成更正窗口"}));state.user={...state.user,id:"second-author"};view.rerender(<PayrollModernOperations/>);expect(screen.getByTestId("preparation-context")).toHaveTextContent("none:none");expect(screen.getByTestId("creation-context")).toHaveTextContent("none");
});
