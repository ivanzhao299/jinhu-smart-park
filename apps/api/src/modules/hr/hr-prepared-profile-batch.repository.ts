import { BadRequestException, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { TenantParkScope, YuzhouIncrementalPackage } from "@jinhu/shared";

const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`;
const object = (value: unknown): value is Record<string,unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function invalid(): never { throw new BadRequestException("Prepared HR batch integrity check failed"); }
const fixedScope = { tenantId: "10000001", parkId: "20000001" };
const collector = "e2de6e37d8007dd713002f437d714c7e454a64370c1a24efae3e98eac11eb632";
const adapter = "267c7ac63394f81a53c62fa30b3bbf51f0fddbe34eb113bbad304b591a77d136";
// Exact reviewed fingerprints. Contract-only recipe expansion leaves the pinned
// profile collector/alias adapter unchanged; retain original prepared batches.
const recipes = new Set([
  "31f6aa4bc25237d6b7d4c32e9d10cfae8c4d04c8ae00fd08c7a866b7a850d5ec",
  "5ba25c32890045910cd04f83325fd4dfbbac7cc5cb9e15f652e50ea7bb035d2e",
  "161530bdc3e45693ee8063b408edef1eb9936bd96f6d69934c4d9f1029943d0c",
]);
export interface PreparedProfilePackage { index: number; kind: "baseline" | "alias"; itemCount: number; fields: string[]; packageSha256: string; manifestId: string }
export interface PreparedProfileBatch { id: string; sourceProfiles: number; aliasProfiles: number; packages: PreparedProfilePackage[] }
interface LocatedBatch { directory: string; metadata: PreparedProfileBatch }

/** Only fixed, host-owned private files. Never return paths, source rows or before images. */
export class HrPreparedProfileBatchRepository {
  constructor(private readonly root = "/var/lib/jinhu/hr-private-profile-input", private readonly runtimeCommit = process.env.JINHU_RUNTIME_COMMIT ?? "") {}

  private directory(path: string, owner?: number) {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700
      || realpathSync(path) !== path || owner !== undefined && stat.uid !== owner) invalid();
    return stat.uid;
  }
  private read(path: string, owner: number, maxBytes: number) {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== owner || (stat.mode & 0o777) !== 0o600 || stat.size > maxBytes) invalid();
      const text = readFileSync(fd, "utf8");
      if (Buffer.byteLength(text) > maxBytes || realpathSync(path) !== path || lstatSync(path).ino !== stat.ino) invalid();
      return text;
    } finally { closeSync(fd); }
  }
  private locate(scope: TenantParkScope): LocatedBatch[] {
    if (scope.tenantId !== fixedScope.tenantId || scope.parkId !== fixedScope.parkId) return [];
    if (!/^[a-f0-9]{40}$/.test(this.runtimeCommit)) return [];
    let owner: number;
    try { owner = this.directory(this.root); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    const names = readdirSync(this.root);
    if (names.length > 100) invalid();
    const batches: LocatedBatch[] = [];
    for (const name of names.sort()) {
      if (!/^preparation-[A-Za-z0-9]{6}$/.test(name)) invalid();
      const control = join(this.root,name); this.directory(control,owner);
      const result = join(control,"result");
      try { this.directory(result,owner); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
      const preparation: unknown = JSON.parse(this.read(join(result,"preparation-receipt.json"),owner,65536));
      if (!object(preparation) || preparation.formatVersion !== 1 || preparation.kind !== "yuzhou_original_profile_alias_private_preparation"
        || preparation.collectorSha256 !== collector || !sha(preparation.batchReceiptSha256)
        || typeof preparation.runtimeCommit !== "string" || !/^[a-f0-9]{40}$/.test(preparation.runtimeCommit)
        || !sha(preparation.inputSha256) || !sha(preparation.beforeImagesSha256)
        || preparation.productionImport !== "HOLD" || preparation.authorizationGranted !== false || preparation.writerPresent !== false) invalid();
      // The producer revision records provenance. Frozen producer/adapter/recipe
      // compatibility admits the same bytes after unrelated application releases;
      // the ordinary preview/commit kernel still rechecks current target evidence.
      const directory = join(result,"batch"); this.directory(directory,owner);
      const receipt: unknown = JSON.parse(this.read(join(directory,"receipt.json"),owner,262144));
      if (!object(receipt)) invalid();
      const {receiptSha256,...core} = receipt;
      if (!sha(receiptSha256) || receiptSha256 !== preparation.batchReceiptSha256 || digest(canonical(core)) !== receiptSha256
        || core.formatVersion !== 1 || core.artifactKind !== "yuzhou_profile_alias_ordered_batch"
        || core.productionImport !== "HOLD" || core.authorizationGranted !== false || core.adapterSha256 !== adapter
        || canonical(core.targetScope) !== canonical(fixedScope) || !Array.isArray(core.executionOrder)
        || core.executionOrder.length < 1 || core.executionOrder.length > 32 || !object(preparation.expected)
        || !Number.isSafeInteger(core.sourceProfiles) || Number(core.sourceProfiles) < 1 || Number(core.sourceProfiles) > 20000
        || !Number.isSafeInteger(core.aliasProfiles) || Number(core.aliasProfiles) < 1 || Number(core.aliasProfiles) > Number(core.sourceProfiles)
        || !sha(core.recipeSha256) || !recipes.has(core.recipeSha256) || !sha(core.plannerSha256)
        || core.sourceProfiles !== preparation.sourceProfiles || core.sourceProfiles !== preparation.expected.profileCount
        || core.aliasProfiles !== preparation.aliasProfiles || core.aliasProfiles !== preparation.expected.aliasProfiles
        || core.nativePlaceFills !== preparation.expected.nativePlaceFills || core.degreeFills !== preparation.expected.degreeFills) invalid();
      let aliases = false;
      const packages = core.executionOrder.map((entry: unknown,index: number): PreparedProfilePackage => {
        if (!object(entry) || entry.index !== index || !["baseline","alias"].includes(String(entry.kind))
          || !Number.isSafeInteger(entry.itemCount) || Number(entry.itemCount) < 1 || Number(entry.itemCount) > 2000
          || !sha(entry.packageSha256) || typeof entry.manifestId !== "string" || entry.manifestId.length > 128
          || !Array.isArray(entry.fields) || entry.fields.some(field => !["nativePlace","degree"].includes(String(field)))) invalid();
        if (entry.kind === "alias") aliases = true;
        if (entry.kind === "baseline" && (aliases || entry.fields.length) || entry.kind === "alias" && !entry.fields.length) invalid();
        return { index, kind: entry.kind as "baseline" | "alias", itemCount: Number(entry.itemCount),fields: entry.fields as string[],packageSha256: entry.packageSha256,manifestId: entry.manifestId };
      });
      if (packages[0]?.kind !== "baseline") invalid();
      if (batches.some(batch => batch.metadata.id === receiptSha256)) invalid();
      batches.push({directory,metadata:{id:receiptSha256,sourceProfiles:Number(core.sourceProfiles),aliasProfiles:Number(core.aliasProfiles),packages}});
      if (batches.length > 8) invalid();
    }
    return batches;
  }
  list(scope: TenantParkScope): PreparedProfileBatch[] {
    try { return this.locate(scope).map(batch => batch.metadata); }
    catch { invalid(); }
  }
  package(scope: TenantParkScope, id: string, index: number): {metadata: PreparedProfileBatch; pkg: YuzhouIncrementalPackage} {
    try {
      if (!sha(id) || !Number.isSafeInteger(index) || index < 0 || index >= 32) throw new NotFoundException("Prepared HR package not found");
      const batch = this.locate(scope).find(entry => entry.metadata.id === id),entry = batch?.metadata.packages[index];
      if (!batch || !entry) throw new NotFoundException("Prepared HR package not found");
      const owner = this.directory(batch.directory);
      const text = this.read(join(batch.directory,`${String(index+1).padStart(4,"0")}-${entry.kind}.json`),owner,8*1024*1024);
      const pkg: unknown = JSON.parse(text);
      if (digest(text) !== entry.packageSha256 || !object(pkg) || pkg.version !== 1 || pkg.sourceSystem !== "yuzhou-v10"
        || pkg.manifestId !== entry.manifestId || !Array.isArray(pkg.items) || pkg.items.length !== entry.itemCount) invalid();
      for (const item of pkg.items) {
        if (!object(item) || item.domain !== "profile" || item.sourceTable !== "dbo.person.core_residue" || !object(item.fields)
          || entry.kind === "baseline" && Object.keys(item.fields).length
          || entry.kind === "alias" && canonical(Object.keys(item.fields).sort()) !== canonical([...entry.fields].sort())) invalid();
      }
      return {metadata:batch.metadata,pkg:pkg as unknown as YuzhouIncrementalPackage};
    } catch (error) { if (error instanceof NotFoundException) throw error; invalid(); }
  }
}
