import { createHash } from "node:crypto";
/* global structuredClone */

const SHA256 = /^[a-f0-9]{64}$/u;
const EXPECTED_GRANT_EDGES = 915;
const SAFE_FACT_KEYS = [
  "rightsRows",
  "templateRows",
  "usersRows",
  "rightsDistinctUnitcodes",
  "templateDistinctUnitcodes",
  "sharedUnitcodes",
  "capabilityUnionUnitcodes",
  "rightsOrphanUnitcodes",
  "templateUnusedUnitcodes",
  "duplicateGrantPrimaryKeys",
  "structuralConflictUnitcodes",
  "blankTemplateSemantics",
  "grantEdgeSetSha256",
  "capabilitySetSha256",
];

// This query returns aggregates and collection hashes only. User identifiers are
// consumed inside the grant-edge hash and are never selected into the receipt.
export const LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL = `SET NOCOUNT ON;
SELECT
  (SELECT COUNT_BIG(*) FROM dbo.rights) AS rightsRows,
  (SELECT COUNT_BIG(*) FROM dbo.rightstemplet) AS templateRows,
  (SELECT COUNT_BIG(*) FROM dbo.users) AS usersRows,
  (SELECT COUNT_BIG(DISTINCT unitcode) FROM dbo.rights) AS rightsDistinctUnitcodes,
  (SELECT COUNT_BIG(DISTINCT unitcode) FROM dbo.rightstemplet) AS templateDistinctUnitcodes,
  (SELECT COUNT_BIG(*) FROM (SELECT unitcode FROM dbo.rights INTERSECT SELECT unitcode FROM dbo.rightstemplet) shared) AS sharedUnitcodes,
  (SELECT COUNT_BIG(*) FROM (SELECT unitcode FROM dbo.rights UNION SELECT unitcode FROM dbo.rightstemplet) capabilities) AS capabilityUnionUnitcodes,
  (SELECT COUNT_BIG(*) FROM (SELECT unitcode FROM dbo.rights EXCEPT SELECT unitcode FROM dbo.rightstemplet) orphaned) AS rightsOrphanUnitcodes,
  (SELECT COUNT_BIG(*) FROM (SELECT unitcode FROM dbo.rightstemplet EXCEPT SELECT unitcode FROM dbo.rights) unused) AS templateUnusedUnitcodes,
  (SELECT COUNT_BIG(*) FROM (SELECT username,unitcode FROM dbo.rights GROUP BY username,unitcode HAVING COUNT_BIG(*)>1) duplicates) AS duplicateGrantPrimaryKeys,
  (SELECT COUNT_BIG(DISTINCT r.unitcode) FROM dbo.rights r JOIN dbo.rightstemplet t ON t.unitcode=r.unitcode
    WHERE COALESCE(NULLIF(LTRIM(RTRIM(r.programgroup)),''),'')<>COALESCE(NULLIF(LTRIM(RTRIM(t.programgroup)),''),'')
       OR COALESCE(NULLIF(LTRIM(RTRIM(r.programunit)),''),'')<>COALESCE(NULLIF(LTRIM(RTRIM(t.programunit)),''),'')
       OR COALESCE(r.grade,-2147483648)<>COALESCE(t.grade,-2147483648)
       OR COALESCE(r.authorise,-2147483648)<>COALESCE(t.authorise,-2147483648)
       OR COALESCE(r.rightstates,-2147483648)<>COALESCE(t.rightstates,-2147483648)) AS structuralConflictUnitcodes,
  (SELECT COUNT_BIG(*) FROM dbo.rightstemplet WHERE NULLIF(LTRIM(RTRIM(programgroup)),'') IS NULL OR NULLIF(LTRIM(RTRIM(programunit)),'') IS NULL) AS blankTemplateSemantics,
  LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',COALESCE((SELECT CONCAT(LEN(username),':',username,'|',unitcode,';') FROM dbo.rights ORDER BY username,unitcode FOR XML PATH(''),TYPE).value('.','nvarchar(max)'),'')),2)) AS grantEdgeSetSha256,
  LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',COALESCE((SELECT CONCAT(unitcode,';') FROM (SELECT unitcode FROM dbo.rights UNION SELECT unitcode FROM dbo.rightstemplet) capabilities ORDER BY unitcode FOR XML PATH(''),TYPE).value('.','nvarchar(max)'),'')),2)) AS capabilitySetSha256,
  CONVERT(varchar(1),sd.is_read_only) AS databaseReadOnly,
  CONVERT(varchar(1),COALESCE(IS_SRVROLEMEMBER('sysadmin'),0)) AS sysadmin,
  CONVERT(varchar(1),COALESCE(IS_ROLEMEMBER('db_datareader'),0)) AS dbDatareader,
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION')) AS viewDefinition,
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','INSERT')) AS canInsert,
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','UPDATE')) AS canUpdate,
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','DELETE')) AS canDelete,
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','EXECUTE')) AS canExecute
FROM sys.databases sd WHERE sd.name=DB_NAME();`;

