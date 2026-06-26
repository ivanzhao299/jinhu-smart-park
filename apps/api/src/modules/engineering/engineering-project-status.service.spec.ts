import assert from "node:assert/strict";
import test from "node:test";
import { EngineeringProjectStatus } from "./domain/engineering-project.enums";
import { EngineeringProjectAction, type EngineeringProjectTransitionContext } from "./domain/engineering-project-state-machine.types";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringProjectStateMachine } from "./engineering-project-state.machine";
import { EngineeringProjectStatusService } from "./engineering-project-status.service";
import { EngineeringProjectRepository } from "./repositories/engineering-project.repository";

test("EngineeringProjectStatusService loads project and delegates transition to state machine", async () => {
  const project = {
    id: "00000000-0000-0000-0000-000000000101",
    tenantId: "tenant-a",
    parkId: "park-a",
    status: EngineeringProjectStatus.DRAFT
  } as EngineeringProjectEntity;
  const calls: EngineeringProjectAction[] = [];
  const repository = {
    findById: async () => project
  } as unknown as EngineeringProjectRepository;
  const machine = {
    transition: async (_project: EngineeringProjectEntity, action: EngineeringProjectAction) => {
      calls.push(action);
      return { ...project, status: EngineeringProjectStatus.SUBMITTED } as EngineeringProjectEntity;
    }
  } as unknown as EngineeringProjectStateMachine;
  const service = new EngineeringProjectStatusService(repository, machine);
  const context: EngineeringProjectTransitionContext = {
    tenantId: "tenant-a",
    parkId: "park-a",
    projectId: project.id,
    actorUserId: "00000000-0000-0000-0000-000000000201",
    reason: "提交立项"
  };

  const updated = await service.submitProject(project.id, context);

  assert.equal(updated.status, EngineeringProjectStatus.SUBMITTED);
  assert.deepEqual(calls, [EngineeringProjectAction.SUBMIT]);
});
