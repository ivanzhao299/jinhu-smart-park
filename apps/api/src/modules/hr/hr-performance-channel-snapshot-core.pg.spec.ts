import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { DataSource } from "typeorm";

type Decimal = string | null;
const weightKeys = ["sPercent", "mPercent", "tPercent", "xPercent", "cPercent"] as const;
const valueKeys = ["selfValue", "mItemValue", "itemValue", "xItemValue", "cItemValue"] as const;
const adjustmentKeys = ["masterValue", "timekeepValue", "bonusValue"] as const;
const weights = (...values: Decimal[]) => Object.fromEntries(weightKeys.map((k, i) => [k, values[i] ?? null]));
const detail = (id: string, ...values: Decimal[]) => ({ id, selfValue: values[0] ?? null, mItemValue: values[1] ?? null, itemValue: values[2] ?? null, xItemValue: values[3] ?? null, cItemValue: values[4] ?? null });
const adjustments = (...values: Decimal[]) => Object.fromEntries(adjustmentKeys.map((k, i) => [k, values[i] ?? null]));
const level = (id: string, grade: string, minValue: Decimal) => ({ id, grade, minValue });
const w0 = weights(), a0 = adjustments();
const d0 = detail("zero");
const cases = [
  { name: "all channels plus three adjustments", w: weights("20", "30", "10", "25", "15"), d: [detail("a", "80", "70.40", "60", "90.40", "50.40"), detail("b", "10", "0.40", "20", "0.40", "0.40")], a: adjustments("2.10", "-1", "0.20"), expected: "79.00" },
  { name: "aggregate before integer conversion", w: weights(null, "100"), d: [detail("a", null, "0.40"), detail("b", null, "0.40")], a: a0, expected: "1.00" },
  ...["1.50", "-1.50", "0.49", "-0.49", "0.50", "-0.50"].map((n, i) => ({ name: `integer boundary ${n}`, w: weights(null, "100", null, "100", "100"), d: [detail(`half-${i}`, null, n, null, n, n)], a: a0, expected: ["6.00", "-6.00", "0.00", "0.00", "3.00", "-3.00"][i]! })),
  { name: "negative final cross zero", w: weights("50"), d: [detail("a", "0.01")], a: adjustments("-0.01"), expected: "-0.01" },
  { name: "positive final cross zero", w: weights("50"), d: [detail("a", "-0.01")], a: adjustments("0.01"), expected: "0.01" },
  { name: "positive final half", w: weights("50"), d: [detail("a", "0.01")], a: a0, expected: "0.01" },
  { name: "negative final half", w: weights("50"), d: [detail("a", "-0.01")], a: a0, expected: "-0.01" },
  { name: "explicit nulls", w: w0, d: [d0], a: a0, expected: "0.00" },
  { name: "explicit zero", w: weights("0", "0", "0", "0", "0"), d: [detail("a", "0", "0", "0", "0", "0")], a: adjustments("0", "0", "0"), expected: "0.00" },
  { name: "no details despite adjustment", w: w0, d: [], a: adjustments("10"), expected: null },
  { name: "non100 negative weights", w: weights("-20", "150", "200", "0", "-100"), d: [detail("a", "1.25", "1.50", "0.01", "0", "0.50")], a: a0, expected: "1.77" },
  { name: "18digit exact positive", w: weights("100"), d: [detail("a", "9999999999999999.99")], a: a0, expected: "9999999999999999.99" },
  { name: "18digit exact negative", w: weights("100"), d: [detail("a", "-9999999999999999.99")], a: a0, expected: "-9999999999999999.99" },
  { name: "no final 18digit cast", w: weights("100"), d: [detail("a", "9999999999999999.99"), detail("b", "9999999999999999.99")], a: a0, expected: "19999999999999999.98" },
  { name: "complete duplicate-item rows", w: weights("100", "100", "100", "100", "100"), d: Array.from({length: 101}, (_, i) => detail(`same-item-${i}`, "0.01", "0.01", "0.01", "0.01", "0.01")), a: a0, expected: "5.02" },
  { name: "int32 weight extrema", w: weights("2147483647", "-2147483648"), d: [detail("a", "1", "1")], a: a0, expected: "-0.01" },
];