// This private review query returns one structural capability row per unitcode.
// It never selects the user-bound grant key from dbo.rights.
export const LEGACY_CLIENT_PERMISSION_PRIVATE_CAPABILITY_SQL = `SET NOCOUNT ON;
WITH capability_codes AS (
  SELECT unitcode FROM dbo.rights
  UNION
  SELECT unitcode FROM dbo.rightstemplet
)
SELECT
  codes.unitcode,
  CASE WHEN COALESCE(template.programgroup, orphan.programgroup) IS NULL THEN NULL ELSE CONVERT(varchar(max),CONVERT(varbinary(max),CONVERT(nvarchar(max),COALESCE(template.programgroup, orphan.programgroup))),2) END AS programgroupHex,
  CASE WHEN COALESCE(template.programunit, orphan.programunit) IS NULL THEN NULL ELSE CONVERT(varchar(max),CONVERT(varbinary(max),CONVERT(nvarchar(max),COALESCE(template.programunit, orphan.programunit))),2) END AS programunitHex,
  COALESCE(template.grade, orphan.grade) AS grade,
  COALESCE(template.authorise, orphan.authorise) AS authorise,
  COALESCE(template.rightstates, orphan.rightstates) AS rightstates
FROM capability_codes codes
LEFT JOIN dbo.rightstemplet template ON template.unitcode=codes.unitcode
OUTER APPLY (
  SELECT TOP (1) rights.programgroup,rights.programunit,rights.grade,rights.authorise,rights.rightstates
  FROM dbo.rights rights
  WHERE rights.unitcode=codes.unitcode
  ORDER BY rights.programgroup,rights.programunit,rights.grade,rights.authorise,rights.rightstates
) orphan
ORDER BY codes.unitcode;`;

export class LegacyClientPermissionSourceReceiptError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyClientPermissionSourceReceiptError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyClientPermissionSourceReceiptError(code, detail); };
const hash = value => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const count = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) fail("PERMISSION_SOURCE_RECEIPT_INVALID", label);
};

export function buildLegacyClientPermissionSourceReceipt({ contract, aggregate, sourceRestoreReceiptSha256, databaseIdentitySha256, queryIdentitySha256 }) {
  if (contract?.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_client_permission_source_receipt"
    || contract.expectedAuthorizationGrantEdges !== EXPECTED_GRANT_EDGES
    || contract.productionImport !== "HOLD") fail("PERMISSION_SOURCE_RECEIPT_CONTRACT_INVALID", "identity");
  if (!exactKeys(aggregate, SAFE_FACT_KEYS)) fail("PERMISSION_SOURCE_RECEIPT_INVALID", "aggregate keys");
  for (const key of SAFE_FACT_KEYS.filter(key => !key.endsWith("Sha256"))) count(aggregate[key], key);
  for (const key of ["grantEdgeSetSha256", "capabilitySetSha256"]) if (!SHA256.test(aggregate[key] ?? "")) fail("PERMISSION_SOURCE_RECEIPT_INVALID", key);
  for (const [label, value] of Object.entries({ sourceRestoreReceiptSha256, databaseIdentitySha256, queryIdentitySha256 })) {
    if (!SHA256.test(value ?? "")) fail("PERMISSION_SOURCE_RECEIPT_INVALID", label);
  }
  const expectedQueryIdentitySha256 = hash(`${LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL}\n${LEGACY_CLIENT_PERMISSION_PRIVATE_CAPABILITY_SQL}\n`);
  if (queryIdentitySha256 !== expectedQueryIdentitySha256) fail("PERMISSION_SOURCE_QUERY_IDENTITY_MISMATCH", queryIdentitySha256);
  if (aggregate.rightsRows !== EXPECTED_GRANT_EDGES
    || aggregate.rightsDistinctUnitcodes + aggregate.templateDistinctUnitcodes - aggregate.sharedUnitcodes !== aggregate.capabilityUnionUnitcodes
    || aggregate.rightsDistinctUnitcodes - aggregate.sharedUnitcodes !== aggregate.rightsOrphanUnitcodes
    || aggregate.templateDistinctUnitcodes - aggregate.sharedUnitcodes !== aggregate.templateUnusedUnitcodes
    || aggregate.templateDistinctUnitcodes > aggregate.templateRows
    || aggregate.capabilityUnionUnitcodes === 0
    || aggregate.duplicateGrantPrimaryKeys !== 0) fail("PERMISSION_SOURCE_RECEIPT_CONSERVATION_FAILED", "counts");
  const safeFacts = structuredClone(aggregate);
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_client_permission_source_receipt",
    sourceRestoreReceiptSha256,
    databaseIdentitySha256,
    queryIdentitySha256,
    operationMode: "read_only_aggregate_and_private_capability_export",
    expectedAuthorizationGrantEdges: EXPECTED_GRANT_EDGES,
    safeFacts,
    status: aggregate.rightsOrphanUnitcodes === 0 && aggregate.structuralConflictUnitcodes === 0 && aggregate.blankTemplateSemantics === 0
      ? "SOURCE_PERMISSION_CAPABILITIES_CAPTURED_REVIEW_PENDING"
      : "SOURCE_PERMISSION_CAPABILITIES_CAPTURED_WITH_GAPS",
    compatibilityCredit: 0,
    containsUserBoundRows: false,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: hash(`${JSON.stringify(body)}\n`) };
}

export function assertLegacyClientPermissionReadonlyAuthority(authority) {
  if (!exactKeys(authority, ["databaseReadOnly", "sysadmin", "dbDatareader", "viewDefinition", "insert", "update", "delete", "execute"])
    || authority.databaseReadOnly !== true
    || authority.sysadmin !== false
    || authority.dbDatareader !== true
    || authority.viewDefinition !== true
    || authority.insert !== false
    || authority.update !== false
    || authority.delete !== false
    || authority.execute !== false) fail("PERMISSION_SOURCE_AUTHORITY_INVALID", "least-privilege read-only authority required");
  return true;
}
