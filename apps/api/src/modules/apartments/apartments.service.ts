import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { DataSource, type EntityManager } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { AllocateApartmentDto, ApartmentUnitCandidateQueryDto, ArchiveDocumentDto, CreateApartmentApplicationDto, CreateApartmentRoomDto, CreateTemplateDto, DecisionDto, GenerateApartmentDocumentDto, HandoverDto, ListApartmentDto, OnlineSignApartmentDocumentDto, PaperSignApartmentDocumentDto, UpdateApartmentRoomDto, UpdateApartmentSettingsDto, VoidApartmentDocumentDto } from "./dto/apartment.dto";

@Injectable()
export class ApartmentsService {
  constructor(private readonly dataSource: DataSource) {}
  private scope(scope: TenantParkScope) { return [scope.tenantId, scope.parkId]; }

  async summary(scope: TenantParkScope) {
    const [row] = await this.dataSource.query(`SELECT
      (SELECT count(*)::int FROM biz_apartment_room r WHERE r.tenant_id=$1 AND r.park_id=$2 AND r.is_deleted=false AND r.management_status='enabled') AS rooms,
      (SELECT COALESCE(sum(r.capacity),0)::int FROM biz_apartment_room r WHERE r.tenant_id=$1 AND r.park_id=$2 AND r.is_deleted=false AND r.management_status='enabled') AS beds,
      (SELECT count(*)::int FROM biz_apartment_stay s WHERE s.tenant_id=$1 AND s.park_id=$2 AND s.is_deleted=false AND s.status='active') AS occupied,
      (SELECT count(*)::int FROM biz_apartment_application a WHERE a.tenant_id=$1 AND a.park_id=$2 AND a.is_deleted=false AND a.status='submitted') AS pending_applications,
      (SELECT count(*)::int FROM biz_apartment_stay s WHERE s.tenant_id=$1 AND s.park_id=$2 AND s.is_deleted=false AND s.status='checkout_pending') AS pending_checkouts`, this.scope(scope));
    return { ...row, available: Math.max(0, Number(row.beds)-Number(row.occupied)) };
  }

  listRooms(scope: TenantParkScope, query: ListApartmentDto) {
    return this.dataSource.query(`SELECT r.*,u.unit_code,u.unit_name,b.building_name AS building_name,f.floor_name,
      count(bed.id)::int AS bed_count,count(s.id) FILTER (WHERE s.status IN ('reserved','active','checkout_pending'))::int AS occupied_count
      FROM biz_apartment_room r JOIN biz_unit u ON u.id=r.unit_id
      LEFT JOIN biz_building b ON b.id=u.building_id LEFT JOIN biz_floor f ON f.id=u.floor_id
      LEFT JOIN biz_apartment_bed bed ON bed.room_id=r.id AND bed.is_deleted=false
      LEFT JOIN biz_apartment_stay s ON s.bed_id=bed.id AND s.is_deleted=false AND s.status IN ('reserved','active','checkout_pending')
      WHERE r.tenant_id=$1 AND r.park_id=$2 AND r.is_deleted=false
      AND ($3::text IS NULL OR r.management_status=$3)
      AND ($4::text IS NULL OR u.unit_name ILIKE '%'||$4||'%' OR u.unit_code ILIKE '%'||$4||'%')
      GROUP BY r.id,u.id,b.id,f.id ORDER BY u.unit_code`, [...this.scope(scope), query.status ?? null, query.keyword?.trim() || null]);
  }
  async unitCandidates(scope:TenantParkScope,query:ApartmentUnitCandidateQueryDto){
    const filters=`WHERE u.tenant_id=$1 AND u.park_id=$2 AND u.is_deleted=false
        AND ($3::text IS NULL OR u.unit_code ILIKE '%'||$3||'%' OR u.unit_name ILIKE '%'||$3||'%' OR b.building_name ILIKE '%'||$3||'%' OR f.floor_name ILIKE '%'||$3||'%')
        AND ($4::uuid IS NULL OR u.building_id=$4) AND ($5::uuid IS NULL OR u.floor_id=$5)
        AND (NOT $6::boolean OR cardinality(candidate.ineligible_reasons)=0)`;
    const filterParameters=[...this.scope(scope),query.keyword?.trim()||null,query.building_id??null,query.floor_id??null,query.eligible_only];
    const rows=await this.dataSource.query(`${this.candidateProjectionSql()} ${filters}
      ORDER BY u.unit_code LIMIT $7 OFFSET $8`,[...filterParameters,query.page_size,(query.page-1)*query.page_size]);
    const total=rows.length?Number(rows[0].total):Number((await this.dataSource.query(`SELECT count(*)::int AS total FROM (${this.candidateProjectionSql()} ${filters}) empty_page`,filterParameters))[0]?.total??0);
    const facets=await this.dataSource.query(`SELECT DISTINCT b.id AS building_id,b.building_name,f.id AS floor_id,f.floor_name
      FROM biz_unit u JOIN biz_building b ON b.id=u.building_id AND b.tenant_id=u.tenant_id AND b.park_id=u.park_id AND b.is_deleted=false
      JOIN biz_floor f ON f.id=u.floor_id AND f.building_id=b.id AND f.tenant_id=u.tenant_id AND f.park_id=u.park_id AND f.is_deleted=false
      WHERE u.tenant_id=$1 AND u.park_id=$2 AND u.is_deleted=false ORDER BY b.building_name,f.floor_name`,this.scope(scope));
    const buildings=Array.from(new Map(facets.map((row:{building_id:string;building_name:string})=>[row.building_id,{id:row.building_id,name:row.building_name}])).values());
    return {items:rows.map(({total:_,...row}:Record<string,unknown>)=>row),total,page:query.page,page_size:query.page_size,
      facets:{buildings,floors:facets.map((row:{building_id:string;floor_id:string;floor_name:string})=>({id:row.floor_id,building_id:row.building_id,name:row.floor_name}))}};
  }
  availableBeds(scope:TenantParkScope,start:string,end?:string){return this.dataSource.query(`SELECT b.id,b.bed_code,b.room_id,u.unit_code,u.unit_name,r.room_type,r.gender_policy FROM biz_apartment_bed b JOIN biz_apartment_room r ON r.id=b.room_id JOIN biz_unit u ON u.id=r.unit_id WHERE b.tenant_id=$1 AND b.park_id=$2 AND b.is_deleted=false AND b.status='enabled' AND r.is_deleted=false AND r.management_status='enabled' AND NOT EXISTS(SELECT 1 FROM biz_apartment_stay s WHERE s.bed_id=b.id AND s.is_deleted=false AND s.status IN ('reserved','active','checkout_pending') AND daterange(s.planned_start_date,COALESCE(s.planned_end_date,'infinity'::date),'[)') && daterange($3::date,COALESCE($4::date,'infinity'::date),'[)')) ORDER BY u.unit_code,b.bed_code`,[...this.scope(scope),start,end??null]);}

