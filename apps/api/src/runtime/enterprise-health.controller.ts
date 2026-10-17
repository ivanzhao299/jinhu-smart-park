import {Controller,Get,ServiceUnavailableException} from '@nestjs/common';
import {DataSource} from 'typeorm';
import {Public} from '../shared/decorators/public.decorator';
import {SkipResponseWrap} from '../shared/decorators/skip-response-wrap.decorator';
@Controller()
export class EnterpriseHealthController{
 constructor(private readonly db:DataSource){}
 @Public() @Get('tenants/public/branding') branding(){return{systemName:'企业人力资源管理',shortName:'企业 HR',logoAlt:'企业 HR',logoFileId:null,logoUrl:null,configured:true,runtime_mode:'hr_enterprise'};}
 @Public() @Get('health') @SkipResponseWrap() health(){return{status:'ok',service:'jinhu-hr',runtime_mode:'hr_enterprise'};}
 @Public() @Get('version') @SkipResponseWrap() version(){return{version:process.env.APP_VERSION??'development',runtime_mode:'hr_enterprise'};}
 @Public() @Get('ready') @SkipResponseWrap() async ready(){try{const rows=await this.db.query("SELECT schema_version FROM sys_hr_runtime_schema WHERE schema_version=1 AND runtime_mode='hr_enterprise'");if(rows.length!==1)throw new Error('Independent HR schema unavailable');return{status:'ready',service:'jinhu-hr',runtime_mode:'hr_enterprise'};}catch{throw new ServiceUnavailableException('Independent HR database unavailable');}}
}
