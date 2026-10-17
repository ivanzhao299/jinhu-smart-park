import {DynamicModule,MiddlewareConsumer,Module,NestModule,RequestMethod} from '@nestjs/common';
import {UsersModule} from '../users/users.module';
import {UsersService} from '../users/users.service';
import {AUTH_USER_CONTEXT} from './auth-user-context.port';
import {AUTH_REFRESH_SCOPE_WRITER} from './auth-refresh-scope-writer';
import {SmartParkRefreshScopeWriter} from './smart-park-refresh-scope-writer';
import {AuthPreValidationRateLimitMiddleware} from './auth-prevalidation-rate-limit.middleware';
import {authKernelMetadata} from './auth-kernel.metadata';
@Module(authKernelMetadata([UsersModule],{provide:AUTH_USER_CONTEXT,useExisting:UsersService}))
export class AuthModule implements NestModule {
  static withParkScopeTransition(): DynamicModule {
    return {
      module: AuthModule,
      providers: [
        SmartParkRefreshScopeWriter,
        {
          provide: AUTH_REFRESH_SCOPE_WRITER,
          useExisting: SmartParkRefreshScopeWriter
        }
      ]
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthPreValidationRateLimitMiddleware).forRoutes(
      { path: "auth/login", method: RequestMethod.POST },
      { path: "auth/token/refresh", method: RequestMethod.POST },
      { path: "auth/select-context", method: RequestMethod.POST },
      { path: "auth/mobile/send-code", method: RequestMethod.POST },
      { path: "auth/mobile/login", method: RequestMethod.POST },
      { path: "auth/wechat/authorize", method: RequestMethod.POST },
      { path: "auth/wechat/callback", method: RequestMethod.POST }
    );
  }
}