test("owned PostgreSQL: exact pure channel snapshots and frozen source differential", {
  skip: process.env.HR_PERFORMANCE_CHANNEL_CORE_PG_REQUIRED !== "1", timeout: 120000,
}, async () => {
  const name = `hr-channel-core-${randomUUID()}`;
  const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }).trim();
  let creationAttempted = false;
  let db: DataSource | undefined;
  try {
    creationAttempted = true;
    docker("run", "-d", "--name", name, "--label", `jinhu.hr-channel-core=${name}`, "--tmpfs", "/var/lib/postgresql/data:rw", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-p", "127.0.0.1::5432", "postgres:16-alpine");
    console.log(`Owned PostgreSQL container: ${name}`);
    const port = Number(docker("port", name, "5432/tcp").split(":").pop());
    assert.ok(port > 0);
    for (let i = 0; ; i++) {
      try { docker("exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"); break; }
      catch (error) { if (i === 50) throw error; await new Promise(r => setTimeout(r, 100)); }
    }
    db = new DataSource({ type: "postgres", host: "127.0.0.1", port, username: "postgres", database: "postgres" });
    await db.initialize();
    const sql = (query: string, parameters?: unknown[]) => db!.query(query, parameters);
    const migration = (file: string) => readFileSync(resolve(__dirname, "../../../../../database/migrations", file), "utf8");
    await sql(`
    CREATE EXTENSION "uuid-ossp";
    CREATE TABLE migration_batch(
      id uuid PRIMARY KEY,run_id varchar(64) NOT NULL,source_system varchar(64) NOT NULL,
      source_snapshot_sha256 char(64) NOT NULL,target_database varchar(128) NOT NULL,
      phase varchar(32) NOT NULL,status varchar(32) NOT NULL,tool_version varchar(64) NOT NULL
    );
    CREATE TABLE legacy_record_map(
      id uuid PRIMARY KEY,batch_id uuid NOT NULL REFERENCES migration_batch(id),
      source_system varchar(64) NOT NULL,source_table varchar(256) NOT NULL,
      source_pk_canonical varchar(512) NOT NULL,source_identity_sha256 char(64) NOT NULL,
      source_row_sha256 char(64) NOT NULL,target_table varchar(256) NOT NULL,target_id uuid,
      mapping_status varchar(32) NOT NULL,is_active boolean NOT NULL,
      update_time timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE hr_performance_template(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_template_version(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      template_id uuid NOT NULL,UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_template_dimension(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      template_version_id uuid NOT NULL,UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_template_level(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      template_version_id uuid NOT NULL,UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_cycle_employee(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      UNIQUE(id,tenant_id,park_id)
    );
`);
    // Install the exact existing dimension helper as well, without unrelated workflow tables.
    const modern = migration("000258_hr_performance_template_planning.sql");
    await sql(modern.slice(modern.indexOf("CREATE FUNCTION hr_performance_snapshot_score("), modern.indexOf("CREATE FUNCTION hr_performance_freeze_guard(")));
    for (const f of ["000300_hr_performance_yuzhou_legacy_model.sql", "000302_hr_performance_yuzhou_legacy_master.sql", "000304_hr_performance_yuzhou_legacy_master_parity.sql", "000321_hr_performance_yuzhou_total_rounding.sql"]) await sql(migration(f));
    const batch = randomUUID();
    await sql(`INSERT INTO migration_batch VALUES($1,'synthetic','yuzhou-v10',repeat('f',64),current_database(),'load','running','test')`, [batch]);
    let sourceId = 0;
    const insertFact = async (table: string, sourceTable: string, fields: Record<string, unknown>) => {
      const id = randomUUID(), map = randomUUID(), hash = (++sourceId).toString(16).padStart(64, "0");
      await sql(`INSERT INTO legacy_record_map(id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active) VALUES($1,$2,'yuzhou-v10',$3,$4::text,$4::text,$4::text,$5,$6,'loaded',true)`, [map, batch, sourceTable, hash, table, id]);
      const row = { id, tenant_id: "synthetic-t", park_id: "synthetic-p", migration_batch_id: batch, legacy_record_map_id: map, source_identity_sha256: hash, source_row_sha256: hash, ...fields };
      await sql(`INSERT INTO ${table}(${Object.keys(row).join(",")}) VALUES(${Object.keys(row).map((_, i) => `$${i + 1}`).join(",")})`, Object.values(row));
      return id;
    };
    const masterIds: string[] = [];
    const levels = Array.from({length: 41}, (_, i) => level(`level-${i}`, i === 40 ? " Final " : `G${i}`, String(i * 2 - 40)));
    const differentialLevels = [...levels, level("tie", "Tied", "40"), level("null", "NullMin", null)];
    for (const l of differentialLevels) await insertFact("hr_performance_legacy_level_rule", "dbo.assgradecode", {source_ass_grade: l.grade, source_assessment_id: 999, source_min_value: l.minValue, source_max_value: -100});
    for (const [i, c] of cases.entries()) {
      const template = await insertFact("hr_performance_legacy_template_profile", "dbo.assessmentcode", {source_assessment: i, ...Object.fromEntries(weightKeys.map((k, j) => [["source_s_percent", "source_m_percent", "source_t_percent", "source_x_percent", "source_c_percent"][j], c.w[k]]))});
      const dimension = await insertFact("hr_performance_legacy_dimension_profile", "dbo.assitem", {source_item_id: i, source_assessment_id: i, legacy_template_profile_id: template});
      for (const row of c.d) await insertFact("hr_performance_legacy_dimension_result", "dbo.assessmentdetail", {source_detail_id: sourceId + 1, source_session_id: i, source_person_code: "SYNTHETIC", source_item_id: i, legacy_dimension_profile_id: dimension, ...Object.fromEntries(valueKeys.map((k, j) => [["source_self_value", "source_m_item_value", "source_item_value", "source_x_item_value", "source_c_item_value"][j], row[k]]))});
      masterIds.push(await insertFact("hr_performance_legacy_master_result", "dbo.assessmentmaster", {source_master_id: i, source_session_id: i, source_person_code: "SYNTHETIC", legacy_template_profile_id: template, ...Object.fromEntries(adjustmentKeys.map((k, j) => [["source_master_value", "source_timekeep_value", "source_bonus_value"][j], c.a[k]]))}));
    }
    const oldFunctions = `SELECT oid,proname,pg_get_functiondef(oid) definition,proacl::text acl FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'hr_performance_%' ORDER BY oid`;
    const beforeFunctions = await sql(oldFunctions);
    const facts = ["migration_batch", "legacy_record_map", "hr_performance_legacy_template_profile", "hr_performance_legacy_dimension_profile", "hr_performance_legacy_dimension_result", "hr_performance_legacy_master_result", "hr_performance_legacy_level_rule", "hr_performance_legacy_dimension_level_guide"];
    const fingerprint = async () => Promise.all(facts.map(table => sql(`SELECT count(*)::text count,md5(coalesce(string_agg(row_to_json(t)::text,'|' ORDER BY id),'')) digest FROM ${table} t`)));
    const beforeFacts = await fingerprint();
    await sql(migration("000370_hr_performance_channel_snapshot_core.sql"));
    const total = async (w: unknown, d: unknown, a: unknown) => (await sql("SELECT hr_performance_five_channel_snapshot_total_v1($1::jsonb,$2::jsonb,$3::jsonb)::text value", [JSON.stringify(w), JSON.stringify(d), JSON.stringify(a)]))[0].value;
    const grade = async (n: string | null, l: unknown) => (await sql("SELECT hr_performance_threshold_snapshot_grade_v1($1::numeric,$2::jsonb) value", [n, JSON.stringify(l)]))[0].value;
    for (const [i, c] of cases.entries()) {
      const result = await total(c.w, c.d, c.a);
      assert.equal(result, c.expected, c.name);
      assert.equal(result, (await sql("SELECT hr_performance_yuzhou_legacy_full_total($1)::text value", [masterIds[i]]))[0].value, c.name);
      const projected = await grade(result, differentialLevels), old = (await sql("SELECT * FROM hr_performance_yuzhou_legacy_grade_parity($1)", [masterIds[i]]))[0];
      assert.equal(projected.expectedGrade, old.expected_ass_grade, c.name);
      assert.equal(String(projected.winningCandidateCount), old.winning_candidate_count, c.name);
      assert.equal(projected.winningMinValue === null ? null : projected.winningMinValue.replace(/\.00$/, ""), old.winning_min_value === null ? null : String(old.winning_min_value), c.name);
      assert.equal(projected.status, old.parity_status === "MISMATCH" || old.parity_status === "MATCH" ? "RESOLVED" : old.parity_status, c.name);
    }
    assert.equal((await grade("40", levels)).expectedGrade, " Final ");
    assert.equal((await grade("39.99", levels)).expectedGrade, "G39");
    assert.equal((await grade("-40", levels)).expectedGrade, "G0");
    assert.equal((await grade("-40.01", levels)).status, "NO_ELIGIBLE_GRADE");
    assert.equal((await grade(null, levels)).status, "TOTAL_UNAVAILABLE");
    assert.deepEqual(await grade("0", []), {status: "NO_ELIGIBLE_GRADE", expectedGrade: null, winningMinValue: null, winningCandidateCount: 0});
    assert.equal((await grade("0", [level("null", "ignored", null)])).status, "NO_ELIGIBLE_GRADE");
    assert.equal((await grade("0", [level("a", "", "0")])).expectedGrade, "");
    assert.deepEqual(await grade("0.01", [level("a", "Same", "0.01"), level("b", "Same", "0.01")]), {status: "AMBIGUOUS_TOP_THRESHOLD", expectedGrade: null, winningMinValue: "0.01", winningCandidateCount: 2});
    const rejects = async (run: Promise<unknown>, code = "22023") => assert.rejects(run, (e: {code?: string; message?: string}) => e.code === code && !e.message?.includes("PRIVATE_SENTINEL"));
    for (const invalid of [null, [], {}, {...w0, extra: null}, {...w0, sPercent: 10}, {...w0, sPercent: true}, {...w0, sPercent: "1.0"}, {...w0, sPercent: "1e2"}, {...w0, sPercent: "+1"}, {...w0, sPercent: " NaN"}]) await rejects(total(invalid, [d0], a0));
    for (const invalid of [null, {}, [null], [1], [{}], [{...d0, extra: null}], [{...d0, id: ""}], [{...d0, id: null}], [{...d0, id: "x".repeat(129)}], [d0, d0]]) await rejects(total(w0, invalid, a0));
    for (const invalid of [null, [], {}, {...a0, extra: null}]) await rejects(total(w0, [], invalid));
    for (const invalid of ["PRIVATE_SENTINEL", "NaN", "Infinity", "-Infinity", "1e2", " 1", "1 ", "+1", ".5", "1.", "0.001", "1.000", "", 1, true, {}, []]) {
      for (const key of valueKeys) await rejects(total(w0, [{...d0, [key]: invalid}], a0));
      for (const key of adjustmentKeys) await rejects(total(w0, [], {...a0, [key]: invalid}));
      await rejects(grade(null, [{...level("a", "A", "0"), minValue: invalid}]));
    }
    for (const key of valueKeys) { const row = {...d0}; delete (row as Record<string, unknown>)[key]; await rejects(total(w0, [row], a0)); }
    for (const key of adjustmentKeys) { const a = {...a0}; delete a[key]; await rejects(total(w0, [d0], a)); }
    for (const key of weightKeys) { const w = {...w0}; delete w[key]; await rejects(total(w, [d0], a0)); }
    for (const invalid of [null, {}, [null], [{}], [level("", "A", "0")], [level("x".repeat(129), "A", "0")], [level("a", "A".repeat(65), "0")], [{...level("a", "A", "0"), grade: null}], [{...level("a", "A", "0"), extra: 1}], [level("a", "A", "0"), level("a", "B", "1")]]) await rejects(grade(null, invalid));
    for (const key of ["id", "grade", "minValue"]) { const l: Record<string, unknown> = level("a", "A", "0"); delete l[key]; await rejects(grade(null, [l])); }
    for (const n of ["NaN", "Infinity", "-Infinity", "0.001", "1.000"]) await rejects(grade(n, []));
    for (const n of ["2147483648", "-2147483649"]) await rejects(total({...w0, sPercent: n}, [d0], a0), "22003");
    for (const n of ["10000000000000000", "-10000000000000000"]) {
      await rejects(total(w0, [detail("a", n)], a0), "22003");
      await rejects(total(w0, [], adjustments(n)), "22003");
      await rejects(grade(null, [level("a", "A", n)]), "22003");
    }
    // M/X/C aggregate overflow must be checked even with zero/NULL weights.
    for (const key of ["mItemValue", "xItemValue", "cItemValue"]) assert.equal(await total(w0, Array.from({length: 100}, (_, i) => ({...d0, id: String(i), [key]: "9999999999999999.99"})), a0), "0.00");
    for (const key of ["mItemValue", "xItemValue", "cItemValue"]) await rejects(total(w0, Array.from({length: 101}, (_, i) => ({...d0, id: String(i), [key]: "9999999999999999.99"})), a0), "22003");
    await rejects(sql("SELECT hr_performance_five_channel_snapshot_total_v1(NULL,'[]','{}')"));
    await rejects(sql("SELECT hr_performance_threshold_snapshot_grade_v1(NULL,NULL)"));
    assert.equal((await total(weights("100"), [detail(" ", "1"), detail(" x", "2"), detail("x", "3")], a0)), "6.00");
    assert.equal((await grade("9999999999999999.99", [level("a", " A ", "9999999999999999.99")])).expectedGrade, " A ");
    // Legacy rounded subtotal remains intentionally different in signed cross-zero cases.
    assert.equal((await sql("SELECT hr_performance_yuzhou_weighted_detail_total('synthetic-t','synthetic-p',$1,$2,8,'SYNTHETIC')::text value", [batch, (await sql("SELECT legacy_template_profile_id FROM hr_performance_legacy_master_result WHERE id=$1", [masterIds[8]]))[0].legacy_template_profile_id]))[0].value, "0.01");
    assert.deepEqual(await fingerprint(), beforeFacts);
    const afterFunctions = await sql(oldFunctions);
    assert.deepEqual(afterFunctions.filter((f: {oid: number}) => beforeFunctions.some((b: {oid: number}) => b.oid === f.oid)), beforeFunctions);
    const added = await sql("SELECT oid,provolatile,prosecdef,proconfig,proacl::text acl FROM pg_proc WHERE proname IN ('hr_performance_five_channel_snapshot_total_v1','hr_performance_threshold_snapshot_grade_v1')");
    assert.equal(added.length, 2);
    for (const f of added) { assert.equal(f.provolatile, "i"); assert.equal(f.prosecdef, false); assert.deepEqual(f.proconfig, ["search_path=pg_catalog"]); assert.ok(!/[{,]=X\//.test(f.acl)); }
    await sql("CREATE ROLE synthetic_no_access");
    for (const f of added) assert.equal((await sql("SELECT has_function_privilege('synthetic_no_access',$1::oid,'EXECUTE') allowed", [f.oid]))[0].allowed, false);
    await sql("SET ROLE synthetic_no_access");
    try { await rejects(total(w0, [d0], a0), "42501"); await rejects(grade("0", []), "42501"); }
    finally { await sql("RESET ROLE"); }
    await sql("GRANT EXECUTE ON FUNCTION hr_performance_five_channel_snapshot_total_v1(jsonb,jsonb,jsonb), hr_performance_threshold_snapshot_grade_v1(numeric,jsonb) TO synthetic_no_access");
    await sql("SET ROLE synthetic_no_access");
    try {
      assert.equal((await sql("SELECT has_table_privilege(current_user,'hr_performance_legacy_dimension_result','SELECT') allowed"))[0].allowed, false);
      assert.equal(await total(weights("100"), [detail("a", "1.25")], a0), "1.25");
      assert.equal((await grade("1.25", [level("a", "A", "1")])).expectedGrade, "A");
    } finally { await sql("RESET ROLE"); }
    assert.deepEqual(await fingerprint(), beforeFacts);
    console.log(`Validated ${cases.length} source differential cases, strict rejection matrix, complete arrays, old definitions/ACL and fact digests`);
  } finally {
    try {
      if (db?.isInitialized) await db.destroy();
    } finally {
      // A failed connection close must not bypass removal. docker run may also
      // create the container before returning an error or timing out.
      if (creationAttempted && docker("ps", "-aq", "--filter", `name=^/${name}$`)) {
        assert.equal(docker("inspect", "--format", '{{index .Config.Labels "jinhu.hr-channel-core"}}', name), name);
        docker("rm", "-fv", name);
        assert.equal(docker("ps", "-aq", "--filter", `name=^/${name}$`), "");
        console.log(`Owned PostgreSQL removed: ${name}`);
      }
    }
  }
});
