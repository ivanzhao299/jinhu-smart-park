import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {plainToInstance} from "class-transformer";
import {validate} from "class-validator";
import {BadRequestException,ForbiddenException} from "@nestjs/common";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {ANY_PERMISSIONS_KEY} from "../../shared/decorators/permissions.decorator";
import {HrPerformanceReviewPageQueryDto} from "./dto/hr-performance-review.dto";
import {HrPerformanceReviewController} from "./hr-performance-review.controller";
import {HrPerformanceEvaluationService} from "./hr-performance-evaluation.service";
const scope={tenantId:"t",parkId:"p"};
const actor={sub:"u",username:"synthetic",...scope,roles:[],permissions:[] as string[]};
test("review paging has exact existing read capabilities and bounded query DTO",async()=>{
 assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrPerformanceReviewController.prototype.reviewPage),[H.HR_PERFORMANCE_READ,H.HR_PERFORMANCE_TEAM_READ,H.HR_PERFORMANCE_SELF_READ]);
 assert.equal((await validate(plainToInstance(HrPerformanceReviewPageQueryDto,{page:"2",pageSize:"30"}))).length,0);
 for(const q of [{page:0},{page:1.1},{pageSize:101},{pageSize:0},{page:1000001},{status:"planning"},{cycleId:"bad"}])assert.ok((await validate(plainToInstance(HrPerformanceReviewPageQueryDto,q))).length);
});
test("page service rejects missing scope capability and invalid bounds before any query",async()=>{
 const service=new HrPerformanceEvaluationService({transaction:async()=>{throw new Error("query reached");}} as never,{} as never);
 await assert.rejects(service.reviewPage(scope,actor,{}),ForbiddenException);
 for(const q of [{page:0},{page:NaN},{pageSize:101}])await assert.rejects(service.reviewPage(scope,{...actor,permissions:[H.HR_PERFORMANCE_READ]},q),BadRequestException);
});
