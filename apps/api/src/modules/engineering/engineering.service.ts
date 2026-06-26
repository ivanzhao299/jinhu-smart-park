import { Injectable } from "@nestjs/common";
import {
  ENGINEERING_INTEGRATION_BOUNDARIES,
  ENGINEERING_PHASE_1_SUB_RUNTIMES,
  ENGINEERING_RUNTIME_CN_NAME,
  ENGINEERING_RUNTIME_CODE,
  ENGINEERING_RUNTIME_NAME,
  type EngineeringRuntimeDescriptor
} from "./domain/engineering-runtime.types";

@Injectable()
export class EngineeringService {
  getRuntimeDescriptor(): EngineeringRuntimeDescriptor {
    return {
      runtime_code: ENGINEERING_RUNTIME_CODE,
      runtime_name: ENGINEERING_RUNTIME_NAME,
      runtime_cn_name: ENGINEERING_RUNTIME_CN_NAME,
      status: "SKELETON_READY",
      phase: "phase_1_mvp",
      api_prefix: "/api/engineering",
      sub_runtimes: ENGINEERING_PHASE_1_SUB_RUNTIMES,
      integration_boundaries: ENGINEERING_INTEGRATION_BOUNDARIES
    };
  }
}
