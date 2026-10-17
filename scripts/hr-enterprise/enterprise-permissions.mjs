import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const catalog=JSON.parse(readFileSync(new URL('../../database/hr-enterprise/permission-catalog.json',import.meta.url),'utf8'));
/** Explicit initial enterprise administrator setup; never a default migration or automatic role expansion. */
export async function seedEnterprisePermissions(db,tenantId,scopeKey,roleId,coreSeeds){
 const definitions=[...new Map([...catalog.permissions,...coreSeeds].map(p=>[p.code,p])).values()];
 for(const p of definitions){const route=p.code==='system:user:list'?'/enterprise':p.route??null;const {rows:[permission]}=await db.query("INSERT INTO sys_permission(id,tenant_id,park_id,code,name,resource,action,frontend_route,permission_type,perm_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(tenant_id,code) WHERE is_deleted=false DO UPDATE SET name=EXCLUDED.name,frontend_route=EXCLUDED.frontend_route RETURNING id",[randomUUID(),tenantId,scopeKey,p.code,p.name,p.resource,p.action,route,route?'menu':'api',route?20:40]);await db.query('INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id) SELECT $1::varchar,$2::varchar,$3::uuid,$4::uuid WHERE NOT EXISTS(SELECT 1 FROM rel_role_perm WHERE tenant_id=$1 AND park_id=$2 AND role_id=$3 AND permission_id=$4 AND NOT is_deleted)',[tenantId,scopeKey,roleId,permission.id]);}
 return definitions.length;
}
