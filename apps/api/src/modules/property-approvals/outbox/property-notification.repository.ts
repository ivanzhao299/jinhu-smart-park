import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  type NotificationDetail,
  type NotificationListItem,
  type NotificationListQuery,
  type NotificationMarkReadCommand,
  type PropertyPaginatedResult,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import { propertyApprovalError } from "../property-approval.error";
import { buildPropertyNotificationDeepLink } from "./property-notification.deep-link";
import {
  type ClaimedNotificationDelivery,
  type NotificationProjectionInput,
  type PropertyNotificationStore
} from "./property-notification.contracts";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value);
const number = (value: unknown) => Number(value);
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : text(value);
const nullableIso = (value: unknown) => value == null ? null : iso(value);

@Injectable()
export class TypeOrmPropertyNotificationStore implements PropertyNotificationStore {
  constructor(private readonly dataSource: DataSource) {}

  async project(manager: EntityManager, input: NotificationProjectionInput): Promise<void> {
    const deepLink = buildPropertyNotificationDeepLink(input.notificationType, input.routeId);
    const routeParams = {
      sourceType: input.sourceType, sourceId: input.sourceId,
      routeId: input.routeId, deepLink
    };
    const immutableRecipients = [...input.recipients]
      .map((recipient) => ({
        id: recipient.id,
        userId: recipient.userId,
        relationVersion: recipient.relationVersion,
        bundleSnapshot: recipient.bundleSnapshot,
        channels: [...recipient.channels].sort((a, b) =>
          `${a.channel}:${a.id}`.localeCompare(`${b.channel}:${b.id}`))
      }))
      .sort((a, b) => `${a.userId}:${a.id}`.localeCompare(`${b.userId}:${b.id}`));
    const projectionHash = createHash("sha256").update(canonicalJson({
      eventId: input.eventId,
      notificationType: input.notificationType,
      projectionVersion: input.projectionVersion,
      title: input.title,
      summary: input.summary,
      severity: input.severity,
      routeParams,
      recipients: immutableRecipients
    })).digest("hex");
    const source = await manager.query(
        `SELECT payload_hash FROM biz_property_outbox
         WHERE tenant_id=$1 AND park_id=$2 AND event_id=$3`,
        [input.scope.tenantId, input.scope.parkId, input.eventId]
      ) as Row[];
      if (!source.length) throw propertyApprovalError("property-resource-not-found");
      if (source[0]!.payload_hash !== input.eventPayloadHash) {
        throw propertyApprovalError("event-checksum-mismatch");
      }
      await manager.query(
        `INSERT INTO biz_property_notification(
          id,tenant_id,park_id,source_event_id,notification_type,projection_version,
          title,summary,severity,route_key,route_params,payload_hash,retention_until
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
        ON CONFLICT (tenant_id,park_id,source_event_id,notification_type,projection_version)
        DO NOTHING`,
        [
          input.id, input.scope.tenantId, input.scope.parkId, input.eventId,
          input.notificationType, input.projectionVersion, input.title, input.summary,
          input.severity, input.notificationType, JSON.stringify(routeParams),
          projectionHash, input.retentionUntil
        ]
      );
      const notificationRows = await manager.query(
        `SELECT id,payload_hash FROM biz_property_notification
         WHERE tenant_id=$1 AND park_id=$2 AND source_event_id=$3
           AND notification_type=$4 AND projection_version=$5`,
        [
          input.scope.tenantId, input.scope.parkId, input.eventId,
          input.notificationType, input.projectionVersion
        ]
      ) as Row[];
      const notification = notificationRows[0]!;
      if (notification.payload_hash !== projectionHash) {
        throw propertyApprovalError("event-checksum-mismatch");
      }
    for (const recipient of immutableRecipients) {
        await manager.query(
          `INSERT INTO rel_property_notification_recipient(
            id,tenant_id,park_id,notification_id,recipient_user_id,
            recipient_relation_version,recipient_bundle_snapshot
          ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
          ON CONFLICT (tenant_id,park_id,notification_id,recipient_user_id) DO NOTHING`,
          [
            recipient.id, input.scope.tenantId, input.scope.parkId, notification.id,
            recipient.userId, recipient.relationVersion, JSON.stringify(recipient.bundleSnapshot)
          ]
        );
        const recipientRows = await manager.query(
          `SELECT id FROM rel_property_notification_recipient
           WHERE tenant_id=$1 AND park_id=$2 AND notification_id=$3 AND recipient_user_id=$4`,
          [input.scope.tenantId, input.scope.parkId, notification.id, recipient.userId]
        ) as Row[];
        for (const delivery of recipient.channels) {
          await manager.query(
            `INSERT INTO biz_property_notification_delivery(
              id,tenant_id,park_id,recipient_id,channel
            ) VALUES($1,$2,$3,$4,$5)
            ON CONFLICT (tenant_id,park_id,recipient_id,channel) DO NOTHING`,
            [
              delivery.id, input.scope.tenantId, input.scope.parkId,
              recipientRows[0]!.id, delivery.channel
            ]
          );
        }
    }
  }

