import fs from "node:fs/promises";
import path from "node:path";
const [port, evidenceDir] = process.argv.slice(2);
await fs.mkdir(evidenceDir, { recursive: true });
const cases = [
  ["pr262_manager", "/assets/property-operations", "房源经营配置"],
  ["pr262_approver", "/assets/property-occupancies", "房源占用管理"],
  ["pr262_homestay", "/homestay/tasks", "岗位任务"],
  ["pr262_housing", "/housing/tasks", "任务中心"],
  ["pr262_hsfinance", "/homestay/finance", "财务"],
  ["pr262_hofinance", "/housing/finance", "财务子账"],
  ["pr262_auditor", "/assets/property-mode-transitions", "经营模式审计"]
];
const results = [];
for (const [username, route, expectedText] of cases) {
  const target = await fetch(`http://127.0.0.1:${port}/json/new?http://127.0.0.1:3300/login`, { method: "PUT" }).then(r => r.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((ok, bad) => { ws.onopen=ok; ws.onerror=bad; });
  let id=0; const pending=new Map(); ws.onmessage=({data})=>{const m=JSON.parse(data);const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.bad(m.error):p.ok(m.result)}};
  const send=(method,params={})=>new Promise((ok,bad)=>{const n=++id;pending.set(n,{ok,bad});ws.send(JSON.stringify({id:n,method,params}))});
  const evalJs=async expression=>(await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true})).result.value;
  const wait=async expression=>{for(let i=0;i<120;i++){if(await evalJs(expression))return;await new Promise(r=>setTimeout(r,250))}throw new Error(`${username}: timeout`)};
  await send("Page.enable"); await send("Runtime.enable");
  await wait(`document.readyState !== 'loading'`);
  const me=await evalJs(`(async()=>{const l=await fetch('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:${JSON.stringify(username)},password:'Jinhu@123456'})}).then(r=>r.json());const t=l.data.accessToken;const m=await fetch('/api/v1/users/me',{headers:{Authorization:'Bearer '+t}}).then(r=>r.json());localStorage.setItem('jinhu_access_token',t);sessionStorage.setItem('jinhu_access_token',t);localStorage.setItem('jinhu_auth_user',JSON.stringify(m.data));sessionStorage.setItem('jinhu_auth_user',JSON.stringify(m.data));return m.data})()`);
  for (const [label,width,height,mobile] of [["desktop",1440,900,false],["mobile390",390,844,true]]) {
    await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile,screenWidth:width,screenHeight:height});
    await send("Page.navigate",{url:`http://127.0.0.1:3300${route}`}); await wait(`document.readyState !== 'loading'`); await new Promise(r=>setTimeout(r,900));
    const dom=await evalJs(`(()=>({url:location.href,text:document.body.innerText.slice(0,3500),width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}))()`);
    const shot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false}); await fs.writeFile(path.join(evidenceDir,`${username}-${label}.png`),shot.data,"base64");
    results.push({username,label,roleCodes:me.roles,isSuper:me.is_super,route,actualUrl:dom.url,expectedText,hasExpectedText:dom.text.includes(expectedText),forbidden:dom.text.includes('403')||dom.text.includes('无权访问'),overflow:dom.overflow,width:dom.width,scrollWidth:dom.scrollWidth,text:dom.text.slice(0,800)});
  }
  ws.close();
}
await fs.writeFile(path.join(evidenceDir,"non-super-role-matrix.json"),JSON.stringify(results,null,2)+"\n");
console.log(JSON.stringify(results,null,2));
