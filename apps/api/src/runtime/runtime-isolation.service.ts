import {Injectable,OnApplicationBootstrap} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {DataSource} from 'typeorm';
import {mkdir,realpath,stat,readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {applicationRuntimeMode} from './runtime-mode';
@Injectable()
export class RuntimeIsolationService implements OnApplicationBootstrap {
 constructor(private readonly db:DataSource,private readonly config:ConfigService){}
 async onApplicationBootstrap(){
  const mode=applicationRuntimeMode(this.config),[catalog]=await this.db.query("SELECT to_regclass('public.sys_hr_runtime_schema') marker,to_regclass('public.biz_park') park,to_regclass('public.asset_park') asset");
  if(mode==='integrated'){if(catalog.marker)throw new Error('Independent HR database cannot start integrated runtime');const root=this.config.get<string>('FILE_STORAGE_LOCAL_ROOT','storage/files');{try{await stat(resolve(root,'.jinhu-hr-enterprise-root.json'));throw new Error('Independent HR file root cannot start integrated runtime');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}return;}
  if(!catalog.marker||catalog.park||catalog.asset)throw new Error('Independent HR schema isolation unavailable');
  const rows=await this.db.query("SELECT schema_version FROM sys_hr_runtime_schema WHERE runtime_mode='hr_enterprise'");if(rows.length!==1||rows[0].schema_version!==1)throw new Error('Unsupported independent HR schema version');
  const fileRoot=this.config.getOrThrow<string>('FILE_STORAGE_LOCAL_ROOT');await mkdir(fileRoot,{recursive:true,mode:0o700});if(await realpath(fileRoot)!==resolve(fileRoot)||(await stat(fileRoot)).isDirectory()!==true)throw new Error('Independent HR file root must be a dedicated real directory');
  const marker=resolve(fileRoot,'.jinhu-hr-enterprise-root.json'),identity=createHash('sha256').update(JSON.stringify([this.config.get('POSTGRES_HOST','localhost'),String(this.config.get('POSTGRES_PORT',5432)),this.config.getOrThrow('POSTGRES_DB')])).digest('hex');
  try{const saved=JSON.parse(await readFile(marker,'utf8'));if(saved.runtimeMode!=='hr_enterprise'||saved.databaseIdentity!==identity)throw new Error('Independent HR file root belongs to another runtime/database');}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;if((await readdir(fileRoot)).length)throw new Error('Independent HR file root must be empty before first startup');await writeFile(marker,JSON.stringify({runtimeMode:'hr_enterprise',databaseIdentity:identity})+'\n',{flag:'wx',mode:0o600});}

 }
}
