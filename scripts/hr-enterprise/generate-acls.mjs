import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const input=process.argv[2];if(!input)throw new Error('Pass reviewed integrated PostgreSQL function ACL catalog');
const manifest=JSON.parse(readFileSync('database/hr-enterprise/kernel-manifest.json','utf8')),names=new Set(manifest.functionNames),rows=JSON.parse(readFileSync(input,'utf8')).filter(r=>names.has(r.name));
if(rows.length!==manifest.objects.filter(o=>o.type==='FUNCTION'||o.type==='PROCEDURE').length)throw new Error('Complete exact selected function ACL catalog required');
const identifier=s=>'"'+s.replaceAll('"','""')+'"';
const roles=[...new Set(rows.flatMap(r=>r.grants.filter(g=>g.grantee!=='PUBLIC'&&g.grantee!=='jinhu').map(g=>g.grantee)))].sort();
if(roles.some(r=>!/^jinhu_hr_yuzhou_[a-z_]+$/.test(r)))throw new Error('Unreviewed independent function grantee');
let sql='-- Generated from the fully migrated integrated synthetic catalog; no role membership or business grants.\nBEGIN;\n';
for(const role of roles)sql+=`DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${identifier(role)} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; END IF; END$$;\n`;
for(const row of rows){if(!/^[a-z_][a-z0-9_]*\([a-z0-9_ ,\[\]\.]*\)$/.test(row.signature))throw new Error('Unexpected function signature');const signature='public.'+row.signature;sql+=`REVOKE ALL ON ROUTINE ${signature} FROM PUBLIC;\n`;for(const grant of row.grants.filter(g=>g.grantee!=='jinhu')){if(grant.privilege!=='EXECUTE')throw new Error('Unexpected function privilege');sql+=`GRANT EXECUTE ON ROUTINE ${signature} TO ${grant.grantee==='PUBLIC'?'PUBLIC':identifier(grant.grantee)}${grant.grantable?' WITH GRANT OPTION':''};\n`;}}
sql+='COMMIT;\n';writeFileSync('database/hr-enterprise/000004_function_acls.sql',sql);
writeFileSync('database/hr-enterprise/function-acl-manifest.json',JSON.stringify({sourceCodeSha:manifest.sourceCodeSha,sourceCatalogSha256:createHash('sha256').update(readFileSync(input)).digest('hex'),functionCount:rows.length,roles,functions:rows.map(r=>({signature:r.signature,routineKind:r.routineKind,securityDefiner:r.security_definer,config:r.config,grants:r.grants.filter(g=>g.grantee!=='jinhu')}))},null,2)+'\n');
console.log('Generated complete selected function ACL policy:',rows.length,'functions;',roles.length,'NOLOGIN capability roles; no memberships');
