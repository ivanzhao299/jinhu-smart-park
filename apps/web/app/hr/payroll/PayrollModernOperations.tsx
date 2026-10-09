"use client";

import { useState } from "react";
import type { FormalPayrollCorrectionPreparation } from "@jinhu/shared";
import { useAuthUser } from "../../../lib/auth-context";
import { PayrollPeriodOperations } from "./PayrollPeriodOperations";
import { PayrollInputPreparation } from "./PayrollInputPreparation";
import { PayrollInputOperations } from "./PayrollInputOperations";
import { PayrollRunCreation } from "./PayrollRunCreation";
import { PayrollRunOperations } from "./PayrollRunOperations";

export function PayrollModernOperations({ onCreated }: { onCreated?: () => void }) {
  const user = useAuthUser(); return <ModernWorkspace key={JSON.stringify(user)} onCreated={onCreated}/>;
}
function ModernWorkspace({ onCreated }: { onCreated?: () => void }) {
  const [correction, setCorrection] = useState<FormalPayrollCorrectionPreparation | null>(null);
  const [runRefresh, setRunRefresh] = useState(0), [periodRefresh, setPeriodRefresh] = useState(0);
  return <>
    <PayrollPeriodOperations refresh={periodRefresh} onUseCorrection={setCorrection}/>
    <PayrollInputPreparation correction={correction} onExitCorrection={() => setCorrection(null)}/>
    <PayrollInputOperations/>
    <PayrollRunCreation correction={correction} onCreated={() => { setRunRefresh(value => value + 1); setPeriodRefresh(value => value + 1); onCreated?.(); }}/>
    <PayrollRunOperations key={runRefresh} onChanged={() => setPeriodRefresh(value => value + 1)}/>
  </>;
}
