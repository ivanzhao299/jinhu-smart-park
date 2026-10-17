import {Controller,Get,Param,ParseUUIDPipe,Post,Query,UseInterceptors} from '@nestjs/common';
import type {TenantParkScope} from '@jinhu/shared';
import {CurrentScope} from '../shared/decorators/current-scope.decorator';
import {CurrentUser} from '../shared/decorators/current-user.decorator';
import {RequireAuthenticated} from '../shared/decorators/permissions.decorator';
import {RequireModule} from '../shared/decorators/modules.decorator';
import {IdempotencyInterceptor} from '../shared/interceptors/idempotency.interceptor';
import type {JwtPrincipal} from '../shared/types/jwt-principal';
import {UserMessageService} from '../modules/workflow/user-message.service';
import {WorkflowMessageQueryDto} from '../modules/workflow/dto/workflow-message-query.dto';
/** Every live enterprise member can read only their own persisted notifications. */
@Controller('workflow') @RequireModule('workflow') @RequireAuthenticated()
export class EnterpriseMessageController {
 constructor(private readonly messages:UserMessageService){}
 @Get('messages') list(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Query()q:WorkflowMessageQueryDto){return this.messages.listMessages(s,a,q);}
 @Post('messages/read-all') @UseInterceptors(new IdempotencyInterceptor()) all(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal){return this.messages.markAllMessagesRead(s,a);}
 @Post('messages/:id/read') @UseInterceptors(new IdempotencyInterceptor()) one(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string){return this.messages.markMessageRead(s,a,id);}
}
