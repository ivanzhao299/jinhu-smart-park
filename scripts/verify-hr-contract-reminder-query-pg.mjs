#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const containers=new Map([
 ["jinhu_hr_migration_lab_import_20261001_a","55491"],
 ["jinhu_hr_migration_lab_import_20261001_b","55492"]
]);
const args=process.argv.slice(2);
const account=args.includes("--account-link");
const positional=args.filter(arg=>arg!=="--account-link");
const container=positional[0]??"jinhu_hr_migration_lab_import_20261001_a";
if(positional.length>1||args.filter(arg=>arg==="--account-link").length>1||!containers.has(container))throw new Error("Only the existing isolated import labs are supported");
const port=containers.get(container);
const docker=(args)=>{
 const result=spawnSync("docker",args,{encoding:"utf8",timeout:10_000});
 if(result.status!==0)throw new Error("Isolated PostgreSQL lab inspection failed");
 return result.stdout.trim();
};
if(docker(["port",container,"5432/tcp"])!==`127.0.0.1:${port}`)throw new Error("Isolated PostgreSQL loopback port mismatch");
// Credentials exist only in this process and the test child's environment; never print or persist them.
const config=JSON.parse(docker(["inspect","--format","{{json .Config.Env}}",container]));
const credentials=Object.fromEntries(config.filter(value=>value.startsWith("POSTGRES_")).map(value=>{
 const separator=value.indexOf("=");return [value.slice(0,separator),value.slice(separator+1)];
}));
const result=spawnSync(process.execPath,["--test","--require","ts-node/register",account?"src/modules/hr/hr-employee-account-link.pg.spec.ts":"src/modules/hr/hr-contract-reminder-query.pg.spec.ts"],{
 cwd:fileURLToPath(new URL("../apps/api/",import.meta.url)),encoding:"utf8",timeout:90_000,
 env:{...process.env,...credentials,POSTGRES_HOST:"127.0.0.1",POSTGRES_PORT:port,POSTGRES_DB:"postgres",
  HR_CONTRACT_REMINDER_QUERY_PG_REQUIRED:account?"0":"1",HR_EMPLOYEE_ACCOUNT_LINK_PG_REQUIRED:account?"1":"0",TS_NODE_TRANSPILE_ONLY:"true",
  TS_NODE_COMPILER_OPTIONS:JSON.stringify({module:"CommonJS",moduleResolution:"node",experimentalDecorators:true,emitDecoratorMetadata:true})}
});
process.stdout.write(result.stdout??"");process.stderr.write(result.stderr??"");
process.exitCode=result.status??1;