  async createRoom(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateApartmentRoomDto) {
    return this.dataSource.transaction(async manager => {
      await manager.query("SELECT lock_property_unit_scope($1, $2, $3)", [...this.scope(scope), dto.unit_id]);
      const unit = await manager.query(`SELECT id FROM biz_unit WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE`, [dto.unit_id, ...this.scope(scope)]);
      if (!unit.length) throw new NotFoundException("房源不存在或不在当前园区");
      const candidate=await this.loadCandidate(manager,scope,dto.unit_id);
      if(!candidate.eligible)throw new ConflictException({message:"房号当前不可纳入公寓管理",ineligibleReasons:candidate.ineligible_reasons});
      const [room] = await manager.query(`INSERT INTO biz_apartment_room(tenant_id,park_id,unit_id,room_type,gender_policy,capacity,facilities,effective_from,management_status,create_by,update_by)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'enabled',$9,$9) RETURNING *`, [...this.scope(scope), dto.unit_id,dto.room_type,dto.gender_policy??"any",dto.capacity,JSON.stringify(dto.facilities??[]),dto.effective_from??new Date().toISOString().slice(0,10),actor.sub]);
      const [occupancy] = await manager.query(`INSERT INTO biz_property_occupancy(tenant_id,park_id,unit_id,source_domain,source_type,source_id,start_at,end_at,status,create_by,update_by)
        VALUES($1,$2,$3,'apartment','apartment_room',$4,$5::date,'9999-12-31','active',$6,$6) RETURNING id`, [...this.scope(scope),dto.unit_id,room.id,dto.effective_from??new Date().toISOString().slice(0,10),actor.sub]);
      await manager.query(`UPDATE biz_apartment_room SET occupancy_id=$1 WHERE id=$2`, [occupancy.id,room.id]);
      for (let i=1;i<=dto.capacity;i++) await manager.query(`INSERT INTO biz_apartment_bed(tenant_id,park_id,room_id,bed_code,status,create_by,update_by) VALUES($1,$2,$3,$4,'enabled',$5,$5)`, [...this.scope(scope),room.id,String(i).padStart(2,"0"),actor.sub]);
      return { ...room, occupancy_id: occupancy.id };
    }).catch(this.translateConflict);
  }

  async updateRoom(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateApartmentRoomDto) {
    return this.dataSource.transaction(async manager => {
      const [room] = await manager.query(`SELECT * FROM biz_apartment_room WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE`, [id,...this.scope(scope)]);
      if (!room) throw new NotFoundException("公寓房间不存在");
      const [{ count }] = await manager.query(`SELECT count(*)::int count FROM biz_apartment_stay WHERE room_id=$1 AND status IN ('reserved','active','checkout_pending') AND is_deleted=false`,[id]);
      if (dto.capacity !== undefined && dto.capacity < count) throw new ConflictException("新容量不能小于当前占用数");
      if(dto.management_status&&dto.management_status!==room.management_status){
        await manager.query("SELECT lock_property_unit_scope($1, $2, $3)",[...this.scope(scope),room.unit_id]);
        if(dto.management_status==="disabled"){
          if(Number(count)>0)throw new ConflictException("存在预留、在住或待退住记录，不能停用公寓房源");
          await manager.query(`UPDATE biz_property_occupancy SET status='released',release_reason='apartment-room-disabled',released_at=now(),update_by=$1,update_time=now(),version=version+1 WHERE id=$2 AND tenant_id=$3 AND park_id=$4 AND status IN ('active','held') AND is_deleted=false`,[actor.sub,room.occupancy_id,...this.scope(scope)]);
        }else{
          const candidate=await this.loadCandidate(manager,scope,room.unit_id,id);
          if(!candidate.eligible)throw new ConflictException({message:"房号当前不可恢复公寓管理",ineligibleReasons:candidate.ineligible_reasons});
          let [occupancy]=await manager.query(`UPDATE biz_property_occupancy SET status='active',start_at=now(),end_at='9999-12-31',release_reason=NULL,released_at=NULL,update_by=$1,update_time=now(),version=version+1
            WHERE id=$2 AND tenant_id=$3 AND park_id=$4 AND source_domain='apartment' AND source_type='apartment_room' AND source_id=$5 AND status='released' AND is_deleted=false RETURNING id`,[actor.sub,room.occupancy_id,...this.scope(scope),id]);
          if(!occupancy)[occupancy]=await manager.query(`INSERT INTO biz_property_occupancy(tenant_id,park_id,unit_id,source_domain,source_type,source_id,start_at,end_at,status,create_by,update_by)
            VALUES($1,$2,$3,'apartment','apartment_room',$4,now(),'9999-12-31','active',$5,$5) RETURNING id`,[...this.scope(scope),room.unit_id,id,actor.sub]);
          room.occupancy_id=occupancy.id;
        }
      }
      if(dto.capacity!==undefined&&dto.capacity<room.capacity){
        const removeCount=Number(room.capacity)-dto.capacity;
        const removable=await manager.query(`SELECT bed.id FROM biz_apartment_bed bed WHERE bed.room_id=$1 AND bed.tenant_id=$2 AND bed.park_id=$3 AND bed.status='enabled' AND bed.is_deleted=false
          AND NOT EXISTS(SELECT 1 FROM biz_apartment_stay stay WHERE stay.bed_id=bed.id) ORDER BY bed.bed_code DESC LIMIT $4 FOR UPDATE`,[id,...this.scope(scope),removeCount]);
        if(removable.length!==removeCount)throw new ConflictException("存在历史床位，无法安全缩减到目标容量");
        await manager.query(`UPDATE biz_apartment_bed SET status='disabled',update_by=$1,update_time=now(),version=version+1 WHERE id=ANY($2::uuid[])`,[actor.sub,removable.map((bed:{id:string})=>bed.id)]);
      }
      await manager.query(`UPDATE biz_apartment_room SET room_type=COALESCE($1,room_type),gender_policy=COALESCE($2,gender_policy),capacity=COALESCE($3,capacity),facilities=COALESCE($4::jsonb,facilities),management_status=COALESCE($5,management_status),occupancy_id=COALESCE($6,occupancy_id),update_by=$7,update_time=now(),version=version+1 WHERE id=$8`,[dto.room_type??null,dto.gender_policy??null,dto.capacity??null,dto.facilities?JSON.stringify(dto.facilities):null,dto.management_status??null,room.occupancy_id??null,actor.sub,id]);
      if (dto.capacity && dto.capacity > room.capacity) for(let i=room.capacity+1;i<=dto.capacity;i++) await manager.query(`INSERT INTO biz_apartment_bed(tenant_id,park_id,room_id,bed_code,status,create_by,update_by) VALUES($1,$2,$3,$4,'enabled',$5,$5) ON CONFLICT (tenant_id,park_id,room_id,bed_code) WHERE is_deleted=false DO UPDATE SET status='enabled',update_by=EXCLUDED.update_by,update_time=now(),version=biz_apartment_bed.version+1`,[...this.scope(scope),id,String(i).padStart(2,"0"),actor.sub]);
      return (await manager.query(`SELECT * FROM biz_apartment_room WHERE id=$1`,[id]))[0];
    });
  }

