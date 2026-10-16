import {CanActivate,ExecutionContext,Injectable} from '@nestjs/common';
import type {JwtPrincipal} from '../../shared/types/jwt-principal';
import {HrEmployeeFeedbackService} from './hr-employee-feedback.service';
@Injectable()
export class HrEmployeeFeedbackGuard implements CanActivate {
 constructor(private readonly service:HrEmployeeFeedbackService){}
 async canActivate(c:ExecutionContext){const r=c.switchToHttp().getRequest<{user:JwtPrincipal;params:{id?:string};method:string;url:string;query:{view?:unknown}}>(),s={tenantId:r.user.tenantId,parkId:r.user.parkId};if(r.method==='GET'&&r.url.split('?')[0]!.endsWith('/context')){await this.service.authorizeContext(s,r.user);return true;}const write=r.method!=='GET',view=write?(r.url.split('?')[0]!.replace(/\/$/,'').endsWith('/reply')?'hr':'mine'):r.query.view;await this.service.authorize(s,r.user,view as 'mine'|'hr',r.params.id,write);return true;}
}
