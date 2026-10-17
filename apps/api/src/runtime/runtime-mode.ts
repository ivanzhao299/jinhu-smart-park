import type {ConfigService} from '@nestjs/config';
export type ApplicationRuntimeMode='integrated'|'hr_enterprise';
export function parseApplicationRuntimeMode(value:unknown):ApplicationRuntimeMode {
 if(value===undefined||value==='integrated')return 'integrated';
 if(value==='hr_enterprise')return value;
 throw new Error('APP_RUNTIME_MODE must be integrated or hr_enterprise');
}
export function applicationRuntimeMode(config:Pick<ConfigService,'get'>):ApplicationRuntimeMode {return parseApplicationRuntimeMode(config.get?.('APP_RUNTIME_MODE'));}