  listApplications(scope: TenantParkScope, query: ListApartmentDto) { return this.dataSource.query(`SELECT a.*,u.display_name AS applicant_user_name,
    ap.decision AS approval_decision,ap.opinion AS approval_opinion,ap.approved_start_date,ap.approved_end_date,
    ap.cost_bearer,ap.deposit_amount,ap.monthly_fee,ap.allocation_note,ap.safety_requirements,
    ap.decided_at AS approval_decided_at,approver.display_name AS approval_decided_by_name
    FROM biz_apartment_application a
    LEFT JOIN sys_user u ON u.id=a.applicant_user_id AND u.tenant_id=a.tenant_id AND u.is_deleted=false
    LEFT JOIN LATERAL(SELECT x.* FROM biz_apartment_approval x WHERE x.application_id=a.id AND x.tenant_id=a.tenant_id AND x.park_id=a.park_id AND x.is_deleted=false ORDER BY x.decided_at DESC LIMIT 1) ap ON true
    LEFT JOIN sys_user approver ON approver.id=ap.decided_by AND approver.tenant_id=a.tenant_id AND approver.is_deleted=false
    WHERE a.tenant_id=$1 AND a.park_id=$2 AND a.is_deleted=false AND ($3::text IS NULL OR a.status=$3) AND ($4::text IS NULL OR a.applicant_name ILIKE '%'||$4||'%' OR a.application_code ILIKE '%'||$4||'%') ORDER BY a.create_time DESC`,[...this.scope(scope),query.status??null,query.keyword?.trim()||null]); }
  async createApplication(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateApartmentApplicationDto) {
    if (!dto.applicant_party_id && !dto.applicant_user_id) dto.applicant_user_id=actor.sub;
    if (dto.requested_end_date && dto.requested_start_date>=dto.requested_end_date) throw new BadRequestException("结束日期必须晚于开始日期");
    const code=`APT-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${randomUUID().slice(0,8).toUpperCase()}`;
    const [row]=await this.dataSource.query(`INSERT INTO biz_apartment_application(tenant_id,park_id,application_code,applicant_party_id,applicant_user_id,applicant_name,applicant_type,organization_name,department_name,job_title,mobile_masked,identity_number_masked,emergency_contact_name,emergency_contact_mobile,household_size,accompanying_names,vehicle_plate,accommodation_notes,policy_accepted,requested_room_type,requested_start_date,requested_end_date,reason,status,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'draft',$24,$24) RETURNING *`,[...this.scope(scope),code,dto.applicant_party_id??null,dto.applicant_user_id??null,dto.applicant_name,dto.applicant_type,dto.organization_name??null,dto.department_name??null,dto.job_title??null,dto.mobile_masked??null,dto.identity_number_masked??null,dto.emergency_contact_name,dto.emergency_contact_mobile,dto.household_size,dto.accompanying_names??null,dto.vehicle_plate?.toUpperCase()??null,dto.accommodation_notes??null,dto.policy_accepted,dto.requested_room_type,dto.requested_start_date,dto.requested_end_date??null,dto.reason,actor.sub]); return row;
  }
  async submit(scope:TenantParkScope,actor:JwtPrincipal,id:string){return this.transition(scope,actor,id,"draft","submitted",`submitted_at=now()`);}
  async cancel(scope:TenantParkScope,actor:JwtPrincipal,id:string){const [r]=await this.dataSource.query(`UPDATE biz_apartment_application SET status='cancelled',update_by=$1,update_time=now(),version=version+1 WHERE id=$2 AND tenant_id=$3 AND park_id=$4 AND status IN ('draft','submitted','approved') AND is_deleted=false RETURNING *`,[actor.sub,id,...this.scope(scope)]);if(!r)throw new ConflictException("当前状态不可取消申请");return r;}
  async decide(scope:TenantParkScope,actor:JwtPrincipal,id:string,dto:DecisionDto){
    if(dto.decision==="approve"){
      if(!dto.approved_start_date||!dto.cost_bearer||!dto.safety_requirements)throw new BadRequestException("批准时必须填写批准起日、费用承担和安全要求");
      if(dto.approved_end_date&&dto.approved_start_date>=dto.approved_end_date)throw new BadRequestException("批准止日必须晚于起日");
    }
    return this.dataSource.transaction(async manager=>{const [app]=await this.lockApplication(manager,scope,id);if(!app)throw new NotFoundException("入住申请不存在");if(app.status!=="submitted")throw new ConflictException("仅已提交申请可审批");await manager.query(`INSERT INTO biz_apartment_approval(tenant_id,park_id,application_id,application_version,decision,decided_by,opinion,approved_start_date,approved_end_date,cost_bearer,deposit_amount,monthly_fee,allocation_note,safety_requirements,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::numeric,$12::numeric,$13,$14,$6,$6)`,[...this.scope(scope),id,app.version,dto.decision,actor.sub,dto.opinion,dto.decision==="approve"?dto.approved_start_date:null,dto.decision==="approve"?dto.approved_end_date??null:null,dto.decision==="approve"?dto.cost_bearer:null,dto.decision==="approve"?dto.deposit_amount??null:null,dto.decision==="approve"?dto.monthly_fee??null:null,dto.decision==="approve"?dto.allocation_note??null:null,dto.decision==="approve"?dto.safety_requirements:null]);const status=dto.decision==="approve"?"approved":"rejected";return (await manager.query(`UPDATE biz_apartment_application SET status=$1,decided_at=now(),update_by=$2,update_time=now(),version=version+1 WHERE id=$3 RETURNING *`,[status,actor.sub,id]))[0];});
  }
  async allocate(scope:TenantParkScope,actor:JwtPrincipal,id:string,dto:AllocateApartmentDto){return this.dataSource.transaction(async manager=>{const [app]=await manager.query(`SELECT a.*,ap.approved_start_date,ap.approved_end_date FROM biz_apartment_application a LEFT JOIN LATERAL(SELECT approved_start_date,approved_end_date FROM biz_apartment_approval x WHERE x.application_id=a.id AND x.decision='approve' AND x.is_deleted=false ORDER BY x.decided_at DESC LIMIT 1) ap ON true WHERE a.id=$1 AND a.tenant_id=$2 AND a.park_id=$3 AND a.is_deleted=false FOR UPDATE OF a`,[id,...this.scope(scope)]);if(!app)throw new NotFoundException("入住申请不存在");if(app.status!=="approved")throw new ConflictException("仅已批准申请可分配床位");const [bed]=await manager.query(`SELECT b.id,b.room_id,r.room_type,r.gender_policy,r.management_status FROM biz_apartment_bed b JOIN biz_apartment_room r ON r.id=b.room_id WHERE b.id=$1 AND b.room_id=$2 AND b.tenant_id=$3 AND b.park_id=$4 AND b.status='enabled' AND b.is_deleted=false AND r.is_deleted=false FOR UPDATE`,[dto.bed_id,dto.room_id,...this.scope(scope)]);if(!bed||bed.management_status!=="enabled")throw new ConflictException("床位当前不可分配");if(bed.room_type!==app.requested_room_type)throw new ConflictException("所选床位与申请房型不符");const plannedStart=app.approved_start_date??app.requested_start_date,plannedEnd=dto.planned_end_date??app.approved_end_date??app.requested_end_date;const [conflict]=await manager.query(`SELECT id FROM biz_apartment_stay WHERE bed_id=$1 AND is_deleted=false AND status IN ('reserved','active','checkout_pending') AND daterange(planned_start_date,COALESCE(planned_end_date,'infinity'::date),'[)') && daterange($2::date,COALESCE($3::date,'infinity'::date),'[)') LIMIT 1`,[dto.bed_id,plannedStart,plannedEnd]);if(conflict)throw new ConflictException("床位在批准期限内已被占用");const code=`STAY-${Date.now()}-${randomUUID().slice(0,6).toUpperCase()}`;const [stay]=await manager.query(`INSERT INTO biz_apartment_stay(tenant_id,park_id,stay_code,application_id,room_id,bed_id,occupant_party_id,occupant_user_id,occupant_name,planned_start_date,planned_end_date,status,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'reserved',$12,$12) RETURNING *`,[...this.scope(scope),code,id,dto.room_id,dto.bed_id,app.applicant_party_id,app.applicant_user_id,app.applicant_name,plannedStart,plannedEnd,actor.sub]);await manager.query(`UPDATE biz_apartment_application SET status='allocated',update_by=$1,update_time=now(),version=version+1 WHERE id=$2`,[actor.sub,id]);return stay;}).catch(this.translateConflict);}
  listStays(scope:TenantParkScope,query:ListApartmentDto){return this.dataSource.query(`SELECT s.*,a.application_code,u.unit_name,u.unit_code,b.bed_code,
    hi.confirmed_at AS move_in_confirmed_at,hi.water_meter_reading AS move_in_water_meter_reading,hi.electricity_meter_reading AS move_in_electricity_meter_reading,hi.exception_note AS move_in_exception_note,
    ho.confirmed_at AS move_out_confirmed_at,ho.water_meter_reading AS move_out_water_meter_reading,ho.electricity_meter_reading AS move_out_electricity_meter_reading,ho.exception_note AS move_out_exception_note
    FROM biz_apartment_stay s JOIN biz_apartment_application a ON a.id=s.application_id JOIN biz_apartment_room r ON r.id=s.room_id JOIN biz_unit u ON u.id=r.unit_id JOIN biz_apartment_bed b ON b.id=s.bed_id
    LEFT JOIN biz_apartment_handover hi ON hi.stay_id=s.id AND hi.handover_type='move_in' AND hi.is_deleted=false
    LEFT JOIN biz_apartment_handover ho ON ho.stay_id=s.id AND ho.handover_type='move_out' AND ho.is_deleted=false
    WHERE s.tenant_id=$1 AND s.park_id=$2 AND s.is_deleted=false AND ($3::text IS NULL OR s.status=$3) AND ($4::text IS NULL OR s.occupant_name ILIKE '%'||$4||'%' OR s.stay_code ILIKE '%'||$4||'%') ORDER BY s.create_time DESC`,[...this.scope(scope),query.status??null,query.keyword?.trim()||null]);}
  async checkIn(scope:TenantParkScope,actor:JwtPrincipal,id:string,dto:HandoverDto){return this.handover(scope,actor,id,"move_in",dto,"reserved","active");}
  async handoverMeters(scope:TenantParkScope,id:string){return this.dataSource.query(`SELECT m.id,m.meter_code,m.meter_name,m.meter_type,m.unit,m.current_reading,m.last_reading_at FROM biz_apartment_stay s JOIN biz_apartment_room r ON r.id=s.room_id AND r.is_deleted=false JOIN energy_meter m ON m.room_id=r.unit_id AND m.tenant_id=s.tenant_id AND m.park_id=s.park_id AND m.is_deleted=false AND m.is_enabled=true AND m.status<>'DISABLED' AND m.meter_type IN ('WATER','ELECTRIC') WHERE s.id=$1 AND s.tenant_id=$2 AND s.park_id=$3 AND s.is_deleted=false ORDER BY m.meter_type,m.meter_code`,[id,...this.scope(scope)]);}
  async requestCheckout(scope:TenantParkScope,actor:JwtPrincipal,id:string){return this.dataSource.transaction(async manager=>{const [stay]=await manager.query(`SELECT * FROM biz_apartment_stay WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE`,[id,...this.scope(scope)]);if(!stay||stay.status!=="active")throw new ConflictException("仅在住记录可发起退房");await manager.query(`UPDATE biz_apartment_stay SET status='checkout_pending',checkout_requested_at=now(),update_by=$1,update_time=now() WHERE id=$2`,[actor.sub,id]);await manager.query(`UPDATE biz_apartment_application SET status='checkout_pending',update_by=$1,update_time=now() WHERE id=$2`,[actor.sub,stay.application_id]);return {id,status:"checkout_pending"};});}
  async checkOut(scope:TenantParkScope,actor:JwtPrincipal,id:string,dto:HandoverDto){return this.handover(scope,actor,id,"move_out",dto,"checkout_pending","completed");}
  async getSettings(scope:TenantParkScope){const [row]=await this.dataSource.query(`SELECT default_application_reason FROM biz_apartment_setting WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false`,this.scope(scope));return row??{default_application_reason:"因工作安排及人才保障需要，申请入住集团人才公寓（员工宿舍），本人承诺遵守公寓管理、安全消防及退房交接规定。"};}
  async updateSettings(scope:TenantParkScope,actor:JwtPrincipal,dto:UpdateApartmentSettingsDto){const [row]=await this.dataSource.query(`INSERT INTO biz_apartment_setting(tenant_id,park_id,default_application_reason,create_by,update_by) VALUES($1,$2,$3,$4,$4) ON CONFLICT(tenant_id,park_id) WHERE is_deleted=false DO UPDATE SET default_application_reason=EXCLUDED.default_application_reason,update_by=EXCLUDED.update_by,update_time=now(),version=biz_apartment_setting.version+1 RETURNING *`,[...this.scope(scope),dto.default_application_reason,actor.sub]);return row;}
  listTemplates(scope:TenantParkScope){return this.dataSource.query(`SELECT * FROM biz_apartment_document_template WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false ORDER BY document_type,version_no DESC`,this.scope(scope));}
  async createTemplate(scope:TenantParkScope,actor:JwtPrincipal,dto:CreateTemplateDto){const safeContent=this.sanitizeTemplate(dto.content_html);const [r]=await this.dataSource.query(`INSERT INTO biz_apartment_document_template(tenant_id,park_id,document_type,version_no,status,title,content_html,template_file_id,variable_schema,create_by,update_by) VALUES($1,$2,$3,$4,'draft',$5,$6,$7,$8::jsonb,$9,$9) RETURNING *`,[...this.scope(scope),dto.document_type,dto.version_no,dto.title,safeContent,dto.template_file_id??null,JSON.stringify(dto.variable_schema??{}),actor.sub]);return r;}
  async publishTemplate(scope:TenantParkScope,actor:JwtPrincipal,id:string){const [r]=await this.dataSource.query(`UPDATE biz_apartment_document_template SET status='published',published_at=now(),update_by=$1,update_time=now() WHERE id=$2 AND tenant_id=$3 AND park_id=$4 AND status='draft' AND is_deleted=false RETURNING *`,[actor.sub,id,...this.scope(scope)]);if(!r)throw new ConflictException("仅草稿模板可发布");return r;}
  listDocuments(scope:TenantParkScope){return this.dataSource.query(`SELECT d.*,a.applicant_name,a.application_code,s.stay_code FROM biz_apartment_document d LEFT JOIN biz_apartment_application a ON a.id=d.application_id LEFT JOIN biz_apartment_stay s ON s.id=d.stay_id WHERE d.tenant_id=$1 AND d.park_id=$2 AND d.is_deleted=false ORDER BY d.create_time DESC`,this.scope(scope));}
  async getDocument(scope:TenantParkScope,id:string){const [row]=await this.dataSource.query(`SELECT d.*,a.applicant_name,a.application_code,s.stay_code FROM biz_apartment_document d LEFT JOIN biz_apartment_application a ON a.id=d.application_id LEFT JOIN biz_apartment_stay s ON s.id=d.stay_id WHERE d.id=$1 AND d.tenant_id=$2 AND d.park_id=$3 AND d.is_deleted=false`,[id,...this.scope(scope)]);if(!row)throw new NotFoundException("公寓文书不存在");return row;}
  async generateDocument(scope:TenantParkScope,actor:JwtPrincipal,dto:GenerateApartmentDocumentDto){
    if(!dto.stay_id&&!dto.application_id)throw new BadRequestException("必须关联申请或入住记录");
    const [template]=await this.dataSource.query(`SELECT * FROM biz_apartment_document_template WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND status='published' AND is_deleted=false`,[dto.template_id,...this.scope(scope)]);
    if(!template)throw new NotFoundException("已发布模板不存在");
    const variables=await this.resolveDocumentVariables(scope,dto.application_id,dto.stay_id,dto.variables??{});
    const content=this.renderTemplate(template.content_html,variables);
    const documentNo=`APTDOC-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${randomUUID().slice(0,8).toUpperCase()}`;
    const [row]=await this.dataSource.query(`INSERT INTO biz_apartment_document(tenant_id,park_id,document_no,stay_id,application_id,template_id,document_type,template_version,title,content_html,status,variable_snapshot,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending_signature',$11::jsonb,$12,$12) RETURNING *`,[...this.scope(scope),documentNo,dto.stay_id??null,dto.application_id??null,template.id,template.document_type,template.version_no,template.title,content,JSON.stringify(variables),actor.sub]);
    return row;
  }
  async renderDocument(scope:TenantParkScope,id:string){const row=await this.getDocument(scope,id);return {filename:`${row.document_no}-${row.title}.html`,html:this.printableHtml(row)};}
  async onlineSign(scope:TenantParkScope,actor:JwtPrincipal,id:string,dto:OnlineSignApartmentDocumentDto){return this.dataSource.transaction(async manager=>{const [row]=await manager.query(`SELECT * FROM biz_apartment_document WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE`,[id,...this.scope(scope)]);if(!row)throw new NotFoundException("公寓文书不存在");if(row.status!=="pending_signature")throw new ConflictException("仅待签文书可线上签署");const hash=createHash("sha256").update(row.content_html,"utf8").digest("hex");const evidence={client_label:dto.client_label??null,confirmed_at:new Date().toISOString(),document_hash:hash};const [signed]=await manager.query(`UPDATE biz_apartment_document SET status='online_signed',signature_method='online',signer_user_id=$1,signer_name=$2,signature_statement=$3,signature_evidence=$4::jsonb,signed_sha256=$5,signed_at=now(),update_by=$1,update_time=now(),version=version+1 WHERE id=$6 RETURNING *`,[actor.sub,dto.signer_name,dto.statement,JSON.stringify(evidence),hash,id]);return signed;});}
  async paperSign(scope:TenantParkScope,actor:JwtPrincipal,id:string,dto:PaperSignApartmentDocumentDto){return this.dataSource.transaction(async manager=>{const [row]=await manager.query(`SELECT * FROM biz_apartment_document WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE`,[id,...this.scope(scope)]);if(!row)throw new NotFoundException("公寓文书不存在");if(row.status!=="pending_signature")throw new ConflictException("仅待签文书可归档纸签件");const [file]=await manager.query(`SELECT content_sha256 FROM sys_file WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false AND status=1`,[dto.signed_file_id,...this.scope(scope)]);if(!file)throw new NotFoundException("纸质签字文件不存在或不在当前园区");const hash=file.content_sha256??createHash("sha256").update(`${row.content_html}:${dto.signed_file_id}`,"utf8").digest("hex");return (await manager.query(`UPDATE biz_apartment_document SET status='paper_signed',signature_method='paper',signed_file_id=$1,signed_sha256=$2,signed_at=now(),update_by=$3,update_time=now(),version=version+1 WHERE id=$4 RETURNING *`,[dto.signed_file_id,hash,actor.sub,id]))[0];});}
  async voidDocument(scope:TenantParkScope,actor:JwtPrincipal,id:string,dto:VoidApartmentDocumentDto){const [row]=await this.dataSource.query(`UPDATE biz_apartment_document SET status='void',voided_at=now(),void_reason=$1,update_by=$2,update_time=now(),version=version+1 WHERE id=$3 AND tenant_id=$4 AND park_id=$5 AND status<>'void' AND is_deleted=false RETURNING *`,[dto.reason,actor.sub,id,...this.scope(scope)]);if(!row)throw new ConflictException("文书不存在或已作废");return row;}
  async archiveDocument(scope:TenantParkScope,actor:JwtPrincipal,dto:ArchiveDocumentDto){const row=await this.generateDocument(scope,actor,dto);return dto.signed_file_id?this.paperSign(scope,actor,row.id,{signed_file_id:dto.signed_file_id}):row;}

