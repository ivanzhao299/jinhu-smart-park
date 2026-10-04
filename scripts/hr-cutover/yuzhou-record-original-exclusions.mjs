import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { verifyExtendedRecordSource, YUZHOU_RECORD_FIELD_COVERAGE } from "./yuzhou-record-incremental-projection.mjs";

const bytes=readFileSync(new URL("./contracts/yuzhou-original-credential-exclusions-v1.json",import.meta.url));
const hash=value=>createHash("sha256").update(value).digest("hex");
const fail=()=>{throw new Error("YUZHOU_RECORD_ORIGINAL_EXCLUSION_INVALID");};
export const YUZHOU_RECORD_ORIGINAL_EXCLUSIONS_SHA256="6e078156d66b51f3ccbdb9923919a21c1094a81c91f9806f0fe8434e41b71906";
if(hash(bytes)!==YUZHOU_RECORD_ORIGINAL_EXCLUSIONS_SHA256)fail();
const receipt=JSON.parse(bytes);
if(receipt.artifactKind!=="yuzhou_original_credential_exclusion_exact_rows"||receipt.exclusionCount!==3||receipt.entries.length!==3
  ||hash(receipt.entries.map(value=>value.sourceIdentitySha256+value.sourceRowSha256).sort().join(""))!==receipt.exclusionPairsSha256
  ||receipt.disposition!=="original_quarantine_retained"||receipt.archivalClosureCertified!==false)fail();

/** Only unchanged exact original rows. This retains original quarantine receipts;
 * it neither archives current-impact records nor authorizes a database write. */
export function originalYuzhouRecordExclusion(row) {
  const verified=verifyExtendedRecordSource(row);
  if(verified.sourceTable!=="dbo.ticket")return null;
  const entry=receipt.entries.find(value=>value.sourceIdentitySha256===verified.sourceIdentitySha256&&value.sourceRowSha256===verified.sourceRowSha256);
  if(!entry)return null;
  if(verified.source.ticket!==null&&verified.source.ticket.trim()!=="")fail();
  return {
    declaration:{sourceIdentitySha256:verified.sourceIdentitySha256,sourceRowSha256:verified.sourceRowSha256,disposition:"original_quarantine_retained",reasonCode:entry.reasonCode,
      originalDecision:{operationId:receipt.originalOperationId,bindingSha256:receipt.originalBindingSha256,exclusionReceiptsSha256:receipt.exclusionReceiptsSha256,contractSha256:YUZHOU_RECORD_ORIGINAL_EXCLUSIONS_SHA256}},
    sourceEvidence:{sourceIdentitySha256:verified.sourceIdentitySha256,sourceRowSha256:verified.sourceRowSha256,
      fieldCoverage:YUZHOU_RECORD_FIELD_COVERAGE.credential.map(value=>({...value,disposition:"original_quarantine_retained",reasonCode:entry.reasonCode}))},
  };
}
