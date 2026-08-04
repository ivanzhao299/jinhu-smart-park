import {
  type DynamicModule,
  type InjectionToken,
  Module,
  type ModuleMetadata,
  type Provider
} from "@nestjs/common";
import type { PropertyTaskSourceResolver } from "@jinhu/shared";
import { PropertyApprovalModule } from "../property-approvals/property-approval.module";
import { PropertyTaskAccessEvaluatorService } from "./property-task.access";
import { PropertyTaskAssignmentRepository } from
  "./property-task.assignment.repository";
import { PropertyTaskController } from "./property-task.controller";
import { PropertyTaskMapper } from "./property-task.mapper";
import { PropertyTaskOrchestrator } from "./property-task.orchestrator";
import { PropertyTaskProjectionRepository } from
  "./property-task.projection.repository";
import {
  PROPERTY_TASK_SOURCE_RESOLVERS,
  PropertyTaskSourceRegistryProvider
} from "./property-task.registry";
import { PropertyTaskService } from "./property-task.service";
import { CanonicalUuidPipe } from "./property-task.validation";

export interface PropertyTaskSourceComposition {
  readonly imports?: NonNullable<ModuleMetadata["imports"]>;
  readonly resolverTokens: readonly InjectionToken[];
}

@Module({
  imports: [PropertyApprovalModule],
  controllers: [PropertyTaskController],
  providers: [
    PropertyTaskService,
    PropertyTaskOrchestrator,
    PropertyTaskAssignmentRepository,
    PropertyTaskProjectionRepository,
    PropertyTaskSourceRegistryProvider,
    PropertyTaskAccessEvaluatorService,
    PropertyTaskMapper,
    CanonicalUuidPipe
  ],
  exports: [
    PropertyTaskService,
    PropertyTaskOrchestrator,
    PropertyTaskSourceRegistryProvider,
    PropertyTaskAccessEvaluatorService
  ]
})
export class PropertyTaskModule {
  static composeSources(
    composition: PropertyTaskSourceComposition
  ): DynamicModule {
    const resolverTokens = Object.freeze([...composition.resolverTokens]);
    if (resolverTokens.length === 0) {
      throw new Error("Property task source composition requires at least one resolver token");
    }
    if (new Set(resolverTokens).size !== resolverTokens.length) {
      throw new Error("Property task source composition contains a duplicate resolver token");
    }
    const registrationsProvider: Provider = {
      provide: PROPERTY_TASK_SOURCE_RESOLVERS,
      inject: [...resolverTokens],
      useFactory: (...resolvers: PropertyTaskSourceResolver[]) =>
        Object.freeze([...resolvers])
    };
    return {
      module: PropertyTaskModule,
      imports: [...(composition.imports ?? [])],
      providers: [registrationsProvider]
    };
  }
}
