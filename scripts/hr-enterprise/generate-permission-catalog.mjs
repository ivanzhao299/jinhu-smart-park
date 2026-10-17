import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{SYSTEM_PERMISSION_SEEDS,HR_ENTERPRISE_PAGE_ROUTES,HR_ENTERPRISE_PAGE_LABELS}=require('../../packages/shared/dist');
const catalog=new Map(SYSTEM_PERMISSION_SEEDS.filter(p=>p.code.startsWith('hr:')).map(p=>[p.code,{...p,route:HR_ENTERPRISE_PAGE_ROUTES[p.code]??null}])),sources=[];
for(const file of readdirSync('database/seeds/production').filter(n=>n.endsWith('.sql')).sort()){
 const path='database/seeds/production/'+file,sql=readFileSync(path,'utf8');let found=false;
 for(const m of sql.matchAll(/\(\s*'(hr:[^']+)'\s*,\s*'((?:[^']|'')+)'(?:\s*,\s*'(page|api|menu)'\s*,\s*(?:'([^']*)'|NULL))?/g)){
  found=true;const old=catalog.get(m[1]);catalog.set(m[1],{code:m[1],name:m[2].replaceAll("''","'"),resource:old?.resource??'hr',action:old?.action??m[3]??'api',route:HR_ENTERPRISE_PAGE_ROUTES[m[1]]??m[4]??old?.route??null});
 }
 if(found)sources.push({file:path,sha256:createHash('sha256').update(sql).digest('hex')});
}
for(const p of catalog.values()){p.route=HR_ENTERPRISE_PAGE_ROUTES[p.code]??null;if(HR_ENTERPRISE_PAGE_LABELS[p.code])p.name=HR_ENTERPRISE_PAGE_LABELS[p.code];}
writeFileSync('database/hr-enterprise/permission-catalog.json',JSON.stringify({formatVersion:1,sources,permissions:[...catalog.values()].sort((a,b)=>a.code.localeCompare(b.code))},null,2)+'\n');console.log('Canonical HR permission metadata',catalog.size,'source files',sources.length);
