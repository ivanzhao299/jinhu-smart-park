import {Module} from '@nestjs/common';
import {IdentityDirectoryModule} from '../modules/users/identity-directory.module';
import {FieldPoliciesModule} from '../modules/field-policies/field-policies.module';
import {DataScopesModule} from '../modules/data-scopes/data-scopes.module';
import {EnterpriseScopeModule} from './enterprise-scope.module';
import {EnterpriseContextService} from './enterprise-context.service';
@Module({imports:[IdentityDirectoryModule,FieldPoliciesModule,DataScopesModule,EnterpriseScopeModule],providers:[EnterpriseContextService],exports:[EnterpriseContextService]})
export class EnterpriseContextModule{}