  private candidateProjectionSql(ignoreRoomExpression="NULL::uuid") { return `SELECT u.id,u.unit_code,u.unit_name,u.building_id,u.floor_id,u.asset_unit_id,u.status,
      b.building_name,f.floor_name,ar.id AS apartment_room_id,pc.operating_mode,pc.operating_status,
      CASE WHEN u.asset_unit_id IS NULL THEN 'unmapped_external' WHEN ab.asset_building_id=au.building_id AND af.asset_floor_id=au.floor_id THEN 'mapped_complete' ELSE 'mapped_incomplete' END AS asset_mapping_status,
      (SELECT count(*)::int FROM energy_meter em WHERE em.tenant_id=u.tenant_id AND em.park_id=u.park_id AND em.room_id=u.id AND em.is_deleted=false AND em.is_enabled=true) AS meter_count,
      candidate.ineligible_reasons,cardinality(candidate.ineligible_reasons)=0 AS eligible,count(*) OVER()::int AS total
      FROM biz_unit u JOIN biz_building b ON b.id=u.building_id AND b.tenant_id=u.tenant_id AND b.park_id=u.park_id AND b.is_deleted=false
      JOIN biz_floor f ON f.id=u.floor_id AND f.building_id=u.building_id AND f.tenant_id=u.tenant_id AND f.park_id=u.park_id AND f.is_deleted=false
      LEFT JOIN asset_unit au ON au.id=u.asset_unit_id AND au.tenant_id::text=u.tenant_id AND au.park_id::text=u.park_id AND au.is_deleted=false
      LEFT JOIN biz_building ab ON ab.id=u.building_id AND ab.is_deleted=false
      LEFT JOIN biz_floor af ON af.id=u.floor_id AND af.is_deleted=false
      LEFT JOIN biz_apartment_room ar ON ar.unit_id=u.id AND ar.tenant_id=u.tenant_id AND ar.park_id=u.park_id AND ar.is_deleted=false
      LEFT JOIN biz_property_operation_config pc ON pc.unit_id=u.id AND pc.tenant_id=u.tenant_id AND pc.park_id=u.park_id AND pc.is_deleted=false
      CROSS JOIN LATERAL (SELECT array_remove(ARRAY[
        CASE WHEN ar.id IS NOT NULL AND ar.id<>COALESCE(${ignoreRoomExpression},'00000000-0000-0000-0000-000000000000'::uuid) THEN 'already_apartment_managed' END,
        CASE WHEN u.status<>1 THEN 'unit_disabled' END,
        CASE WHEN u.asset_unit_id IS NOT NULL AND (au.id IS NULL OR ab.asset_building_id IS DISTINCT FROM au.building_id OR af.asset_floor_id IS DISTINCT FROM au.floor_id) THEN 'asset_parent_mapping_incomplete' END,
        CASE WHEN pc.id IS NOT NULL AND pc.operating_status<>'enabled' THEN 'operating_config_disabled' END,
        CASE WHEN pc.id IS NOT NULL AND pc.operating_mode<>'none' THEN 'operating_mode_conflict' END,
        CASE WHEN EXISTS(SELECT 1 FROM biz_property_occupancy o WHERE o.tenant_id=u.tenant_id AND o.park_id=u.park_id AND o.unit_id=u.id AND o.is_deleted=false
          AND o.end_at>now() AND (o.status='active' OR (o.status='held' AND o.hold_expires_at>now()))
          AND (${ignoreRoomExpression} IS NULL OR NOT(o.source_domain='apartment' AND o.source_type='apartment_room' AND o.source_id=${ignoreRoomExpression}::text))) THEN 'occupied_by_other_domain' END
      ],NULL)::text[] AS ineligible_reasons) candidate`; }

