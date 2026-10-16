import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {chmodSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {DataSource} from 'typeorm';
import {IdempotencyRequestEntity} from '../../../shared/entities/idempotency-request.entity';
import {OpLogEntity} from '../../audit/entities/op-log.entity';
import {LoginLogEntity} from '../../audit/entities/login-log.entity';
const root=resolve(__dirname,'../../../../../..');

export class HrEmployeeFeedbackFixture {
 readonly name=`hr-employee-feedback-${randomUUID()}`;readonly database=`jinhu_hr_migration_lab_feedback_${randomUUID().replaceAll('-','').slice(0,12)}`;
 readonly artifact=mkdtempSync(resolve(tmpdir(),'jinhu-employee-feedback-'));
 readonly compose=resolve(this.artifact,this.name+'.yaml');db!:DataSource;attempted=false;
 docker(...args:string[]){return execFileSync('docker',args,{encoding:'utf8',timeout:30000,maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe']}).trim();}
 async start(){
  try{chmodSync(this.artifact,0o700);console.log(`Owned PG evidence ${this.artifact}`);writeFileSync(this.compose,`services:\n  postgres:\n    image: postgres:16-alpine\n    container_name: ${this.name}\n    labels:\n      jinhu.hr-employee-feedback: ${this.name}\n    tmpfs:\n      - /var/lib/postgresql/data\n    environment:\n      POSTGRES_USER: jinhu\n      POSTGRES_HOST_AUTH_METHOD: trust\n      POSTGRES_DB: ${this.database}\n    ports:\n      - 127.0.0.1::5432\n`.replaceAll('\\n','\n'),{mode:0o600});this.attempted=true;this.docker('compose','-p',this.name,'-f',this.compose,'up','-d');
   for(let i=0;;i++){try{this.docker('exec',this.name,'pg_isready','-h','127.0.0.1','-U','jinhu','-d',this.database);break;}catch(e){if(i===100)throw e;await new Promise(r=>setTimeout(r,100));}}
   let migrationOutput='';try{migrationOutput=execFileSync('sh',['scripts/db-migrate.sh'],{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:128*1024*1024,env:{...process.env,COMPOSE_FILE:this.compose,COMPOSE_PROJECT_NAME:this.name,POSTGRES_USER:'jinhu',POSTGRES_DB:this.database,MIGRATION_EXECUTED_BY:'owned-employee-feedback-fixture',MIGRATION_BASELINE_ON_NONEMPTY_DB:'no'}});}catch(e){const failure=e as {stdout?:string;stderr?:string};migrationOutput=String(failure.stdout??'')+String(failure.stderr??'');throw e;}finally{writeFileSync(resolve(this.artifact,this.name+'-migrations.log'),migrationOutput,{mode:0o600});}
   const port=Number(this.docker('port',this.name,'5432/tcp').split(':').pop());this.db=new DataSource({type:'postgres',host:'127.0.0.1',port,username:'jinhu',database:this.database,logging:['error'],logger:{logQueryError:(error)=>console.error('Owned SQL boundary:',error),logQuery:()=>{},logQuerySlow:()=>{},logSchemaBuild:()=>{},logMigration:()=>{},log:()=>{}},entities:[IdempotencyRequestEntity,OpLogEntity,LoginLogEntity]});await this.db.initialize();console.log(`Owned full migration PG ${this.name}`);return this;
  }catch(e){await this.close();throw e;}
 }
 async close(){try{if(this.db?.isInitialized)await this.db.destroy();}finally{if(this.attempted&&this.docker('ps','-aq','--filter',`name=^/${this.name}$`)){assert.equal(this.docker('inspect','--format','{{index .Config.Labels "jinhu.hr-employee-feedback"}}',this.name),this.name);this.docker('compose','-p',this.name,'-f',this.compose,'down','-v','--remove-orphans');assert.equal(this.docker('ps','-aq','--filter',`name=^/${this.name}$`),'');console.log(`Owned full migration PG removed ${this.name}`);}}}
}
