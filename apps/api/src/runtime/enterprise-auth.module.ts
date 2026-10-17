import {MiddlewareConsumer,Module,NestModule,RequestMethod} from '@nestjs/common';
import {authKernelMetadata} from '../modules/auth/auth-kernel.metadata';
import {AuthPreValidationRateLimitMiddleware} from '../modules/auth/auth-prevalidation-rate-limit.middleware';
import {AUTH_USER_CONTEXT} from '../modules/auth/auth-user-context.port';
import {EnterpriseContextModule} from './enterprise-context.module';
import {EnterpriseContextService} from './enterprise-context.service';
@Module(authKernelMetadata([EnterpriseContextModule],{provide:AUTH_USER_CONTEXT,useExisting:EnterpriseContextService}))
export class EnterpriseAuthModule implements NestModule{
 configure(consumer:MiddlewareConsumer){consumer.apply(AuthPreValidationRateLimitMiddleware).forRoutes({path:'auth/login',method:RequestMethod.POST},{path:'auth/token/refresh',method:RequestMethod.POST},{path:'auth/select-context',method:RequestMethod.POST});}
}
