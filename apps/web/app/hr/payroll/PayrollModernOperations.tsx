"use client";

import { useState } from "react";
import type { FormalPayrollSourcePreparation, FormalPayrollCorrectionPreparation } from "@jinhu/shared";
import { useAuthUser } from "../../../lib/auth-context";
import { PayrollTrialComparison } from "./PayrollTrialComparison";
import { PayrollPeriodOperations } from "./PayrollPeriodOperations";
import { PayrollInputPreparation } from "./PayrollInputPreparation";
import { PayrollInputOperations } from "./PayrollInputOperations";
import { PayrollRunCreation } from "./PayrollRunCreation";
import { PayrollRunOperations } from "./PayrollRunOperations";
import type { PayrollRuleHandoffIntent } from "./payroll-rule-handoff";

export function PayrollModernOperations({ onCreated, onPrepareRule, returnTrial }: { onCreated?: () => void; onPrepareRule?: (intent: PayrollRuleHandoffIntent) => void; returnTrial?: Pick<PayrollRuleHandoffIntent, "legacyBatchId" | "month"> | null }) {
  const user = useAuthUser(); return <ModernWorkspace key={JSON.stringify(user)} onCreated={onCreated} onPrepareRule={onPrepareRule} returnTrial={returnTrial}/>;
}
function ModernWorkspace({ onCreated, onPrepareRule, returnTrial }: { onCreated?: () => void; onPrepareRule?: (intent: PayrollRuleHandoffIntent) => void; returnTrial?: Pick<PayrollRuleHandoffIntent, "legacyBatchId" | "month"> | null }) {
  const [source,setSource]=useState<FormalPayrollSourcePreparation|null>(null);
  const [correction, setCorrection] = useState<FormalPayrollCorrectionPreparation | null>(null);
  const [runRefresh, setRunRefresh] = useState(0), [periodRefresh, setPeriodRefresh] = useState(0);
  return <>
    <PayrollTrialComparison onPrepareSource={value=>{setSource(value);if(value)setCorrection(null);}} onPrepareRule={onPrepareRule} returnTrial={returnTrial}/>
    <PayrollPeriodOperations refresh={periodRefresh} onUseCorrection={value=>{setSource(null);setCorrection(value);}}/>
    <PayrollInputPreparation source={source} onExitSource={()=>setSource(null)} correction={correction} onExitCorrection={() => setCorrection(null)}/>
    <PayrollInputOperations/>
    <PayrollRunCreation correction={correction} onCreated={() => { setRunRefresh(value => value + 1); setPeriodRefresh(value => value + 1); onCreated?.(); }}/>
    <PayrollRunOperations key={runRefresh} onChanged={() => setPeriodRefresh(value => value + 1)}/>
  </>;
}
