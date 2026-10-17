import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const [snapshotPath,inventoryPath]=process.argv.slice(2);if(!snapshotPath||!inventoryPath)throw new Error('Pass reviewed schema-only snapshot and inventory paths');
const source=readFileSync(snapshotPath,'utf8'),inventory=JSON.parse(readFileSync(inventoryPath,'utf8')),sha=s=>createHash('sha256').update(s).digest('hex');
if(sha(source)!==inventory.schemaSha256)throw new Error('Reviewed snapshot checksum mismatch');
const core=['sys_tenant','sys_user','sys_org','sys_post','rel_user_org','sys_role','rel_user_role','sys_permission','rel_role_perm','rel_role_field_perm','sys_field_policy','rel_role_field_policy','sys_data_scope_rule','rel_role_data_scope','sys_auth_login_ticket','sys_auth_oauth_state','sys_auth_otp_code','sys_auth_policy','sys_auth_refresh_token','sys_user_identity','sys_file','sys_login_log','sys_op_log','sys_idempotency_request','biz_user_message','sys_dict_type','sys_dict_item','sys_code_rule'];
const tables=new Set([...inventory.requiredDeclaredClosure,...core.map(n=>'public.'+n)]);
if([...tables].some(t=>!/^public\.(hr_|migration_|legacy_|sys_|rel_role_|rel_user_|biz_user_message)/.test(t)))throw new Error('Unreviewed independent relation');
const blocks=source.split(/(?=^--\n-- Name: )/m).map(text=>{const header=text.match(/^--\n-- Name: (.*?); Type: ([^;]+); Schema: ([^;]+); Owner: [^\n]*\n/m);return{ text,name:header?.[1],type:header?.[2],schema:header?.[3]};});
const relations=b=>[...b.text.matchAll(/\bpublic\.([a-z_][a-z0-9_]*)/g)].map(m=>'public.'+m[1]);
const belongs=b=>{const patterns=b.type==='SEQUENCE OWNED BY'?[/OWNED BY public\.([a-z_][a-z0-9_]*)/]:b.type==='INDEX'?[/\bON public\.([a-z_][a-z0-9_]*)/]:b.type==='TRIGGER'?[/\bON public\.([a-z_][a-z0-9_]*)/]:[/ALTER TABLE (?:ONLY )?public\.([a-z_][a-z0-9_]*)/];return patterns.some(pattern=>{const owner=b.text.match(pattern);return owner&&tables.has('public.'+owner[1]);});};
const functionBlocks=blocks.filter(b=>['FUNCTION','PROCEDURE'].includes(b.type)),functions=new Set(functionBlocks.filter(b=>b.schema==='public'&&b.name?.startsWith('hr_')).map(b=>b.name.split('(')[0]));
for(const b of blocks.filter(b=>b.type==='TRIGGER'&&belongs(b))){for(const m of b.text.matchAll(/EXECUTE (?:FUNCTION|PROCEDURE) public\.([a-z_][a-z0-9_]*)\(/g))functions.add(m[1]);}
let changed=true;while(changed){changed=false;for(const b of functionBlocks.filter(b=>functions.has(b.name.split('(')[0]))){for(const candidate of functionBlocks){const name=candidate.name.split('(')[0];if(candidate.schema==='public'&&!functions.has(name)&&new RegExp('\\b'+name+'\\s*\\(').test(b.text)){functions.add(name);changed=true;}}}}
const sequences=new Set();for(const b of blocks.filter(b=>b.type==='SEQUENCE OWNED BY'&&belongs(b)))for(const m of b.text.matchAll(/ALTER SEQUENCE public\.([a-z_][a-z0-9_]*)/g))sequences.add(m[1]);
const selected=blocks.filter(b=>{
 if(b.type==='EXTENSION')return true;
 if(b.schema!=='public')return false;
 if(b.type==='TABLE')return tables.has('public.'+b.name);
 if(['FUNCTION','PROCEDURE'].includes(b.type))return functions.has(b.name.split('(')[0]);
 if(b.type==='SEQUENCE')return sequences.has(b.name);
 if(['CONSTRAINT','FK CONSTRAINT','INDEX','TRIGGER','DEFAULT','SEQUENCE OWNED BY'].includes(b.type))return belongs(b);
 return false;
});
for(const b of selected.filter(b=>b.type==='FK CONSTRAINT'))for(const m of b.text.matchAll(/REFERENCES public\.([a-z_][a-z0-9_]*)/g))if(!tables.has('public.'+m[1]))throw new Error('Independent FK escapes selection: '+m[1]);
const header=`-- Generated reviewed HR/core schema only; source ${inventory.codeSha}\n-- Snapshot SHA256 ${sha(source)}. No business rows, no full park migration execution.\nSET check_function_bodies=false;\nCREATE EXTENSION IF NOT EXISTS pgcrypto;\nCREATE EXTENSION IF NOT EXISTS "uuid-ossp";\nCREATE EXTENSION IF NOT EXISTS btree_gist;\n`;
const sql=header+selected.map(b=>b.text.replace(/^\\(?:un)?restrict[^\n]*\n/gm,'')).join('\n');
const output=resolve('database/hr-enterprise/000001_kernel.sql');writeFileSync(output,sql);
writeFileSync(resolve('database/hr-enterprise/kernel-manifest.json'),JSON.stringify({formatVersion:1,runtimeMode:'hr_enterprise',sourceCodeSha:inventory.codeSha,sourceSnapshotSha256:sha(source),kernelSha256:sha(sql),relations:[...tables].sort(),objects:selected.map(b=>({schema:b.schema,type:b.type,name:b.name})),functionNames:[...functions].sort(),coreRelations:core,excluded:['biz_park','asset_park','rel_user_park','assets/leasing/safety/housing/canteen/iot business tables'],generationCommand:'node scripts/hr-enterprise/generate-schema.mjs <reviewed schema-only snapshot> <reviewed inventory>',businessRows:false},null,2)+'\n');
console.log(JSON.stringify({relations:tables.size,objects:selected.length,functions:functions.size,bytes:Buffer.byteLength(sql),kernelSha256:sha(sql)}));
