import {CanActivate,ExecutionContext,Injectable} from '@nestjs/common';
import type {JwtPrincipal} from '../../shared/types/jwt-principal';
import {HrPerformanceSourceActivationService} from './hr-performance-source-activation.service';
@Injectable()
export class HrPerformanceSourceActivationGuard implements CanActivate {
 constructor(private readonly service:HrPerformanceSourceActivationService){}
 async canActivate(c:ExecutionContext){const r=c.switchToHttp().getRequest<{user:JwtPrincipal;params:{id:string};method:string;url:string}>();await this.service.authorize({tenantId:r.user.tenantId,parkId:r.user.parkId},r.user,r.params.id,r.url.split('?')[0]!.endsWith('/activate-review'),r.method==='POST');return true;}
}
