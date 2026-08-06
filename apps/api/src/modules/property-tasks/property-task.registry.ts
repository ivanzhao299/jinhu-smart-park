import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  createPropertyTaskComposedSourceRegistry,
  createPropertyTaskProductionSourceRegistry,
  type PropertyTaskProjectorSource,
  type PropertyTaskSourceRegistry,
  type PropertyTaskSourceResolver
} from "@jinhu/shared";

export const PROPERTY_TASK_SOURCE_RESOLVERS = Symbol(
  "PROPERTY_TASK_SOURCE_RESOLVERS"
);

@Injectable()
export class PropertyTaskSourceRegistryProvider {
  readonly registry: PropertyTaskSourceRegistry;
  readonly #resolvers: readonly PropertyTaskSourceResolver[];

  constructor(
    @Optional()
    @Inject(PROPERTY_TASK_SOURCE_RESOLVERS)
    resolvers: readonly PropertyTaskSourceResolver[] = []
  ) {
    const registrations = Object.freeze([...resolvers]);
    this.registry = registrations.length === 0
      ? createPropertyTaskProductionSourceRegistry()
      : createPropertyTaskComposedSourceRegistry(registrations);
    this.#resolvers = this.registry.values();
  }

  get size(): number {
    return this.registry.size;
  }

  resolve(sourceType: string, taskKind: string): PropertyTaskSourceResolver | null {
    return this.registry.resolve(sourceType, taskKind);
  }

  resolveProjector(
    sourceType: string,
    taskKind: string
  ): (PropertyTaskSourceResolver & PropertyTaskProjectorSource) | null {
    const resolver = this.resolve(sourceType, taskKind);
    if (!resolver || !("scanCandidates" in resolver)
      || typeof resolver.scanCandidates !== "function") return null;
    return resolver as PropertyTaskSourceResolver & PropertyTaskProjectorSource;
  }

  projectorsForSourceType(
    sourceType: string
  ): readonly (PropertyTaskSourceResolver & PropertyTaskProjectorSource)[] {
    return this.#resolvers.filter(
      (resolver): resolver is PropertyTaskSourceResolver & PropertyTaskProjectorSource =>
        resolver.sourceType === sourceType
        && "scanCandidates" in resolver
        && typeof resolver.scanCandidates === "function"
    );
  }
}
