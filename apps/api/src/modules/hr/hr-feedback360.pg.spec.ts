import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { DataSource } from "typeorm";
import { HrFeedback360Service } from "./hr-feedback360.service";
const enabled = process.env.HR_FEEDBACK360_PG_TEST === "1",
  scope = { tenantId: "10000001", parkId: "20000001" };
let db: DataSource,
  service: HrFeedback360Service,
  hrId: string,
  managerId: string,
  subjectId: string,
  subject2Id: string,
  reviewerIds: string[],
  reviewerUserIds: string[],
  orgId: string,
  otherOrgId: string;
const all = [
  HR_PERMISSIONS.HR_FEEDBACK_READ,
  HR_PERMISSIONS.HR_FEEDBACK_TEAM_READ,
  HR_PERMISSIONS.HR_FEEDBACK_SELF_READ,
  HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE,
  HR_PERMISSIONS.HR_FEEDBACK_CYCLE_MANAGE,
  HR_PERMISSIONS.HR_FEEDBACK_NOMINATE,
  HR_PERMISSIONS.HR_FEEDBACK_NOMINATION_REVIEW,
  HR_PERMISSIONS.HR_FEEDBACK_RESPOND,
  HR_PERMISSIONS.HR_FEEDBACK_RESULT_PUBLISH,
  HR_PERMISSIONS.HR_FEEDBACK_RESULT_READ,
];
const actor = (sub: string, permissions = all) => ({
  sub,
  username: `pg-${sub.slice(0, 6)}`,
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions,
});
before(async () => {
  if (!enabled) return;
  db = new DataSource({
    type: "postgres",
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    username: process.env.POSTGRES_USER ?? process.env.USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  });
  await db.initialize();
  hrId = randomUUID();
  managerId = randomUUID();
  reviewerUserIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  orgId = randomUUID();
  otherOrgId = randomUUID();
  subjectId = randomUUID();
  subject2Id = randomUUID();
  reviewerIds = reviewerUserIds.map(() => randomUUID());
  await db.query(
    `INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status)VALUES($1,$2,$3,$4,'360 HR','x','enabled'),($5,$2,$3,$6,'360经理','x','enabled'),($7,$2,$3,$8,'评价人1','x','enabled'),($9,$2,$3,$10,'评价人2','x','enabled'),($11,$2,$3,$12,'评价人3','x','enabled'),($13,$2,$3,$14,'跨树评价人','x','enabled')`,
    [
      hrId,
      scope.tenantId,
      scope.parkId,
      `pg360-${hrId.slice(0, 8)}`,
      managerId,
      `pg360-${managerId.slice(0, 8)}`,
      reviewerUserIds[0],
      `pg360-${reviewerUserIds[0]!.slice(0, 8)}`,
      reviewerUserIds[1],
      `pg360-${reviewerUserIds[1]!.slice(0, 8)}`,
      reviewerUserIds[2],
      `pg360-${reviewerUserIds[2]!.slice(0, 8)}`,
      reviewerUserIds[3],
      `pg360-${reviewerUserIds[3]!.slice(0, 8)}`,
    ],
  );
  await db.query(
    `INSERT INTO sys_org(id,tenant_id,park_id,org_code,org_name,org_type,status,leader_user_id,create_by,update_by)VALUES($1,$2,$3,$4,'360部门A','department','enabled',$5,$5,$5),($6,$2,$3,$7,'360部门B','department','enabled',null,$5,$5)`,
    [
      orgId,
      scope.tenantId,
      scope.parkId,
      `PG360-A-${orgId.slice(0, 6)}`,
      managerId,
      otherOrgId,
      `PG360-B-${otherOrgId.slice(0, 6)}`,
    ],
  );
  await db.query(
    `INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,primary_org_id,employment_status,create_by,update_by)VALUES($1,$2,$3,$4,'评价对象A',null,$5,'active',$6,$6),($7,$2,$3,$8,'评价对象B',null,$5,'active',$6,$6),($9,$2,$3,$10,'评价人1',$11,$5,'active',$6,$6),($12,$2,$3,$13,'评价人2',$14,$5,'active',$6,$6),($15,$2,$3,$16,'评价人3',$17,$5,'active',$6,$6),($18,$2,$3,$19,'跨树评价人',$20,$21,'active',$6,$6)`,
    [
      subjectId,
      scope.tenantId,
      scope.parkId,
      `PG360-S1-${subjectId.slice(0, 6)}`,
      orgId,
      hrId,
      subject2Id,
      `PG360-S2-${subject2Id.slice(0, 6)}`,
      reviewerIds[0],
      `PG360-R1-${reviewerIds[0]!.slice(0, 6)}`,
      reviewerUserIds[0],
      reviewerIds[1],
      `PG360-R2-${reviewerIds[1]!.slice(0, 6)}`,
      reviewerUserIds[1],
      reviewerIds[2],
      `PG360-R3-${reviewerIds[2]!.slice(0, 6)}`,
      reviewerUserIds[2],
      reviewerIds[3],
      `PG360-R4-${reviewerIds[3]!.slice(0, 6)}`,
      reviewerUserIds[3],
      otherOrgId,
    ],
  );
  service = new HrFeedback360Service(
    db,
    { recordOperationRequired: async () => undefined } as never,
    {
      publishFeedback360Task: async () => undefined,
      publishFeedback360Result: async () => undefined,
    } as never,
  );
});
after(async () => {
  if (enabled && db?.isInitialized) await db.destroy();
});
async function foundation(code: string, employeeId: string) {
  const model = await service.createModel(scope, actor(hrId), {
    modelCode: `M${code}`,
    modelName: `模型${code}`,
    versionName: "V1",
    scaleMin: 1,
    scaleMax: 5,
    dimensions: [{
      code: "EXEC",
      name: "执行力",
      weight: 1,
      anchors: [{ level: 1, text: "需要提升" }, { level: 5, text: "表现卓越" }],
    }],
  }) as { versionId: string };
  await service.publishModel(scope, actor(hrId), model.versionId);
  const q = await service.createQuestionnaire(scope, actor(hrId), {
    questionnaireCode: `Q${code}`,
    questionnaireName: `问卷${code}`,
    versionName: "V1",
    modelVersionId: model.versionId,
    questions: [{
      code: "EXEC1",
      dimensionCode: "EXEC",
      text: "执行表现如何",
      type: "rating",
      required: true,
    }, {
      code: "ADVICE",
      dimensionCode: "EXEC",
      text: "发展建议",
      type: "text",
      required: true,
    }],
  }) as { versionId: string };
  await service.publishQuestionnaire(scope, actor(hrId), q.versionId);
  const cycle = await service.createCycle(scope, actor(hrId), {
    cycleCode: `C${code}`,
    cycleName: `周期${code}`,
    modelVersionId: model.versionId,
    questionnaireVersionId: q.versionId,
    nominationEnd: "2026-11-30",
    responseEnd: "2026-12-31",
    minimumAnonymousResponses: 3,
    employeeIds: [employeeId],
  }) as { id: string };
  await service.activateCycle(scope, actor(hrId), cycle.id);
  const subject =
    (await db.query(`SELECT id FROM hr_feedback360_subject WHERE cycle_id=$1`, [
      cycle.id,
    ]))[0];
  return { cycleId: cycle.id, subjectId: subject.id as string };
}
async function assign(
  subject: string,
  reviewer: string,
  relationType = "peer",
) {
  const n = await service.nominate(scope, actor(hrId), {
    subjectId: subject,
    nomineeEmployeeId: reviewer,
    relationType,
  }) as { id: string };
  await service.decideNomination(scope, actor(managerId), n.id, {
    decision: "approve",
  });
  return (await db.query(
    `SELECT id FROM hr_feedback360_assignment WHERE nomination_id=$1`,
    [n.id],
  ))[0].id as string;
}
test(
  "anonymous threshold failure leaves no readable result, then three responders publish only dimensions",
  { skip: !enabled },
  async () => {
    const before = (await db.query(
      `SELECT (SELECT count(*) FROM hr_performance_plan) performance,(SELECT count(*) FROM hr_employee) employees`,
    ))[0];
    const low = await foundation(
      randomUUID().slice(0, 8).toUpperCase(),
      subjectId,
    );
    for (let i = 0; i < 2; i++) {
      const assignment = await assign(low.subjectId, reviewerIds[i]!);
      await service.submit(
        scope,
        actor(reviewerUserIds[i]!, [HR_PERMISSIONS.HR_FEEDBACK_RESPOND]),
        assignment,
        {
          answers: [{ questionCode: "EXEC1", score: 80 + i * 10 }, {
            questionCode: "ADVICE",
            text: `仅原始审计可见建议${i}`,
          }],
        },
      );
    }
    const closeRace = await Promise.allSettled([
      service.closeSubject(scope, actor(hrId), low.subjectId),
      service.closeSubject(scope, actor(hrId), low.subjectId),
    ]);
    assert.equal(
      closeRace.filter((x) => x.status === "fulfilled").length,
      1,
    );
    await assert.rejects(
      service.publishResult(scope, actor(hrId), low.subjectId),
      /publication threshold/,
    );
    await assert.rejects(
      db.query(
        `UPDATE hr_feedback360_subject SET status='published',published_at=now() WHERE id=$1`,
        [low.subjectId],
      ),
      /threshold has not been reached/,
    );
    assert.equal(
      (await db.query(
        `SELECT count(*) value FROM hr_feedback360_dimension_result WHERE subject_id=$1`,
        [low.subjectId],
      ))[0].value,
      "0",
    );
    assert.equal(
      (await db.query(`SELECT status FROM hr_feedback360_subject WHERE id=$1`, [
        low.subjectId,
      ]))[0].status,
      "closed",
    );
    const ok = await foundation(
      randomUUID().slice(0, 8).toUpperCase(),
      subject2Id,
    );
    for (let i = 0; i < 3; i++) {
      const assignment = await assign(ok.subjectId, reviewerIds[i]!);
      const race = i === 0
        ? await Promise.allSettled([
          service.submit(
            scope,
            actor(reviewerUserIds[i]!, [HR_PERMISSIONS.HR_FEEDBACK_RESPOND]),
            assignment,
            {
              answers: [{ questionCode: "EXEC1", score: 70 + i * 10 }, {
                questionCode: "ADVICE",
                text: `敏感建议${i}`,
              }],
            },
          ),
          service.submit(
            scope,
            actor(reviewerUserIds[i]!, [HR_PERMISSIONS.HR_FEEDBACK_RESPOND]),
            assignment,
            {
              answers: [{ questionCode: "EXEC1", score: 70 + i * 10 }, {
                questionCode: "ADVICE",
                text: `敏感建议${i}`,
              }],
            },
          ),
        ])
        : null;
      if (race) {
        assert.equal(
          race.filter((x) => x.status === "fulfilled").length,
          1,
        );
      } else {await service.submit(
          scope,
          actor(reviewerUserIds[i]!, [HR_PERMISSIONS.HR_FEEDBACK_RESPOND]),
          assignment,
          {
            answers: [{ questionCode: "EXEC1", score: 70 + i * 10 }, {
              questionCode: "ADVICE",
              text: `敏感建议${i}`,
            }],
          },
        );}
    }
    await service.closeSubject(scope, actor(hrId), ok.subjectId);
    await service.publishResult(scope, actor(hrId), ok.subjectId);
    const result = await service.results(scope, actor(hrId), {
      subject_id: ok.subjectId,
    });
    assert.equal(result.length, 1);
    const encoded = JSON.stringify(result);
    assert.match(encoded, /EXEC/);
    assert.doesNotMatch(encoded, /reviewer|assignment|敏感建议|response_hash/i);
    assert.doesNotMatch(encoded, new RegExp(ok.subjectId, "i"));
    assert.doesNotMatch(encoded, /responseCount|relationGroup/i);
    assert.equal((result[0] as { dimensions: unknown[] }).dimensions.length, 1);
    const auditFailService = new HrFeedback360Service(
      db,
      {
        recordOperationRequired: async () => {
          throw new Error("required audit unavailable");
        },
      } as never,
      {} as never,
    );
    await assert.rejects(
      auditFailService.results(scope, actor(hrId), {
        subject_id: ok.subjectId,
      }),
      /required audit unavailable/,
    );
    await assert.rejects(
      db.query(
        `UPDATE hr_feedback360_subject SET published_at=now()+interval '1 second' WHERE id=$1`,
        [ok.subjectId],
      ),
      /published 360 subject is immutable/,
    );
    const after = (await db.query(
      `SELECT (SELECT count(*) FROM hr_performance_plan) performance,(SELECT count(*) FROM hr_employee) employees`,
    ))[0];
    assert.deepEqual(after, before);
  },
);
test(
  "mixed anonymous relations aggregate only as others and database blocks forged workflow",
  { skip: !enabled },
  async () => {
    const f = await foundation(
      randomUUID().slice(0, 8).toUpperCase(),
      subjectId,
    );
    await assert.rejects(
      db.query(
        `INSERT INTO hr_feedback360_nomination(tenant_id,park_id,subject_id,nominee_employee_id,relation_type,nominated_by) VALUES($1,$2,$3,$4,'self',$5)`,
        [scope.tenantId, scope.parkId, f.subjectId, reviewerIds[0], hrId],
      ),
      /invalid 360 self relation|external reviewer identity/,
    );
    await db.query(
      `UPDATE hr_employee SET manager_employee_id=$2 WHERE id=$1`,
      [reviewerIds[2], subjectId],
    );
    const relations = ["peer", "peer", "subordinate"];
    for (let i = 0; i < relations.length; i++) {
      const assignment = await assign(
        f.subjectId,
        reviewerIds[i]!,
        relations[i],
      );
      await service.submit(
        scope,
        actor(reviewerUserIds[i]!, [HR_PERMISSIONS.HR_FEEDBACK_RESPOND]),
        assignment,
        {
          answers: [{ questionCode: "EXEC1", score: 70 + i * 10 }, {
            questionCode: "ADVICE",
            text: `混合关系建议${i}`,
          }],
        },
      );
    }
    await service.closeSubject(scope, actor(hrId), f.subjectId);
    await service.publishResult(scope, actor(hrId), f.subjectId);
    const groups = await db.query(
      `SELECT relation_group,response_count,average_score::text FROM hr_feedback360_dimension_result WHERE subject_id=$1`,
      [f.subjectId],
    );
    assert.deepEqual(groups, [{
      relation_group: "others",
      response_count: 3,
      average_score: "80.00",
    }]);
  },
);
test(
  "managed-tree nomination blocks cross-tree reviewer and self identity forgery",
  { skip: !enabled },
  async () => {
    const f = await foundation(
      randomUUID().slice(0, 8).toUpperCase(),
      subjectId,
    );
    const manager = actor(managerId, [
      HR_PERMISSIONS.HR_FEEDBACK_TEAM_READ,
      HR_PERMISSIONS.HR_FEEDBACK_NOMINATE,
    ]);
    await assert.rejects(
      service.nominate(scope, manager, {
        subjectId: f.subjectId,
        nomineeEmployeeId: reviewerIds[3]!,
        relationType: "collaborator",
      }),
      /authorized organization tree/,
    );
    await assert.rejects(
      service.nominate(scope, manager, {
        subjectId: f.subjectId,
        nomineeEmployeeId: reviewerIds[0]!,
        relationType: "self",
      }),
      /Self relation/,
    );
    assert.equal(
      (await db.query(
        `SELECT count(*) value FROM hr_feedback360_nomination WHERE subject_id=$1`,
        [f.subjectId],
      ))[0].value,
      "0",
    );
  },
);
