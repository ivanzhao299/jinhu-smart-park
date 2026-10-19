"use client";

import { useEffect, useRef, useState } from "react";
import type { FormalPayrollSourcePreparation, FormalPayrollCorrectionPreparation } from "@jinhu/shared";
import { useAuthUser } from "../../../lib/auth-context";
import { PayrollTrialComparison } from "./PayrollTrialComparison";
import { PayrollPeriodOperations } from "./PayrollPeriodOperations";
import { PayrollInputPreparation } from "./PayrollInputPreparation";
import { PayrollInputOperations } from "./PayrollInputOperations";
import { PayrollRunCreation } from "./PayrollRunCreation";
import { PayrollRunOperations } from "./PayrollRunOperations";
import type { PayrollRuleHandoffIntent } from "./payroll-rule-handoff";
import type { PayrollInputReviewIntent } from "./payroll-input-handoff";

export function PayrollModernOperations({ onCreated, onPrepareRule, returnTrial }: { onCreated?: () => void; onPrepareRule?: (intent: PayrollRuleHandoffIntent) => void; returnTrial?: Pick<PayrollRuleHandoffIntent, "legacyBatchId" | "month"> | null }) {
  const user = useAuthUser(); return <ModernWorkspace key={JSON.stringify(user)} onCreated={onCreated} onPrepareRule={onPrepareRule} returnTrial={returnTrial}/>;
}
function ModernWorkspace({ onCreated, onPrepareRule, returnTrial }: { onCreated?: () => void; onPrepareRule?: (intent: PayrollRuleHandoffIntent) => void; returnTrial?: Pick<PayrollRuleHandoffIntent, "legacyBatchId" | "month"> | null }) {
  const [source,setSource]=useState<FormalPayrollSourcePreparation|null>(null);
  const [correction, setCorrection] = useState<FormalPayrollCorrectionPreparation | null>(null);
  const [runRefresh, setRunRefresh] = useState(0), [periodRefresh, setPeriodRefresh] = useState(0);
  const [reviewIntent, setReviewIntent] = useState<PayrollInputReviewIntent | null>(null);
  const [trialReturn, setTrialReturn] = useState<(Pick<PayrollRuleHandoffIntent, "legacyBatchId" | "month"> & { nonce: number }) | null>(null);
  const [sourceWriting, setSourceWriting] = useState(false);
  const returned = useRef(0);
  useEffect(() => { if (returnTrial) setTrialReturn({ ...returnTrial, nonce: ++returned.current }); }, [returnTrial?.legacyBatchId, returnTrial?.month]);
  return <>
    <PayrollTrialComparison onPrepareSource={value=>{setReviewIntent(null);setSource(value);if(value)setCorrection(null);}} onPrepareRule={onPrepareRule} onWritingChange={setSourceWriting} returnTrial={trialReturn}/>
    <PayrollPeriodOperations refresh={periodRefresh} onUseCorrection={value=>{setSource(null);setCorrection(value);}}/>
    <PayrollInputPreparation source={source} onExitSource={()=>setSource(null)} correction={correction} onExitCorrection={() => setCorrection(null)} onViewDraft={intent => { setReviewIntent(intent); setSource(null); setCorrection(null); }}/>
    <PayrollInputOperations intent={reviewIntent} navigationBlocked={sourceWriting} onReturnToTrial={intent => { if (!intent.sourceReturn || sourceWriting) return; setTrialReturn({ ...intent.sourceReturn, nonce: ++returned.current }); }}/>
    <PayrollRunCreation correction={correction} onCreated={() => { setRunRefresh(value => value + 1); setPeriodRefresh(value => value + 1); onCreated?.(); }}/>
    <PayrollRunOperations key={runRefresh} onChanged={() => setPeriodRefresh(value => value + 1)}/>
  </>;
}
