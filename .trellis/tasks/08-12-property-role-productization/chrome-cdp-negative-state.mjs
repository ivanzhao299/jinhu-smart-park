import fs from "node:fs/promises";
import path from "node:path";
const [port, evidenceDir] = process.argv.slice(2);
await fs.mkdir(evidenceDir, { recursive: true });
const target = await fetch(`http://127.0.0.1:${port}/json/new?http://127.0.0.1:3300/login`, { method: "PUT" }).then(r => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((ok,bad)=>{ws.onopen=ok;ws.onerror=bad});
let id=0; const pending=new Map();
const send=(method,params={})=>new Promise((ok,bad)=>{const n=++id;pending.set(n,{ok,bad});ws.send(JSON.stringify({id:n,method,params}))});
ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.method==="Page.javascriptDialogOpening")void send("Page.handleJavaScriptDialog",{accept:true});const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.bad(m.error):p.ok(m.result)}};
const evaluate=async expression=>{const x=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(x.exceptionDetails)throw new Error(x.exceptionDetails.exception?.description||x.exceptionDetails.text);return x.result.value};
const wait=async(expression,limit=120)=>{for(let i=0;i<limit;i++){try{if(await evaluate(expression))return}catch{}await new Promise(r=>setTimeout(r,250))}throw new Error(`timeout ${expression}`)};
const shot=async name=>{const s=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await fs.writeFile(path.join(evidenceDir,`${name}.png`),s.data,"base64")};
await send("Page.enable"); await send("Runtime.enable"); await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false}); await send("Page.navigate",{url:'http://127.0.0.1:3300/login'}); await wait(`location.origin==='http://127.0.0.1:3300'&&document.readyState!=='loading'`);

const outcome={browser:(await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json())).Browser};
outcome.separation=await evaluate(`(async()=>{
 const login=async username=>(await fetch('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'Jinhu@123456'})}).then(r=>r.json())).data.accessToken;
 const call=async(token,url,body)=>{const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)});return {status:r.status,text:(await r.text()).slice(0,500)}};
 const manager=await login('pr262_manager'), approver=await login('pr262_approver');
 const bogus='11111111-1111-4111-8111-111111111111';
 const managerDecision=await call(manager,'/api/v1/property/approvals/'+bogus+'/decisions',{decision:'approved',reason:'negative acceptance'});
 const approverTransition=await call(approver,'/api/v1/property/units/'+bogus+'/mode-transitions',{toMode:'homestay',reason:'negative acceptance'});
 return {managerDecision,approverTransition};
})()`);

