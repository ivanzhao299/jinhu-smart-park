import { createHash } from "node:crypto";
import { canonicalJson, canonicalYuzhouPayrollSourcePackage, type YuzhouPayrollSourcePackage } from "@jinhu/shared";
import type { DataSource } from "typeorm";

/** Synthetic PostgreSQL fixture only. Real source registration uses the retained-file CLI. */
export async function registerSyntheticPayrollExtraction(db: DataSource, input: YuzhouPayrollSourcePackage) {
  const pkg = canonicalYuzhouPayrollSourcePackage(input);
  const hash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
  await db.query(`INSERT INTO hr_yuzhou_payroll_source_extraction(tenant_id,park_id,source_system,source_instance,
    period_month,evidence_sha256,books_sha256,book_set_sha256,roster_sha256,catalog_sha256,
    manifest_sha256,mapping_sha256,extractor_sha256,file_sha256,record_count,value_count,book_count)
    VALUES($1,$2,'yuzhou-v10',$3,$4::date,$5,$6,$7,$8,$9,$10,$10,$10,'{}'::jsonb,$11,$12,$13)
    ON CONFLICT DO NOTHING`, [pkg.targetScope.tenantId,pkg.targetScope.parkId,pkg.sourceInstance,`${pkg.month}-01`,
    pkg.evidenceSha256,hash(pkg.books),pkg.bookSetSha256,pkg.rosterSha256,pkg.catalogSha256,hash("synthetic-extraction-fixture"),
    pkg.books.reduce((n,b)=>n+b.records.length,0),pkg.books.reduce((n,b)=>n+b.records.reduce((v,r)=>v+r.values.length,0),0),pkg.books.length]);
}
