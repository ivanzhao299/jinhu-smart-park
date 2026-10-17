import {Global,Module} from '@nestjs/common';
import {IDENTITY_SCOPE_PORT} from './identity-scope.port';
import {EnterpriseScopeService} from './enterprise-scope.service';
@Global()
@Module({providers:[EnterpriseScopeService,{provide:IDENTITY_SCOPE_PORT,useExisting:EnterpriseScopeService}],exports:[EnterpriseScopeService,IDENTITY_SCOPE_PORT]})
export class EnterpriseScopeModule{}