  async list(
    scope: TenantParkScope,
    recipientUserId: string,
    query: NotificationListQuery
  ): Promise<PropertyPaginatedResult<NotificationListItem, never>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const filters = ["r.tenant_id=$1", "r.park_id=$2", "r.recipient_user_id=$3"];
    const params: unknown[] = [scope.tenantId, scope.parkId, recipientUserId];
    const add = (column: string, value: unknown) => {
      params.push(value); filters.push(`${column}=$${params.length}`);
    };
    if (query.readStatus) add("r.read_status", query.readStatus);
    if (query.severity) add("n.severity", query.severity);
    if (query.notificationType) add("n.notification_type", query.notificationType);
    const where = filters.join(" AND ");
    const countRows = await this.dataSource.query(
      `SELECT count(*)::int AS total FROM rel_property_notification_recipient r
       JOIN biz_property_notification n ON n.tenant_id=r.tenant_id
        AND n.park_id=r.park_id AND n.id=r.notification_id WHERE ${where}`,
      params
    ) as Row[];
    const sort = query.sort === "readAt" ? "r.read_at" : "n.created_at";
    const order = query.order === "asc" ? "ASC" : "DESC";
    const rows = mutationRows(await this.dataSource.query(
      `SELECT n.*,r.id AS recipient_id,r.recipient_user_id,r.read_at,r.read_version
       FROM rel_property_notification_recipient r
       JOIN biz_property_notification n ON n.tenant_id=r.tenant_id
        AND n.park_id=r.park_id AND n.id=r.notification_id
       WHERE ${where} ORDER BY ${sort} ${order} NULLS LAST,n.id ${order}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    ));
    const items = await Promise.all(rows.map((row) => this.mapNotification(row)));
    return {
      items, page, pageSize, total: number(countRows[0]?.total ?? 0), allowedActions: []
    };
  }

  async detail(
    scope: TenantParkScope,
    recipientUserId: string,
    notificationId: string
  ): Promise<NotificationDetail | null> {
    const rows = mutationRows(await this.dataSource.query(
      `SELECT n.*,r.id AS recipient_id,r.recipient_user_id,r.read_at,r.read_version
       FROM rel_property_notification_recipient r
       JOIN biz_property_notification n ON n.tenant_id=r.tenant_id
        AND n.park_id=r.park_id AND n.id=r.notification_id
       WHERE r.tenant_id=$1 AND r.park_id=$2 AND r.recipient_user_id=$3
         AND n.id=$4`,
      [scope.tenantId, scope.parkId, recipientUserId, notificationId]
    ));
    if (!rows.length) return null;
    return { ...(await this.mapNotification(rows[0]!)), safeDetails: {} };
  }

  async markRead(input: {
    scope: TenantParkScope;
    recipientUserId: string;
    notificationId: string;
    command: NotificationMarkReadCommand;
    authorize: (manager: EntityManager) => Promise<void>;
  }): Promise<NotificationDetail | null> {
    await this.dataSource.transaction(async (manager) => {
      await input.authorize(manager);
      const rows = mutationRows(await manager.query(
        `SELECT read_status,read_version FROM rel_property_notification_recipient
         WHERE tenant_id=$1 AND park_id=$2 AND recipient_user_id=$3
           AND notification_id=$4 FOR UPDATE`,
        [
          input.scope.tenantId, input.scope.parkId,
          input.recipientUserId, input.notificationId
        ]
      ));
      if (!rows.length) return;
      const requestHash = createHash("sha256").update(JSON.stringify({
        notificationId: input.notificationId,
        expectedReadVersion: input.command.expectedReadVersion
      })).digest("hex");
      const receipts = await manager.query(
        `SELECT request_hash,receipt_status FROM biz_property_mutation_receipt
         WHERE tenant_id=$1 AND park_id=$2 AND actor_id=$3
           AND action_id='property.notification.mark-read'
           AND target_id=$4 AND client_key=$5 FOR UPDATE`,
        [
          input.scope.tenantId, input.scope.parkId, input.recipientUserId,
          input.notificationId, input.command.clientKey
        ]
      ) as Row[];
      if (receipts.length) {
        if (receipts[0]!.request_hash !== requestHash) {
          throw propertyApprovalError("idempotency-key-conflict");
        }
        if (receipts[0]!.receipt_status === "completed") return;
        throw propertyApprovalError("property-version-conflict");
      }
      await manager.query(
        `INSERT INTO biz_property_mutation_receipt(
          receipt_contract_version,tenant_id,park_id,actor_id,action_id,target_id,
          client_key,request_hash
        ) VALUES('legacy-v1',$1,$2,$3,'property.notification.mark-read',$4,$5,$6)`,
        [
          input.scope.tenantId, input.scope.parkId, input.recipientUserId,
          input.notificationId, input.command.clientKey, requestHash
        ]
      );
      if (number(rows[0]!.read_version) !== input.command.expectedReadVersion) {
        throw propertyApprovalError("property-version-conflict", {
          latestVersion: number(rows[0]!.read_version)
        });
      }
      if (rows[0]!.read_status !== "read") {
        await manager.query(
          `UPDATE rel_property_notification_recipient
           SET read_status='read',read_version=read_version+1,read_at=clock_timestamp()
           WHERE tenant_id=$1 AND park_id=$2 AND recipient_user_id=$3
             AND notification_id=$4 AND read_status='unread' AND read_version=$5`,
          [
            input.scope.tenantId, input.scope.parkId, input.recipientUserId,
            input.notificationId, input.command.expectedReadVersion
          ]
        );
      }
      const resultHash = createHash("sha256").update(JSON.stringify({
        notificationId: input.notificationId, readStatus: "read"
      })).digest("hex");
      await manager.query(
        `UPDATE biz_property_mutation_receipt
         SET receipt_status='completed',result_ref=$6,result_hash=$7,
             completed_at=clock_timestamp()
         WHERE tenant_id=$1 AND park_id=$2 AND actor_id=$3
           AND action_id='property.notification.mark-read'
           AND target_id=$4 AND client_key=$5`,
        [
          input.scope.tenantId, input.scope.parkId, input.recipientUserId,
          input.notificationId, input.command.clientKey,
          `notification-read:${input.notificationId}`, resultHash
        ]
      );
    });
    return this.detail(
      input.scope, input.recipientUserId, input.notificationId
    );
  }

  async claimDeliveries(input: {
    limit: number; leaseSeconds: number;
  }): Promise<ClaimedNotificationDelivery[]> {
    const token = randomUUID();
    const rows = mutationRows(await this.dataSource.query(
      `WITH candidates AS (
        SELECT d.id FROM biz_property_notification_delivery d
        WHERE (
          d.delivery_status='pending'
          OR (d.delivery_status='delivery_failed' AND d.next_retry_at<=clock_timestamp())
          OR (d.delivery_status='delivering' AND d.lease_expires_at<=clock_timestamp())
        )
        ORDER BY d.next_retry_at NULLS FIRST,d.id FOR UPDATE SKIP LOCKED LIMIT $1
      )
      UPDATE biz_property_notification_delivery d
      SET delivery_status='delivering',version=d.version+1,claim_epoch=d.claim_epoch+1,
        claim_token=$2,lease_expires_at=clock_timestamp()+($3 * interval '1 second'),
        next_retry_at=NULL,failed_at=NULL,exhausted_at=NULL
      FROM candidates c
      WHERE d.id=c.id
      RETURNING d.*,
        (SELECT r.notification_id FROM rel_property_notification_recipient r
         WHERE r.tenant_id=d.tenant_id AND r.park_id=d.park_id AND r.id=d.recipient_id)
          AS notification_id,
        (SELECT r.recipient_user_id FROM rel_property_notification_recipient r
         WHERE r.tenant_id=d.tenant_id AND r.park_id=d.park_id AND r.id=d.recipient_id)
          AS recipient_user_id`,
      [input.limit, token, input.leaseSeconds]
    ));
    return rows.map((row) => ({
      id: text(row.id),
      scope: { tenantId: text(row.tenant_id), parkId: text(row.park_id) },
      notificationId: text(row.notification_id),
      recipientUserId: text(row.recipient_user_id),
      channel: row.channel as ClaimedNotificationDelivery["channel"],
      version: number(row.version), attemptCount: number(row.attempt_count),
      maxAttempts: number(row.max_attempts), claimEpoch: text(row.claim_epoch),
      claimToken: text(row.claim_token)
    }));
  }

  async completeDelivery(delivery: ClaimedNotificationDelivery): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const rows = mutationRows(await manager.query(
        `UPDATE biz_property_notification_delivery
         SET delivery_status='delivered',version=version+1,attempt_count=attempt_count+1,
             claim_token=NULL,lease_expires_at=NULL,delivered_at=clock_timestamp(),
             next_retry_at=NULL,failed_at=NULL,exhausted_at=NULL,last_error_code=NULL
         WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND delivery_status='delivering'
           AND claim_epoch=$4 AND claim_token=$5 AND version=$6 RETURNING *`,
        [
          delivery.scope.tenantId, delivery.scope.parkId, delivery.id,
          delivery.claimEpoch, delivery.claimToken, delivery.version
        ]
      ));
      if (!rows.length) return false;
      const row = rows[0]!;
      await manager.query(
        `INSERT INTO biz_property_notification_delivery_audit(
          tenant_id,park_id,delivery_id,attempt,from_status,to_status,error_code
        ) VALUES($1,$2,$3,$4,'delivering','delivered',NULL)`,
        [row.tenant_id, row.park_id, row.id, row.claim_epoch]
      );
      const replayRows = await manager.query(
        `SELECT * FROM biz_property_event_dlq
         WHERE tenant_id=$1 AND park_id=$2 AND notification_delivery_id=$3
           AND status='replaying' FOR UPDATE`,
        [row.tenant_id, row.park_id, row.id]
      ) as Row[];
      if (replayRows.length) {
        const replay = replayRows[0]!;
        const resolved = mutationRows(await manager.query(
          `UPDATE biz_property_event_dlq SET status='resolved',version=version+1
           WHERE id=$1 AND version=$2 AND status='replaying' RETURNING id`,
          [replay.id, replay.version]
        ));
        if (resolved.length !== 1) return false;
        const prior = await manager.query(
          `SELECT operator_id,incident_id,reason,payload_hash
           FROM biz_property_event_replay_audit
           WHERE tenant_id=$1 AND park_id=$2 AND dlq_id=$3
           ORDER BY created_at DESC,id DESC LIMIT 1`,
          [row.tenant_id, row.park_id, replay.id]
        ) as Row[];
        if (prior.length) {
          const resultHash = createHash("sha256").update(JSON.stringify({
            dlqId: replay.id, deliveryId: row.id, status: "resolved"
          })).digest("hex");
          await manager.query(
            `INSERT INTO biz_property_event_replay_audit(
              tenant_id,park_id,dlq_id,original_event_id,operator_id,incident_id,reason,
              before_status,after_status,payload_hash,result_hash
            ) VALUES($1,$2,$3,$4,$5,$6,$7,'replaying','resolved',$8,$9)`,
            [
              row.tenant_id, row.park_id, replay.id, replay.original_event_id,
              prior[0]!.operator_id, prior[0]!.incident_id, prior[0]!.reason,
              prior[0]!.payload_hash, resultHash
            ]
          );
        }
      }
      return true;
    });
  }

  async failDelivery(input: {
    delivery: ClaimedNotificationDelivery; errorCode: string; retryAt: Date;
  }): Promise<"delivery_failed" | "delivery_exhausted" | "stale-claim"> {
    return this.dataSource.transaction(async (manager) => {
      const rows = mutationRows(await manager.query(
        `UPDATE biz_property_notification_delivery
         SET delivery_status=CASE WHEN attempt_count+1>=max_attempts
              THEN 'delivery_exhausted' ELSE 'delivery_failed' END,
           version=version+1,attempt_count=attempt_count+1,claim_token=NULL,
           lease_expires_at=NULL,failed_at=clock_timestamp(),
           next_retry_at=CASE WHEN attempt_count+1>=max_attempts THEN NULL ELSE $6 END,
           exhausted_at=CASE WHEN attempt_count+1>=max_attempts
              THEN clock_timestamp() ELSE NULL END,last_error_code=$7
         WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND delivery_status='delivering'
           AND claim_epoch=$4 AND claim_token=$5 AND version=$8 RETURNING *`,
        [
          input.delivery.scope.tenantId, input.delivery.scope.parkId, input.delivery.id,
          input.delivery.claimEpoch, input.delivery.claimToken, input.retryAt, input.errorCode,
          input.delivery.version
        ]
      ));
      if (!rows.length) return "stale-claim" as const;
      const delivery = rows[0]!;
      const status = delivery.delivery_status as "delivery_failed" | "delivery_exhausted";
      await manager.query(
        `INSERT INTO biz_property_notification_delivery_audit(
          tenant_id,park_id,delivery_id,attempt,from_status,to_status,error_code
        ) VALUES($1,$2,$3,$4,'delivering',$5,$6)`,
        [
          delivery.tenant_id, delivery.park_id, delivery.id,
          delivery.claim_epoch, status, input.errorCode
        ]
      );
      if (status === "delivery_exhausted") {
        await manager.query(
          `INSERT INTO biz_property_event_dlq(
            tenant_id,park_id,original_event_id,consumer_name,notification_delivery_id,
            payload_hash,failure_side,error_category,error_code,attempt_count,
            first_failed_at,last_failed_at,status
          )
          SELECT n.tenant_id,n.park_id,n.source_event_id,$4,d.id,o.payload_hash,
            'consumer','infrastructure',$5,d.attempt_count,
            clock_timestamp(),clock_timestamp(),'active'
          FROM biz_property_notification_delivery d
          JOIN rel_property_notification_recipient r ON r.tenant_id=d.tenant_id
            AND r.park_id=d.park_id AND r.id=d.recipient_id
          JOIN biz_property_notification n ON n.tenant_id=r.tenant_id
            AND n.park_id=r.park_id AND n.id=r.notification_id
          JOIN biz_property_outbox o ON o.tenant_id=n.tenant_id
            AND o.park_id=n.park_id AND o.event_id=n.source_event_id
          WHERE d.tenant_id=$1 AND d.park_id=$2 AND d.id=$3
          ON CONFLICT (tenant_id,park_id,original_event_id,consumer_name,failure_side)
          DO UPDATE SET error_code=EXCLUDED.error_code,
            attempt_count=EXCLUDED.attempt_count,last_failed_at=clock_timestamp(),
            status='active',version=biz_property_event_dlq.version+1`,
          [
            delivery.tenant_id, delivery.park_id, delivery.id,
            `notification-delivery:${text(delivery.id)}`, input.errorCode
          ]
        );
      }
      return status;
    });
  }

  private async mapNotification(row: Row): Promise<NotificationListItem> {
    const deliveries = await this.dataSource.query(
      `SELECT d.channel,d.delivery_status,d.attempt_count,
        audit.last_attempt_at,d.next_retry_at,d.delivered_at,d.exhausted_at,d.last_error_code
       FROM biz_property_notification_delivery d
       LEFT JOIN LATERAL (
         SELECT max(a.occurred_at) AS last_attempt_at
         FROM biz_property_notification_delivery_audit a
         WHERE a.tenant_id=d.tenant_id AND a.park_id=d.park_id AND a.delivery_id=d.id
       ) audit ON true
       WHERE d.tenant_id=$1 AND d.park_id=$2 AND d.recipient_id=$3
       ORDER BY d.channel`,
      [row.tenant_id, row.park_id, row.recipient_id]
    ) as Row[];
    const route = row.route_params as Record<string, unknown>;
    return {
      id: text(row.id), eventId: text(row.source_event_id),
      notificationType: text(row.notification_type), title: text(row.title),
      summary: text(row.summary), severity: text(row.severity),
      sourceType: text(route.sourceType), sourceId: text(route.sourceId),
      deepLink: buildPropertyNotificationDeepLink(
        row.notification_type as NotificationProjectionInput["notificationType"],
        text(route.routeId)
      ),
      createdAt: iso(row.created_at), readAt: nullableIso(row.read_at),
      readVersion: number(row.read_version),
      channelDeliveries: deliveries.map((delivery) => ({
        channel: text(delivery.channel),
        status: delivery.delivery_status as NotificationListItem["channelDeliveries"][number]["status"],
        attemptCount: number(delivery.attempt_count),
        lastAttemptAt: nullableIso(delivery.last_attempt_at),
        nextRetryAt: nullableIso(delivery.next_retry_at),
        deliveredAt: nullableIso(delivery.delivered_at),
        exhaustedAt: nullableIso(delivery.exhausted_at),
        errorCode: delivery.last_error_code == null ? null : text(delivery.last_error_code)
      })),
      allowedActions: ["property.notification.mark-read"]
    };
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function mutationRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return Array.isArray(value[0]) ? value[0] as Row[] : value as Row[];
}
