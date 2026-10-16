import {CanActivate,ExecutionContext,Injectable} from '@nestjs/common';
import type {JwtPrincipal} from '../../shared/types/jwt-principal';
import {HrPerformanceSourceDraftService} from './hr-performance-source-draft.service';
/** Guards run before interceptors, so cached receipts also require live kind authority. */
@Injectable()
export class HrPerformanceSourceDraftGuard implements CanActivate {
 constructor(private readonly service:HrPerformanceSourceDraftService){}
 async canActivate(context:ExecutionContext){const req=context.switchToHttp().getRequest<{user:JwtPrincipal;params:{id?:string};body?:{kind?:unknown};query?:{kind?:unknown}}>();const a=req.user;await this.service.authorizeWrite({tenantId:a.tenantId,parkId:a.parkId},a,req.params.id,req.body?.kind??req.query?.kind);return true;}
}
