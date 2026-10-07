import { ConflictException, ForbiddenException, Injectable, ValidationPipe } from "@nestjs/common";
import { createHash } from "node:crypto";
import { DataSource } from "typeorm";
import { canonicalYuzhouIncrementalPackage, HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PreviewYuzhouIncrementalImportDto } from "./dto/yuzhou-incremental-import.dto";
import { HrYuzhouIncrementalImportService } from "./hr-yuzhou-incremental-import.service";
import { HrPreparedProfileBatchRepository } from "./hr-prepared-profile-batch.repository";

const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`;

@Injectable()
export class HrPreparedProfileBatchService {
  private readonly validation = new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true});
  constructor(private readonly repository: HrPreparedProfileBatchRepository,private readonly imports: HrYuzhouIncrementalImportService,private readonly db: DataSource) {}
  private permission(actor: JwtPrincipal) {
    if (!actor.isSuper && !actor.permissions.includes("*") && !actor.permissions.includes(HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE)) {
      throw new ForbiddenException("Profile import management permission required");
    }
  }
  private async status(scope: TenantParkScope,id:string,index:number) {
    const {pkg} = this.repository.package(scope,id,index);
    const hash = createHash("sha256").update(canonical(canonicalYuzhouIncrementalPackage(pkg))).digest("hex");
    const rows = await this.db.query(`SELECT id,status,conflict_count FROM hr_incremental_import_operation
      WHERE tenant_id=$1 AND park_id=$2 AND source_system='yuzhou-v10' AND package_sha256=$3`,[scope.tenantId,scope.parkId,hash]) as Array<{id:string;status:string;conflict_count:number}>;
    return rows[0] ?? null;
  }
  async list(scope: TenantParkScope,actor: JwtPrincipal) {
    this.permission(actor);
    const result=[];
    for (const batch of this.repository.list(scope)) {
      const packages=[];let precedingComplete=true;
      for (const entry of batch.packages) {
        const status=await this.status(scope,batch.id,entry.index);
        packages.push({...entry,operationId:status?.id??null,status:status?.status??"ready",canPreview:precedingComplete});
        precedingComplete=precedingComplete && status?.status==="committed" && Number(status.conflict_count)===0;
      }
      result.push({...batch,packages});
    }
    return result;
  }
  async preview(scope: TenantParkScope,actor: JwtPrincipal,id:string,index:number) {
    this.permission(actor);
    const {pkg}=this.repository.package(scope,id,index);
    for (let previous=0;previous<index;previous++) {
      const status=await this.status(scope,id,previous);
      if (status?.status!=="committed" || Number(status.conflict_count)!==0) throw new ConflictException("Previous prepared package must be committed without conflicts");
    }
    const dto=await this.validation.transform(pkg,{type:"body",metatype:PreviewYuzhouIncrementalImportDto}) as PreviewYuzhouIncrementalImportDto;
    // Existing service rechecks per-item source ownership, permissions, original certificate and current versions.
    const result: Record<string,unknown> = await this.imports.preview(scope,actor,dto);
    const safe: Record<string,unknown> = {};
    for (const key of ["id","status","packageSha256","itemCount","appliedCount","unchangedCount","conflictCount"]) {
      if (result[key] !== undefined) safe[key] = result[key];
    }
    if (Array.isArray(result.plan)) safe.plan = result.plan.map(row => ({action:(row as {action:string}).action}));
    return safe;
  }
}