outcome.bundleSetup=await evaluate(`(async()=>{
 const unwrap=async r=>{const j=await r.json();if(!r.ok||j.code!==0)throw new Error(JSON.stringify(j));return j.data};
 const token=await unwrap(await fetch('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'Jinhu@123456'})})).then(x=>x.accessToken);
 localStorage.setItem('jinhu_access_token',token);sessionStorage.setItem('jinhu_access_token',token);
 const me=await unwrap(await fetch('/api/v1/users/me',{headers:{Authorization:'Bearer '+token}}));localStorage.setItem('jinhu_auth_user',JSON.stringify(me));sessionStorage.setItem('jinhu_auth_user',JSON.stringify(me));
 const bundles=await unwrap(await fetch('/api/v1/roles/property-bundles',{headers:{Authorization:'Bearer '+token}}));const b=bundles.find(x=>x.code==='property-bundle:property-asset-manager')||bundles[0];const refs=[{code:b.code,version:b.definitionVersion,hash:b.definitionHash}];
 const preview=await unwrap(await fetch('/api/v1/roles/property-bundles/preview',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({bundles:refs,mode:'merge'})}));
 const role=await unwrap(await fetch('/api/v1/roles/property-bundles/roles',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({code:'PR262_BUNDLE_UI',name:'PR262 权限包验收',bundles:refs,mode:'merge',previewSignature:preview.previewSignature})}));
 const perms=await unwrap(await fetch('/api/v1/permissions?page=1&page_size=100',{headers:{Authorization:'Bearer '+token}}));const items=perms.items||perms;const extra=items.find(x=>!preview.final.some(y=>y.id===x.id));
 await unwrap(await fetch('/api/v1/roles/'+role.id+'/permissions',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({permissionIds:[...preview.final.map(x=>x.id),extra.id]})}));
 return {roleId:role.id,bundle:b.code,extra:{id:extra.id,code:extra.code}};
})()`);
await send("Page.navigate",{url:'http://127.0.0.1:3300/system/roles'}); await wait(`document.body.innerText.includes('PR262 权限包验收')`);
await evaluate(`([...document.querySelectorAll('button')].find(b=>b.textContent.includes('PR262 权限包验收'))).click()`); await wait(`document.body.innerText.includes('PR262_BUNDLE_UI')`);
await evaluate(`([...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='权限包')).click()`); await wait(`document.body.innerText.includes('更新语义')`);
await evaluate(`([...document.querySelectorAll('button')].find(b=>b.textContent.includes('预览差异'))).click()`); await wait(`document.body.innerText.includes('保留额外')&&document.body.innerText.includes('最终权限')`);
outcome.mergePreview=await evaluate(`({text:document.body.innerText.slice(-2200),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth})`); await shot('bundle-merge-preview');
await evaluate(`([...document.querySelectorAll('button')].find(b=>b.textContent.includes('应用权限包'))).click()`); await wait(`document.body.innerText.includes('权限包已应用')`);
outcome.mergeKeptExtra=await evaluate(`(async()=>{const t=localStorage.getItem('jinhu_access_token');const setup=${JSON.stringify(outcome.bundleSetup)};const unwrap=async r=>(await r.json()).data;const all=await unwrap(await fetch('/api/v1/roles/property-bundles',{headers:{Authorization:'Bearer '+t}}));const b=all.find(x=>x.code===setup.bundle);const p=await unwrap(await fetch('/api/v1/roles/'+setup.roleId+'/property-bundles/preview',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json','X-Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({bundles:[{code:b.code,version:b.definitionVersion,hash:b.definitionHash}],mode:'merge'})}));return {keepExtra:p.keepExtra.map(x=>x.code),kept:p.keepExtra.some(x=>x.id===setup.extra.id)}})()`);
await evaluate(`(()=>{const s=[...document.querySelectorAll('select')].find(x=>x.parentElement?.innerText.includes('更新语义'));s.value='sync';s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
await evaluate(`([...document.querySelectorAll('button')].find(b=>b.textContent.includes('预览差异'))).click()`); await wait(`document.body.innerText.includes('提交前将再次确认删除集合')`); outcome.syncPreview=await evaluate(`({text:document.body.innerText.slice(-2200)})`); await shot('bundle-sync-preview');
await evaluate(`([...document.querySelectorAll('button')].find(b=>b.textContent.includes('应用权限包'))).click()`); await wait(`document.body.innerText.includes('权限包已应用')`); await shot('bundle-sync-applied');
outcome.syncRemovedExtra=await evaluate(`(async()=>{const t=localStorage.getItem('jinhu_access_token');const setup=${JSON.stringify(outcome.bundleSetup)};const unwrap=async r=>(await r.json()).data;const all=await unwrap(await fetch('/api/v1/roles/property-bundles',{headers:{Authorization:'Bearer '+t}}));const b=all.find(x=>x.code===setup.bundle);const p=await unwrap(await fetch('/api/v1/roles/'+setup.roleId+'/property-bundles/preview',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json','X-Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({bundles:[{code:b.code,version:b.definitionVersion,hash:b.definitionHash}],mode:'merge'})}));return {keepExtra:p.keepExtra.map(x=>x.code),removed:!p.keepExtra.some(x=>x.id===setup.extra.id)}})()`);

outcome.invalidation=await evaluate(`(async()=>{
 const unwrap=async r=>(await r.json()).data; const login=async username=>(await unwrap(await fetch('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'Jinhu@123456'})}))).accessToken;
 const manager=await login('pr262_manager'), admin=await login('admin'); const me=await unwrap(await fetch('/api/v1/users/me',{headers:{Authorization:'Bearer '+manager}}));localStorage.setItem('jinhu_access_token',manager);sessionStorage.setItem('jinhu_access_token',manager);localStorage.setItem('jinhu_auth_user',JSON.stringify(me));sessionStorage.setItem('jinhu_auth_user',JSON.stringify(me));
 await new Promise((ok,bad)=>{const q=indexedDB.open('jinhu-property-drafts-v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('drafts',{keyPath:'key'});q.onsuccess=()=>{q.result.close();ok()};q.onerror=()=>bad(q.error)});
 const role=me.roles.find(x=>x.endsWith('_NEGATIVE')); const catalog=await unwrap(await fetch('/api/v1/roles?page=1&page_size=100',{headers:{Authorization:'Bearer '+admin}}));const row=catalog.items.find(x=>x.code===role);
 const disabled=await fetch('/api/v1/roles/'+row.id+'/disable',{method:'POST',headers:{Authorization:'Bearer '+admin,'X-Idempotency-Key':crypto.randomUUID()}});return {roleId:row.id,disableStatus:disabled.status};
})()`);
await send("Page.navigate",{url:'http://127.0.0.1:3300/assets/property-operations'}); await wait(`location.pathname==='/403'||location.pathname==='/login'`,160); await new Promise(r=>setTimeout(r,500));
outcome.afterDisable=await evaluate(`(async()=>({url:location.href,text:document.body.innerText.slice(0,1200),databases:(await indexedDB.databases()).map(x=>x.name)}))()`); await shot('role-disabled-session-rehydrated');
await evaluate(`(async()=>{const l=await fetch('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'Jinhu@123456'})}).then(r=>r.json());return fetch('/api/v1/roles/${outcome.invalidation.roleId}/enable',{method:'POST',headers:{Authorization:'Bearer '+l.data.accessToken,'X-Idempotency-Key':crypto.randomUUID()}}).then(r=>r.status)})()`);
await fs.writeFile(path.join(evidenceDir,'negative-state-summary.json'),JSON.stringify(outcome,null,2)+'\n');console.log(JSON.stringify(outcome,null,2));ws.close();
