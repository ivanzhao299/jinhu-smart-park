import {
  Module,
  type DynamicModule,
  type FactoryProvider,
  type ModuleMetadata,
  type Provider,
  type Type,
  type ValueProvider
} from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  BUSINESS_SCOPE_PARK_ADAPTER,
  type BusinessScopeParkAdapter
} from "./business-scope-park-adapter";
import { BusinessScopeEntity } from "./entities/business-scope.entity";
import { BusinessScopeMembershipEntity } from "./entities/business-scope-membership.entity";
import { BusinessScopeModuleEntity } from "./entities/business-scope-module.entity";
import { BusinessScopeResolverService } from "./business-scope-resolver.service";

type BusinessScopeParkAdapterProvider =
  | { useClass: Type<BusinessScopeParkAdapter> }
  | { useExisting: Type<BusinessScopeParkAdapter> | string | symbol }
  | Omit<ValueProvider<BusinessScopeParkAdapter>, "provide">
  | Omit<FactoryProvider<BusinessScopeParkAdapter>, "provide">;

export interface BusinessScopeCoreModuleOptions {
  imports?: ModuleMetadata["imports"];
  parkAdapterProvider?: BusinessScopeParkAdapterProvider;
}

@Module({})
export class BusinessScopeCoreModule {
  static register(options: BusinessScopeCoreModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [BusinessScopeResolverService];
    if (options.parkAdapterProvider) {
      providers.push({ provide: BUSINESS_SCOPE_PARK_ADAPTER, ...options.parkAdapterProvider } as Provider);
    }
    return {
      module: BusinessScopeCoreModule,
      imports: [
        TypeOrmModule.forFeature([
          BusinessScopeEntity,
          BusinessScopeMembershipEntity,
          BusinessScopeModuleEntity
        ]),
        ...(options.imports ?? [])
      ],
      providers,
      exports: [BusinessScopeResolverService]
    };
  }
}
