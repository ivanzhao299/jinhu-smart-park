import { Allow, IsInt, Max, Min } from "class-validator";

export class UpdateHrCustomValueDto {
  @IsInt() @Min(0) @Max(2147483646) expectedVersion!: number;
  // The service validates against the scoped definition's actual type.
  @Allow() value!: unknown;
}