  private async loadCandidate(manager:EntityManager,scope:TenantParkScope,unitId:string,ignoreRoomId?:string){
    const ignoreExpression=ignoreRoomId?"$4::uuid":"NULL::uuid";
    const [candidate]=await manager.query(`${this.candidateProjectionSql(ignoreExpression)} WHERE u.id=$1 AND u.tenant_id=$2 AND u.park_id=$3 AND u.is_deleted=false`,[unitId,...this.scope(scope),...(ignoreRoomId?[ignoreRoomId]:[])]);
    if(!candidate)throw new NotFoundException("房源不存在或不在当前园区");return candidate;
  }

  private async resolveDocumentVariables(scope:TenantParkScope,applicationId?:string,stayId?:string,overrides:Record<string,unknown>={}){const [row]=await this.dataSource.query(`SELECT a.*,s.stay_code,s.planned_start_date,s.actual_check_out_at,u.unit_name,u.unit_code,b.bed_code,ap.decision approval_decision,ap.opinion approval_opinion,ap.decided_at approval_time,h.item_snapshot,h.key_snapshot,h.exception_note FROM biz_apartment_application a LEFT JOIN biz_apartment_stay s ON s.application_id=a.id AND s.is_deleted=false LEFT JOIN biz_apartment_room r ON r.id=s.room_id LEFT JOIN biz_unit u ON u.id=r.unit_id LEFT JOIN biz_apartment_bed b ON b.id=s.bed_id LEFT JOIN LATERAL(SELECT decision,opinion,decided_at FROM biz_apartment_approval x WHERE x.application_id=a.id AND x.is_deleted=false ORDER BY x.decided_at DESC LIMIT 1) ap ON true LEFT JOIN LATERAL(SELECT item_snapshot,key_snapshot,exception_note FROM biz_apartment_handover x WHERE x.stay_id=s.id AND x.is_deleted=false ORDER BY x.confirmed_at DESC LIMIT 1) h ON true WHERE a.tenant_id=$1 AND a.park_id=$2 AND a.is_deleted=false AND (($3::uuid IS NOT NULL AND a.id=$3) OR ($4::uuid IS NOT NULL AND s.id=$4)) LIMIT 1`,[...this.scope(scope),applicationId??null,stayId??null]);if(!row)throw new NotFoundException("关联的入住申请或在住记录不存在");return {...row,department_job:[row.department_name,row.job_title].filter(Boolean).join(" / ")||"—",room_bed:[row.unit_name||row.unit_code,row.bed_code].filter(Boolean).join(" / ")||"待分配",handover_items:this.formatSnapshot(row.item_snapshot),handover_keys:this.formatSnapshot(row.key_snapshot),checkout_time:row.actual_check_out_at??"—",...overrides};}
  private formatSnapshot(value:unknown){if(!Array.isArray(value)||!value.length)return "无";return value.map(item=>typeof item==="string"?item:JSON.stringify(item)).join("；");}
  private renderTemplate(template:string,variables:Record<string,unknown>){return this.sanitizeTemplate(template).replace(/\{\{([a-z0-9_]+)\}\}/gi,(_,key:string)=>this.escapeHtml(variables[key]??"—"));}
  private sanitizeTemplate(template:string){return template.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"").replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi,"").replace(/javascript\s*:/gi,"");}
  private escapeHtml(value:unknown){return String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]!);}
  private printableHtml(row:Record<string,unknown>){const signature=row.status==="online_signed"?`<section class="signed">线上签署：${this.escapeHtml(row.signer_name)}<br>签署时间：${this.escapeHtml(row.signed_at)}<br>正文校验：${this.escapeHtml(row.signed_sha256)}</section>`:"";return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${this.escapeHtml(row.title)}</title><style>@page{size:A4;margin:18mm}body{font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;color:#111;line-height:1.75}h1{text-align:center;font-size:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:8px}th{width:18%;background:#f5f5f5}.signature{margin-top:48px}.meta,.signed{margin:18px 0;padding:10px;border:1px solid #999;font-size:12px}.toolbar{position:fixed;right:12px;top:12px}@media print{.toolbar{display:none}}</style></head><body><button class="toolbar" onclick="window.print()">打印 / 保存 PDF</button><div class="meta">文书编号：${this.escapeHtml(row.document_no)} / 模板版本：V${this.escapeHtml(row.template_version)}</div>${String(row.content_html)}${signature}</body></html>`;}

  private async transition(scope:TenantParkScope,actor:JwtPrincipal,id:string,from:string,to:string,extra:string){const [r]=await this.dataSource.query(`UPDATE biz_apartment_application SET status=$1,${extra},update_by=$2,update_time=now(),version=version+1 WHERE id=$3 AND tenant_id=$4 AND park_id=$5 AND status=$6 AND is_deleted=false RETURNING *`,[to,actor.sub,id,...this.scope(scope),from]);if(!r)throw new ConflictException(`当前状态不可执行此操作`);return r;}
  private lockApplication(manager:EntityManager,scope:TenantParkScope,id:string){return manager.query(`SELECT * FROM biz_apartment_application WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE`,[id,...this.scope(scope)]);}
  private async handover(scope:TenantParkScope,actor:JwtPrincipal,id:string,type:"move_in"|"move_out",dto:HandoverDto,from:string,to:string){
    if(!dto.items.length||!dto.keys.length)throw new BadRequestException("交接必须登记物品和钥匙清单");
    if(!dto.photo_file_ids?.length)throw new BadRequestException("现场交接至少上传一张照片");
    return this.dataSource.transaction(async manager=>{
      const [stay]=await manager.query(`SELECT s.*,r.unit_id FROM biz_apartment_stay s JOIN biz_apartment_room r ON r.id=s.room_id AND r.is_deleted=false WHERE s.id=$1 AND s.tenant_id=$2 AND s.park_id=$3 AND s.is_deleted=false FOR UPDATE OF s,r`,[id,...this.scope(scope)]);
      if(!stay||stay.status!==from)throw new ConflictException("当前入住状态不可办理交接");
      await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[`property-unit:${scope.tenantId}:${scope.parkId}:${stay.unit_id}`]);
      const meters=await manager.query(`SELECT id,meter_code,meter_name,meter_type,unit,current_reading,multiplier,last_reading_at FROM energy_meter WHERE tenant_id=$1 AND park_id=$2 AND room_id=$3 AND is_deleted=false AND is_enabled=true AND status<>'DISABLED' AND meter_type IN ('WATER','ELECTRIC') ORDER BY meter_type,meter_code FOR UPDATE`,[...this.scope(scope),stay.unit_id]);
      const submitted=[...(dto.meter_readings??[])];
      for(const [meterType,value] of [["WATER",dto.water_meter_reading],["ELECTRIC",dto.electricity_meter_reading]] as const){
        if(value===undefined||submitted.some(row=>meters.some((meter:{id:string;meter_type:string})=>meter.id===row.meter_id&&meter.meter_type===meterType)))continue;
        const typed=meters.filter((meter:{meter_type:string})=>meter.meter_type===meterType);
        if(typed.length!==1)throw new ConflictException(`${meterType==="WATER"?"水":"电"}表无法唯一匹配，请按具体表计录入`);
        submitted.push({meter_id:typed[0].id,reading_value:value});
      }
      if(new Set(submitted.map(row=>row.meter_id)).size!==submitted.length)throw new BadRequestException("同一表计只能提交一次读数");
      const submittedByMeter=new Map(submitted.map(row=>[row.meter_id,row.reading_value]));
      if(submitted.length!==meters.length||meters.some((meter:{id:string})=>!submittedByMeter.has(meter.id)))throw new BadRequestException("交接必须完整登记该房号全部启用水电表读数");
      if(submitted.some(row=>!meters.some((meter:{id:string})=>meter.id===row.meter_id)))throw new BadRequestException("交接读数包含不属于该房号的表计");
      const water=meters.find((meter:{meter_type:string})=>meter.meter_type==="WATER");
      const electric=meters.find((meter:{meter_type:string})=>meter.meter_type==="ELECTRIC");
      const [handover]=await manager.query(`INSERT INTO biz_apartment_handover(tenant_id,park_id,stay_id,handover_type,status,item_snapshot,key_snapshot,photo_file_ids,water_meter_reading,electricity_meter_reading,exception_note,confirmed_at,confirmed_by,create_by,update_by) VALUES($1,$2,$3,$4,'confirmed',$5::jsonb,$6::jsonb,$7::jsonb,$8::numeric,$9::numeric,$10,now(),$11,$11,$11) ON CONFLICT (tenant_id,park_id,stay_id,handover_type) WHERE is_deleted=false DO UPDATE SET item_snapshot=EXCLUDED.item_snapshot,key_snapshot=EXCLUDED.key_snapshot,photo_file_ids=EXCLUDED.photo_file_ids,water_meter_reading=EXCLUDED.water_meter_reading,electricity_meter_reading=EXCLUDED.electricity_meter_reading,exception_note=EXCLUDED.exception_note,status='confirmed',confirmed_at=now(),confirmed_by=EXCLUDED.confirmed_by,update_by=EXCLUDED.update_by,update_time=now() RETURNING *`,[...this.scope(scope),id,type,JSON.stringify(dto.items),JSON.stringify(dto.keys),JSON.stringify(dto.photo_file_ids),water?submittedByMeter.get(water.id):null,electric?submittedByMeter.get(electric.id):null,dto.exception_note??null,actor.sub]);
      const energyReadings=[];
      for(const meter of meters as Array<{id:string;current_reading:string;multiplier:string}>){
        const value=submittedByMeter.get(meter.id)!;
        const [{reversed}]=await manager.query(`SELECT $1::numeric < $2::numeric AS reversed`,[value,meter.current_reading]);
        if(reversed)throw new ConflictException("交接读数不得小于表计当前读数");
        const [reading]=await manager.query(`INSERT INTO energy_reading(tenant_id,park_id,meter_id,reading_value,previous_reading_value,consumption_value,reading_time,reading_source,confirmation_status,raw_payload,source_domain,source_type,source_id,created_by,confirmed_by,confirmed_at) VALUES($1,$2,$3,$4::numeric,$5::numeric,(($4::numeric-$5::numeric)*$6::numeric),now(),'MANUAL','CONFIRMED',$7::jsonb,'apartment',$8,$9,$10,$10,now()) RETURNING *`,[...this.scope(scope),meter.id,value,meter.current_reading,meter.multiplier,JSON.stringify({handover_type:type,stay_id:id}),`${type}_handover`,handover.id,actor.sub]);
        await manager.query(`UPDATE energy_meter SET current_reading=$1::numeric,last_reading_at=$2,status='ONLINE',update_by=$3,update_time=now(),version=version+1 WHERE id=$4`,[value,reading.reading_time,actor.sub,meter.id]);
        energyReadings.push(reading);
      }
      await manager.query(`UPDATE biz_apartment_stay SET status=$1::varchar,actual_check_in_at=CASE WHEN $1::varchar='active' THEN now() ELSE actual_check_in_at END,actual_check_out_at=CASE WHEN $1::varchar='completed' THEN now() ELSE actual_check_out_at END,update_by=$2,update_time=now() WHERE id=$3`,[to,actor.sub,id]);
      await manager.query(`UPDATE biz_apartment_application SET status=$1,update_by=$2,update_time=now() WHERE id=$3`,[to==="active"?"checked_in":"completed",actor.sub,stay.application_id]);
      return {...handover,energy_readings:energyReadings};
    });
  }
  private translateConflict(error: unknown): never { if (typeof error === "object"&&error&&"code" in error&&(["23P01","23505"].includes(String((error as {code:unknown}).code)))) throw new ConflictException("房源或床位已被占用，请刷新后重试"); throw error; }
}
