import {seedEnterprisePermissions} from './enterprise-permissions.mjs';
import {seedEnterpriseCatalog} from './enterprise-catalog.mjs';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(resolve(root,'apps/api/package.json')),{Client}=require('pg'),bcrypt=require('bcrypt');
const {SYSTEM_PERMISSION_SEEDS,enterpriseStorageScopeKey}=createRequire(resolve(root,'packages/shared/package.json'))('./dist');
if(process.env.APP_RUNTIME_MODE!=='hr_enterprise'||process.env.HR_ENTERPRISE_BOOTSTRAP!=='yes')throw new Error('Explicit independent enterprise bootstrap required');
const input=JSON.parse(readFileSync(0,'utf8'));if(!input||Object.keys(input).sort().join(',')!=='enterpriseCode,enterpriseName,password,tenantId,username'||!Object.values(input).every(v=>typeof v==='string'&&v.trim()&&!v.includes('\0'))||input.password.length<12||input.password.length>128||!/^[A-Za-z0-9_-]{1,64}$/.test(input.tenantId)||!/^[A-Za-z0-9_-]{1,64}$/.test(input.enterpriseCode)||input.enterpriseName.length>100||input.username.length>64)throw new Error('Strict enterprise bootstrap input required on stdin; password length12..128');
const passwordHash=await bcrypt.hash(input.password,12),enterpriseId=randomUUID(),scopeKey=enterpriseStorageScopeKey(enterpriseId),userId=randomUUID(),roleId=randomUUID();
const db=new Client({host:process.env.POSTGRES_HOST??'127.0.0.1',port:Number(process.env.POSTGRES_PORT??5432),user:process.env.POSTGRES_USER??'jinhu',password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB});await db.connect();
try{
 await db.query('BEGIN');const {rows:[marker]}=await db.query("SELECT runtime_mode FROM sys_hr_runtime_schema WHERE runtime_mode='hr_enterprise'");if(!marker)throw new Error('Independent HR schema required');
 const {rows:[tenant]}=await db.query("INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name,tenant_type) VALUES($1,$1,$2,'enterprise') RETURNING id",[input.tenantId,input.enterpriseName]);
 await db.query("INSERT INTO sys_business_scope(id,tenant_row_id,tenant_id,scope_kind,scope_code,scope_name) VALUES($1,$2,$3,'enterprise',$4,$5)",[enterpriseId,tenant.id,input.tenantId,input.enterpriseCode,input.enterpriseName]);
 await db.query("INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status) VALUES($1,$2,$3,$4,$4,$5,'enabled')",[userId,input.tenantId,scopeKey,input.username,passwordHash]);
 await db.query('INSERT INTO sys_user_business_scope_membership(tenant_id,scope_id,user_id) VALUES($1,$2,$3)',[input.tenantId,enterpriseId,userId]);
 await db.query("INSERT INTO sys_role(id,tenant_id,park_id,code,name,status,role_scope,data_scope) VALUES($1,$2,$3,'HR_ENTERPRISE_ADMIN','企业 HR 管理员','enabled','park','park')",[roleId,input.tenantId,scopeKey]);
 await db.query('INSERT INTO rel_user_role(tenant_id,park_id,user_id,role_id) VALUES($1,$2,$3,$4)',[input.tenantId,scopeKey,userId,roleId]);
 const core=new Set(['system:user:me','system:org:list','system:org:detail','system:org:create','system:org:update','system:org:delete','system:user:list','system:user:create','system:user:update','system:user:assign-roles','system:role:list','system:role:create','system:role:update','system:role:assign-permissions','system:field-policy:read','system:field-policy:create','system:field-policy:update','system:field-policy:assign','system:data-scope:read','system:data-scope:create','system:data-scope:update','system:data-scope:assign','file:read','file:upload','file:delete','workflow:read','workflow:manage']);
 const permissionCount=await seedEnterprisePermissions(db,input.tenantId,scopeKey,roleId,SYSTEM_PERMISSION_SEEDS.filter(p=>core.has(p.code)));
 for(const module of ['hr','system','workflow'])await db.query('INSERT INTO sys_business_scope_module(tenant_id,scope_id,module_code) VALUES($1,$2,$3)',[input.tenantId,enterpriseId,module]);
 await seedEnterpriseCatalog(db,input.tenantId,scopeKey);
 await db.query('UPDATE sys_tenant SET contact_user_id=$2 WHERE id=$1',[tenant.id,userId]);await db.query('COMMIT');console.log(JSON.stringify({enterpriseId,scopeKey,userId,roleId,permissionCount}));
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
