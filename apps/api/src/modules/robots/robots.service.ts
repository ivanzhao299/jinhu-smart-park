import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, Repository } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { IotDeviceEntity } from "../iot/entities/iot-device.entity";
import { IotProtocolConfigEntity } from "../iot/entities/iot-protocol-config.entity";
import { IotDeviceSecretService } from "../iot/iot-device-secret.service";
import { IotIngestService } from "../iot/iot-ingest.service";
import type { IotMetricPayloadValue } from "../iot/dto/iot-http-ingest.dto";
import { SaaSModulesService } from "../saas-modules/saas-modules.service";
import { EzvizApiException, EzvizCleaningRobotAdapter, type EzvizApiResult } from "./adapters/ezviz-cleaning-robot.adapter";
import type { EzvizConfigDto } from "./dto/ezviz-config.dto";
import type { EzvizDeviceAddDto, EzvizDeviceSyncDto } from "./dto/ezviz-device-sync.dto";
import type { RobotCallbackDto, RobotCleanControlDto, RobotCleanModeDto, RobotCommandDryRunDto, RobotRegionCleanDto, RobotTempRegionCleanDto } from "./dto/robot-control.dto";
import type { RobotLocalRegisterDto } from "./dto/robot-local-register.dto";
import type { RobotQueryDto } from "./dto/robot-query.dto";
import { RobotCommandLogEntity } from "./entities/robot-command-log.entity";

const ROBOT_DEVICE_TYPE = "robot";
const ROBOT_CATEGORY = "cleaning_robot";
const EZVIZ_PROTOCOL = "ezviz_cleaning_robot";
const LOCAL_DRY_RUN_PROTOCOL = "local_robot_dry_run";

interface EzvizConfig {
  id: string;
  baseUrl?: string;
  appKey: string;
  appSecret: string;
  accessToken?: string;
  tokenExpireAt?: number;
  callbackToken?: string;
}

export interface RobotView {
  id: string;
  deviceCode: string;
  deviceName: string;
  onlineStatus: string;
  status: string;
  vendorDeviceId: string | null;
  platformType: string | null;
  model: string | null;
  location: string | null;
  buildingId: string | null;
  floorId: string | null;
  unitId: string | null;
  parkTenantId: string | null;
  lastDataTime: Date | null;
  statusPayload: Record<string, unknown>;
}

export interface EzvizPlatformDeviceView {
  deviceSerial: string;
  deviceName: string | null;
  deviceType: string | null;
  model: string | null;
  status: string | null;
  isSynced: boolean;
  robotId: string | null;
  raw: Record<string, unknown>;
}

@Injectable()
export class RobotsService {
  constructor(
    @InjectRepository(IotDeviceEntity)
    private readonly deviceRepository: Repository<IotDeviceEntity>,
    @InjectRepository(IotProtocolConfigEntity)
    private readonly protocolConfigRepository: Repository<IotProtocolConfigEntity>,
    @InjectRepository(RobotCommandLogEntity)
    private readonly commandLogRepository: Repository<RobotCommandLogEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly modulesService: SaaSModulesService,
    private readonly secretService: IotDeviceSecretService,
    private readonly ingestService: IotIngestService,
    private readonly ezvizAdapter: EzvizCleaningRobotAdapter
  ) {}

  async listCleaningRobots(scope: TenantParkScope, query: RobotQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<RobotView>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.robotBuilder(scope);
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "device");
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("device.device_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("device.device_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("device.vendor_device_id ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("device.location ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.online_status) builder.andWhere("device.online_status = :onlineStatus", { onlineStatus: query.online_status });
    if (query.building_id) builder.andWhere("device.building_id = :buildingId", { buildingId: query.building_id });
    if (query.unit_id) builder.andWhere("device.unit_id = :unitId", { unitId: query.unit_id });
    builder.orderBy("device.updateTime", "DESC").addOrderBy("device.createTime", "DESC");
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items: items.map((item) => this.toRobotView(item)), total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<RobotView> {
    return this.toRobotView(await this.findRobot(scope, id, actor));
  }

  async upsertEzvizConfig(scope: TenantParkScope, actor: JwtPrincipal, dto: EzvizConfigDto) {
    const existing = await this.protocolConfigRepository.findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        protocolType: EZVIZ_PROTOCOL,
        configName: dto.config_name,
        isDeleted: false
      }
    });
    const configJson: Record<string, unknown> = {
      ...(existing?.configJson ?? {}),
      app_key: this.secretService.encryptSecret(dto.app_key),
      app_secret_encrypted: this.secretService.encryptSecret(dto.app_secret),
      api_base_url: dto.api_base_url ?? "https://open.ys7.com"
    };
    if (dto.callback_token) {
      configJson.callback_token_encrypted = this.secretService.encryptSecret(dto.callback_token);
    }
    if (dto.access_token) {
      configJson.access_token_encrypted = this.secretService.encryptSecret(dto.access_token);
      configJson.token_expire_at = this.parseTokenExpireAt(dto.token_expire_at) ?? this.defaultManualTokenExpireAt();
    } else if (dto.token_expire_at) {
      configJson.token_expire_at = this.parseTokenExpireAt(dto.token_expire_at);
    }
    const entity = existing ?? this.protocolConfigRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      protocolType: EZVIZ_PROTOCOL,
      configName: dto.config_name,
      createBy: actor.sub
    });
    entity.configJson = configJson;
    entity.status = dto.status ?? "enabled";
    entity.remark = dto.remark ?? entity.remark ?? null;
    entity.updateBy = actor.sub;
    const saved = await this.protocolConfigRepository.save(entity);
    return this.toConfigView(saved);
  }

  async refreshEzvizAccessToken(scope: TenantParkScope, configId: string) {
    const entity = await this.protocolConfigRepository.findOne({
      where: { id: configId, tenantId: scope.tenantId, parkId: scope.parkId, protocolType: EZVIZ_PROTOCOL, isDeleted: false }
    });
    if (!entity) throw new NotFoundException("EZVIZ cleaning robot config not found");
    const config = this.toEzvizConfig(entity);
    await this.fetchAndStoreAccessToken(scope, config);
    const refreshed = await this.protocolConfigRepository.findOneOrFail({
      where: { id: configId, tenantId: scope.tenantId, parkId: scope.parkId, protocolType: EZVIZ_PROTOCOL, isDeleted: false }
    });
    return this.toConfigView(refreshed);
  }

  async listEzvizConfigs(scope: TenantParkScope) {
    const rows = await this.protocolConfigRepository.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, protocolType: EZVIZ_PROTOCOL, isDeleted: false },
      order: { updateTime: "DESC" }
    });
    return rows.map((row) => this.toConfigView(row));
  }

  async listEzvizPlatformDevices(scope: TenantParkScope): Promise<EzvizPlatformDeviceView[]> {
    const config = await this.getEzvizConfig(scope);
    const response = await this.callEzvizWithToken(scope, config, (accessToken) => this.ezvizAdapter.listDevices(config.baseUrl, accessToken, 0, 50));
    const rows = this.extractEzvizDeviceRows(response).filter((row) => this.isEzvizCleaningRobotCandidate(row));
    const serials = rows.map((row) => this.getDeviceSerial(row)).filter((serial): serial is string => Boolean(serial));
    const synced = serials.length
      ? await this.deviceRepository
        .createQueryBuilder("device")
        .where("device.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("device.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("device.is_deleted = false")
        .andWhere("device.device_type = :deviceType", { deviceType: ROBOT_DEVICE_TYPE })
        .andWhere("(device.vendor_device_id IN (:...serials) OR device.platform_device_id IN (:...serials) OR device.serial_number IN (:...serials))", { serials })
        .getMany()
      : [];
    const syncedBySerial = new Map<string, IotDeviceEntity>();
    for (const device of synced) {
      for (const serial of [device.vendorDeviceId, device.platformDeviceId, device.serialNumber]) {
        if (serial) syncedBySerial.set(serial, device);
      }
    }
    return rows.map((row) => {
      const serial = this.getDeviceSerial(row) ?? "";
      const local = syncedBySerial.get(serial) ?? null;
      return {
        deviceSerial: serial,
        deviceName: this.readString(row, "deviceName") ?? this.readString(row, "device_name") ?? null,
        deviceType: this.readString(row, "deviceType") ?? this.readString(row, "device_type") ?? null,
        model: this.readString(row, "model") ?? this.readString(row, "deviceModel") ?? null,
        status: this.readString(row, "status") ?? this.readString(row, "online") ?? null,
        isSynced: Boolean(local),
        robotId: local?.id ?? null,
        raw: row
      };
    });
  }

  async addEzvizPlatformDevice(scope: TenantParkScope, actor: JwtPrincipal, dto: EzvizDeviceAddDto): Promise<RobotView> {
    this.assertText(dto.device_serial, "device_serial is required");
    this.assertText(dto.validate_code, "validate_code is required");
    const config = await this.getEzvizConfig(scope);
    try {
      await this.callEzvizWithToken(scope, config, (accessToken) => this.ezvizAdapter.addDevice(config.baseUrl, accessToken, dto.device_serial, dto.validate_code));
    } catch (error) {
      if (!this.isEzvizDeviceAlreadyLinkedError(error)) {
        throw error;
      }
    }
    return this.syncEzvizDevice(scope, actor, dto);
  }

  async registerLocalRobot(scope: TenantParkScope, actor: JwtPrincipal, dto: RobotLocalRegisterDto): Promise<RobotView> {
    this.assertText(dto.device_name, "device_name is required");
    const existing = dto.device_code
      ? await this.deviceRepository.findOne({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, deviceCode: dto.device_code, isDeleted: false }
      })
      : null;
    if (existing) throw new ConflictException("device_code already exists");
    const generated = dto.device_code ? null : await this.codeRulesService.generateNext(scope, actor.sub, "IOT_DEVICE_CODE");
    const deviceCode = dto.device_code ?? generated?.code;
    if (!deviceCode) throw new BadRequestException("device_code is required");
    const serial = dto.vendor_device_id ?? `local-${deviceCode}`;
    const entity = this.deviceRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: deviceCode,
      deviceCode,
      deviceName: dto.device_name,
      deviceType: ROBOT_DEVICE_TYPE,
      deviceCategory: ROBOT_CATEGORY,
      protocolType: LOCAL_DRY_RUN_PROTOCOL,
      connectionType: "local_dry_run",
      brand: "Local",
      model: dto.model ?? "local-dry-run",
      manufacturer: "Local",
      vendorPlatform: LOCAL_DRY_RUN_PROTOCOL,
      vendorName: "Local Dry-Run",
      vendorDeviceId: serial,
      platformType: LOCAL_DRY_RUN_PROTOCOL,
      platformDeviceId: serial,
      serialNumber: serial,
      buildingId: dto.building_id ?? null,
      floorId: dto.floor_id ?? null,
      unitId: dto.unit_id ?? null,
      roomId: dto.unit_id ?? null,
      location: dto.location ?? null,
      installLocation: dto.location ?? null,
      onlineStatus: dto.online_status ?? "online",
      status: dto.status ?? "enabled",
      isEnabled: (dto.status ?? "enabled") !== "disabled",
      metadata: {
        source: LOCAL_DRY_RUN_PROTOCOL,
        external_call_enabled: false,
        credential_required: false,
        governance: {
          real_control_requires_approval: true,
          dry_run_allowed: true
        }
      },
      statusPayload: {
        ...(dto.status_payload ?? {}),
        local_dry_run: true,
        external_call: false,
        update_time: new Date().toISOString()
      },
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.deviceRepository.save(entity);
    await this.writeCommandLog(scope, actor, saved, "register_local_robot", { dry_run_runtime: true }, {
      device_id: saved.id,
      external_call: false,
      credential_required: false
    }, "success", null);
    return this.toRobotView(saved);
  }

  async syncEzvizDevice(scope: TenantParkScope, actor: JwtPrincipal, dto: EzvizDeviceSyncDto): Promise<RobotView> {
    this.assertText(dto.device_serial, "device_serial is required");
    const config = await this.getEzvizConfig(scope);
    const detail = await this.callEzvizWithToken(scope, config, (accessToken) => this.ezvizAdapter.deviceInfo(config.baseUrl, accessToken, dto.device_serial));
    const detailData = this.recordOrEmpty(detail.data);
    if (!this.isEzvizCleaningRobotCandidate({ ...detailData, deviceSerial: dto.device_serial, deviceName: dto.device_name })) {
      throw new BadRequestException("EZVIZ device is not recognized as a cleaning robot");
    }
    const existing = await this.findRobotBySerial(scope, dto.device_serial);
    const generated = existing ? null : await this.codeRulesService.generateNext(scope, actor.sub, "IOT_DEVICE_CODE");
    const entity = existing ?? this.deviceRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: generated?.code ?? null,
      deviceCode: generated?.code ?? dto.device_serial,
      deviceType: ROBOT_DEVICE_TYPE,
      deviceCategory: ROBOT_CATEGORY,
      protocolType: EZVIZ_PROTOCOL,
      createBy: actor.sub
    });
    const nameFromDetail = this.readString(detailData, "deviceName") ?? this.readString(detailData, "device_name");
    const modelFromDetail = this.readString(detailData, "model") ?? this.readString(detailData, "deviceModel") ?? this.readString(detailData, "productModel");
    entity.deviceName = dto.device_name ?? nameFromDetail ?? entity.deviceName ?? `萤石清洁机器人 ${dto.device_serial}`;
    entity.deviceType = ROBOT_DEVICE_TYPE;
    entity.deviceCategory = ROBOT_CATEGORY;
    entity.protocolType = EZVIZ_PROTOCOL;
    entity.connectionType = "vendor_api";
    entity.brand = "萤石";
    entity.vendorName = "萤石";
    entity.manufacturer = "萤石";
    entity.vendorPlatform = EZVIZ_PROTOCOL;
    entity.platformType = EZVIZ_PROTOCOL;
    entity.vendorDeviceId = dto.device_serial;
    entity.platformDeviceId = dto.device_serial;
    entity.serialNumber = dto.device_serial;
    entity.model = modelFromDetail ?? entity.model ?? null;
    entity.location = dto.location ?? entity.location ?? null;
    entity.installLocation = dto.location ?? entity.installLocation ?? entity.location ?? null;
    entity.onlineStatus = this.normalizeEzvizOnlineStatus(detailData) ?? entity.onlineStatus ?? "unknown";
    entity.status = entity.status === "disabled" ? "disabled" : "enabled";
    entity.isEnabled = entity.status !== "disabled";
    entity.statusPayload = {
      ...(entity.statusPayload ?? {}),
      ezviz_device_info: detailData,
      ezviz_sync_time: new Date().toISOString()
    };
    entity.metadata = {
      ...(entity.metadata ?? {}),
      source: EZVIZ_PROTOCOL,
      ezviz_device_serial: dto.device_serial
    };
    entity.remark = dto.remark ?? entity.remark ?? null;
    entity.updateBy = actor.sub;
    const saved = await this.deviceRepository.save(entity);
    await this.writeCommandLog(scope, actor, saved, "sync_ezviz_device", { device_serial: dto.device_serial }, { device_id: saved.id }, "success", null);
    return this.toRobotView(saved);
  }

  async refreshEzvizDeviceInfo(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<RobotView> {
    const device = await this.findRobot(scope, id, actor);
    const serial = device.vendorDeviceId ?? device.platformDeviceId ?? device.serialNumber;
    this.assertText(serial, "robot vendor device id is required");
    const synced = await this.syncEzvizDevice(scope, actor, {
      device_serial: serial,
      device_name: device.deviceName,
      location: device.location ?? undefined
    });
    return synced;
  }

  async listCommandLogs(scope: TenantParkScope, actor: JwtPrincipal, id: string, query: RobotQueryDto) {
    const device = await this.findRobot(scope, id, actor);
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const [items, total] = await this.commandLogRepository.findAndCount({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, deviceId: device.id, isDeleted: false },
      order: { opTime: "DESC" },
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return {
      items: items.map((item) => ({
        id: item.id,
        deviceId: item.deviceId,
        deviceCode: item.deviceCode,
        command: item.command,
        status: item.status,
        errorMessage: item.errorMessage,
        operatorName: item.operatorName,
        opTime: item.opTime,
        requestPayload: item.requestPayload,
        responsePayload: item.responsePayload
      })),
      total,
      page,
      page_size: pageSize
    };
  }

  async queryTask(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    return this.runEzvizCommand(scope, actor, id, "query_task", {}, async (config, serial) =>
      this.callEzvizWithToken(scope, config, (accessToken) => this.ezvizAdapter.queryCurrentTask(config.baseUrl, accessToken, serial))
    );
  }

  async commandDryRun(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: RobotCommandDryRunDto) {
    this.assertText(dto.command, "command is required");
    const device = await this.findRobot(scope, id, actor);
    const governance = this.robotCommandGovernance(dto.command);
    const response = {
      dry_run: true,
      executed: false,
      external_call: false,
      credential_read: false,
      command: dto.command,
      risk: governance.risk,
      approval_required: governance.approvalRequired,
      governance_decision: governance.decision,
      message: governance.message,
      device_id: device.id,
      device_code: device.deviceCode
    };
    await this.writeCommandLog(scope, actor, device, `dry_run_${dto.command}`, {
      dry_run: true,
      command: dto.command,
      payload: dto.payload ?? {}
    }, response, "success", null);
    device.statusPayload = {
      ...(device.statusPayload ?? {}),
      robot_last_dry_run: {
        ...response,
        time: new Date().toISOString()
      }
    };
    device.lastDataTime = new Date();
    await this.deviceRepository.save(device);
    return response;
  }

  async cleanControl(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: RobotCleanControlDto) {
    this.assertText(dto.command, "command is required");
    return this.runEzvizCommand(scope, actor, id, "clean_control", { command: dto.command }, async (config, serial) =>
      this.callEzvizWithToken(scope, config, (accessToken) => this.ezvizAdapter.cleanControl(config.baseUrl, accessToken, serial, dto.command))
    );
  }

  async setCleanMode(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: RobotCleanModeDto) {
    this.assertText(dto.mode, "mode is required");
    return this.runEzvizCommand(scope, actor, id, "set_clean_mode", { mode: dto.mode }, async (config, serial) =>
      this.callEzvizWithToken(scope, config, (accessToken) => this.ezvizAdapter.setCleanMode(config.baseUrl, accessToken, serial, dto.mode))
    );
  }

  async queryPath(scope: TenantParkScope, actor: JwtPrincipal, id: string, mapId: string) {
    this.assertText(mapId, "map_id is required");
    return this.runEzvizCommand(scope, actor, id, "query_path", { map_id: mapId }, async (config, serial) =>
      this.callEzvizWithToken(scope, config, (accessToken) => this.ezvizAdapter.queryPath(config.baseUrl, accessToken, serial, mapId))
    );
  }

  async startRegionClean(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: RobotRegionCleanDto) {
    if (!dto.regions?.length) throw new BadRequestException("regions is required");
    return this.runEzvizCommand(scope, actor, id, "start_region_clean", dto as unknown as Record<string, unknown>, async (config, serial) =>
      this.callEzvizWithToken(scope, config, (accessToken) => this.ezvizAdapter.startRegionClean(config.baseUrl, accessToken, serial, dto))
    );
  }

  async startTempRegionClean(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: RobotTempRegionCleanDto) {
    if (!dto.temp_region) throw new BadRequestException("temp_region is required");
    return this.runEzvizCommand(scope, actor, id, "start_temp_region_clean", dto as unknown as Record<string, unknown>, async (config, serial) =>
      this.callEzvizWithToken(scope, config, (accessToken) => this.ezvizAdapter.startTempRegionClean(config.baseUrl, accessToken, serial, dto))
    );
  }

  async handleEzvizCallback(token: string | undefined, dto: RobotCallbackDto) {
    const serial = dto.deviceSerial ?? this.readString(dto.data, "deviceSerial") ?? this.readString(dto.payload, "deviceSerial");
    this.assertText(serial, "deviceSerial is required");
    const device = await this.deviceRepository
      .createQueryBuilder("device")
      .where("device.is_deleted = false")
      .andWhere("device.device_type = :deviceType", { deviceType: ROBOT_DEVICE_TYPE })
      .andWhere("(device.vendor_device_id = :serial OR device.platform_device_id = :serial OR device.serial_number = :serial)", { serial })
      .getOne();
    if (!device) throw new NotFoundException("Robot device not found");
    await this.assertModuleEnabled(device.tenantId, device.parkId, "robot");
    const config = await this.getEzvizConfig({ tenantId: device.tenantId, parkId: device.parkId });
    if (!config.callbackToken || token !== config.callbackToken) {
      throw new ForbiddenException("Invalid robot callback token");
    }
    const metrics = this.callbackToMetrics(dto);
    if (Object.keys(metrics).length > 0) {
      await this.ingestService.ingestTrusted({
        device_code: device.deviceCode,
        reported_at: new Date().toISOString(),
        quality: "good",
        metrics,
        raw_payload: { source_type: "ezviz_callback", payload: dto }
      });
    }
    device.statusPayload = { ...(device.statusPayload ?? {}), ezviz_callback: dto, update_time: new Date().toISOString() };
    device.lastDataTime = new Date();
    if (metrics.online === true) {
      device.onlineStatus = "online";
      device.lastOnlineTime = new Date();
    }
    if (metrics.online === false) {
      device.onlineStatus = "offline";
      device.lastOfflineTime = new Date();
    }
    await this.deviceRepository.save(device);
    return { ok: true, device_id: device.id, metrics };
  }

  private async runEzvizCommand(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    command: string,
    requestPayload: Record<string, unknown>,
    executor: (config: EzvizConfig, serial: string) => Promise<unknown>
  ) {
    const device = await this.findRobot(scope, id, actor);
    const serial = device.vendorDeviceId ?? device.platformDeviceId ?? device.serialNumber;
    this.assertText(serial, "robot vendor device id is required");
    const config = await this.getEzvizConfig(scope);
    try {
      const response = await executor(config, serial);
      await this.writeCommandLog(scope, actor, device, command, requestPayload, response as Record<string, unknown>, "success", null);
      const responseRecord = this.recordOrEmpty(response);
      device.statusPayload = {
        ...(device.statusPayload ?? {}),
        ezviz_last_command: {
          command,
          response: this.maskCommandResponse(responseRecord),
          time: new Date().toISOString()
        },
        ...(command === "query_task" ? { ezviz_current_task: this.recordOrEmpty(responseRecord.data) } : {})
      };
      device.lastDataTime = new Date();
      await this.deviceRepository.save(device);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Robot command failed";
      await this.writeCommandLog(scope, actor, device, command, requestPayload, {}, "failed", message);
      throw error;
    }
  }

  private async getAccessToken(scope: TenantParkScope, config: EzvizConfig): Promise<string> {
    const now = Date.now();
    if (config.accessToken && config.tokenExpireAt && config.tokenExpireAt - now > 60_000) return config.accessToken;
    return this.fetchAndStoreAccessToken(scope, config);
  }

  private async callEzvizWithToken<T>(
    scope: TenantParkScope,
    config: EzvizConfig,
    call: (accessToken: string) => Promise<EzvizApiResult<T>>
  ): Promise<EzvizApiResult<T>> {
    try {
      return await call(await this.getAccessToken(scope, config));
    } catch (error) {
      if (!this.isEzvizTokenExpiredError(error)) throw error;
      const refreshedToken = await this.fetchAndStoreAccessToken(scope, config);
      config.accessToken = refreshedToken;
      config.tokenExpireAt = undefined;
      return call(refreshedToken);
    }
  }

  private async fetchAndStoreAccessToken(scope: TenantParkScope, config: EzvizConfig): Promise<string> {
    let response: EzvizApiResult<{ accessToken: string; expireTime: number }>;
    try {
      response = await this.ezvizAdapter.getToken(config.baseUrl, config.appKey, config.appSecret);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      throw new BadRequestException(`萤石 AccessToken 获取失败：${message}。请检查 AppKey/AppSecret，或在萤石配置页手动填入开放平台当前 AccessToken。`);
    }
    const token = response.data?.accessToken;
    const expireTime = response.data?.expireTime;
    if (!token || !expireTime) throw new BadRequestException("萤石 AccessToken 获取失败：返回内容缺少 accessToken 或 expireTime。请在配置页手动填入当前 AccessToken。");
    const entity = await this.protocolConfigRepository.findOne({ where: { id: config.id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
    if (entity) {
      entity.configJson = {
        ...(entity.configJson ?? {}),
        access_token_encrypted: this.secretService.encryptSecret(token),
        token_expire_at: expireTime
      };
      await this.protocolConfigRepository.save(entity);
    }
    return token;
  }

  private isEzvizTokenExpiredError(error: unknown): boolean {
    if (error instanceof EzvizApiException) return error.ezvizCode === "10002";
    return error instanceof Error && /10002|accessToken|token/i.test(error.message);
  }

  private async getEzvizConfig(scope: TenantParkScope): Promise<EzvizConfig> {
    const entity = await this.protocolConfigRepository.findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, protocolType: EZVIZ_PROTOCOL, status: "enabled", isDeleted: false },
      order: { updateTime: "DESC" }
    });
    if (!entity) throw new BadRequestException("EZVIZ cleaning robot config is not configured");
    return this.toEzvizConfig(entity);
  }

  private toEzvizConfig(entity: IotProtocolConfigEntity): EzvizConfig {
    const json = entity.configJson ?? {};
    const appKey = this.decryptRequired(json.app_key, "app_key is not configured");
    const appSecret = this.decryptRequired(json.app_secret_encrypted, "app_secret is not configured");
    return {
      id: entity.id,
      appKey,
      appSecret,
      baseUrl: this.readString(json, "api_base_url") ?? undefined,
      accessToken: this.decryptOptional(json.access_token_encrypted),
      tokenExpireAt: this.readNumber(json, "token_expire_at"),
      callbackToken: this.decryptOptional(json.callback_token_encrypted)
    };
  }

  private parseTokenExpireAt(value: string | undefined): number | undefined {
    if (!value?.trim()) return undefined;
    const raw = value.trim();
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const parsed = new Date(raw).getTime();
    if (Number.isNaN(parsed)) throw new BadRequestException("token_expire_at is invalid");
    return parsed;
  }

  private defaultManualTokenExpireAt(): number {
    return Date.now() + 6 * 24 * 60 * 60 * 1000;
  }

  private robotBuilder(scope: TenantParkScope) {
    return this.deviceRepository
      .createQueryBuilder("device")
      .where("device.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("device.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("device.is_deleted = false")
      .andWhere("device.device_type = :deviceType", { deviceType: ROBOT_DEVICE_TYPE })
      .andWhere("(device.device_category = :category OR device.platform_type = :protocol OR device.vendor_platform = :protocol)", {
        category: ROBOT_CATEGORY,
        protocol: EZVIZ_PROTOCOL
      });
  }

  private async findRobotBySerial(scope: TenantParkScope, serial: string): Promise<IotDeviceEntity | null> {
    return this.deviceRepository
      .createQueryBuilder("device")
      .where("device.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("device.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("device.is_deleted = false")
      .andWhere("device.device_type = :deviceType", { deviceType: ROBOT_DEVICE_TYPE })
      .andWhere("(device.vendor_device_id = :serial OR device.platform_device_id = :serial OR device.serial_number = :serial)", { serial })
      .getOne();
  }

  private async findRobot(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<IotDeviceEntity> {
    const builder = this.robotBuilder(scope).andWhere("device.id = :id", { id });
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "device", "device");
    const device = await builder.getOne();
    if (!device) throw new NotFoundException("Cleaning robot not found");
    if (!device.isEnabled || device.status === "disabled") throw new BadRequestException("Cleaning robot is disabled");
    return device;
  }

  private async assertModuleEnabled(tenantId: string, parkId: string, moduleCode: string): Promise<void> {
    const enabled = await this.modulesService.listEnabledModulesForTenant(tenantId, parkId);
    if (!enabled.some((module) => module.module_code === moduleCode)) {
      throw new ForbiddenException("Tenant module is not authorized");
    }
  }

  private robotCommandGovernance(command: string): { risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; approvalRequired: boolean; decision: string; message: string } {
    const normalized = command.trim().toLowerCase();
    if (["query_task", "query_path", "status_check", "read_status"].includes(normalized)) {
      return {
        risk: "LOW",
        approvalRequired: false,
        decision: "ALLOW_DRY_RUN_READ_ONLY",
        message: "只读类机器人指令允许 dry-run；真实外部平台查询仍需平台配置与网络治理。"
      };
    }
    if (["clean_control", "set_clean_mode", "pause", "resume", "stop", "return_charge"].includes(normalized)) {
      return {
        risk: "HIGH",
        approvalRequired: true,
        decision: "DRY_RUN_ONLY_PROPOSAL_REQUIRED_FOR_REAL_CONTROL",
        message: "会影响真实机器人行为的控制指令仅允许 dry-run；真实执行需要审批。"
      };
    }
    if (["start_region_clean", "start_temp_region_clean", "schedule_clean"].includes(normalized)) {
      return {
        risk: "HIGH",
        approvalRequired: true,
        decision: "DRY_RUN_ONLY_PROPOSAL_REQUIRED_FOR_REAL_CLEANING",
        message: "区域清洁会触发现场执行，仅允许 dry-run；真实执行需要审批。"
      };
    }
    return {
      risk: "MEDIUM",
      approvalRequired: false,
      decision: "ALLOW_DRY_RUN_UNKNOWN_COMMAND",
      message: "未知机器人指令仅记录 dry-run 计划，不进行外部调用。"
    };
  }

  private async writeCommandLog(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    device: IotDeviceEntity,
    command: string,
    requestPayload: Record<string, unknown>,
    responsePayload: Record<string, unknown>,
    status: "success" | "failed",
    errorMessage: string | null
  ): Promise<void> {
    await this.commandLogRepository.save(this.commandLogRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      deviceId: device.id,
      deviceCode: device.deviceCode,
      command,
      requestPayload,
      responsePayload: this.maskCommandResponse(responsePayload),
      status,
      errorMessage,
      operatorId: actor.sub,
      operatorName: actor.realName ?? actor.username,
      opTime: new Date(),
      createBy: actor.sub,
      updateBy: actor.sub
    }));
  }

  private callbackToMetrics(dto: RobotCallbackDto): Record<string, IotMetricPayloadValue> {
    const data = dto.data ?? dto.payload ?? {};
    const identifier = dto.identifier ?? this.readString(data, "identifier");
    const metrics: Record<string, IotMetricPayloadValue> = {};
    if (identifier === "ys.onoffline") {
      const status = this.readString(data, "status");
      if (status) metrics.online = status.toUpperCase() === "ONLINE";
    }
    const battery = this.readNumber(data, "batteryPercentage");
    if (battery !== undefined) metrics.battery = battery;
    const cleanArea = this.readNumber(data, "cleanArea");
    if (cleanArea !== undefined) metrics.clean_area = cleanArea;
    const cleanDuration = this.readNumber(data, "cleanDuration");
    if (cleanDuration !== undefined) metrics.clean_duration = cleanDuration;
    const progress = this.readNumber(data, "cleaningProgress");
    if (progress !== undefined) metrics.cleaning_progress = progress;
    const cleanTaskStatus = this.readString(data, "cleanTaskStatus") ?? this.readString(data, "status");
    if (cleanTaskStatus && identifier !== "ys.onoffline") metrics.clean_task_status = cleanTaskStatus;
    const exceptionNum = this.readNumber(data, "exceptionNum");
    if (exceptionNum !== undefined) metrics.exception_count = exceptionNum;
    return metrics;
  }

  private toRobotView(device: IotDeviceEntity): RobotView {
    return {
      id: device.id,
      deviceCode: device.deviceCode,
      deviceName: device.deviceName,
      onlineStatus: device.onlineStatus,
      status: device.status,
      vendorDeviceId: device.vendorDeviceId,
      platformType: device.platformType,
      model: device.model,
      location: device.location,
      buildingId: device.buildingId,
      floorId: device.floorId,
      unitId: device.unitId,
      parkTenantId: device.parkTenantId,
      lastDataTime: device.lastDataTime,
      statusPayload: device.statusPayload ?? {}
    };
  }

  private toConfigView(entity: IotProtocolConfigEntity) {
    return {
      id: entity.id,
      protocolType: entity.protocolType,
      configName: entity.configName,
      status: entity.status,
      hasAppKey: Boolean(entity.configJson?.app_key),
      hasAppSecret: Boolean(entity.configJson?.app_secret_encrypted),
      hasAccessToken: Boolean(entity.configJson?.access_token_encrypted),
      tokenExpireAt: entity.configJson?.token_expire_at ?? null,
      remark: entity.remark,
      updateTime: entity.updateTime
    };
  }

  private decryptRequired(value: unknown, message: string): string {
    const decrypted = this.decryptOptional(value);
    if (!decrypted) throw new BadRequestException(message);
    return decrypted;
  }

  private decryptOptional(value: unknown): string | undefined {
    if (typeof value !== "string" || value.trim() === "") return undefined;
    return this.secretService.decryptSecret(value) ?? undefined;
  }

  private readString(source: unknown, key: string): string | undefined {
    if (!source || typeof source !== "object") return undefined;
    const value = (source as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim() !== "" ? value : undefined;
  }

  private readNumber(source: unknown, key: string): number | undefined {
    if (!source || typeof source !== "object") return undefined;
    const value = (source as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
    return undefined;
  }

  private extractEzvizDeviceRows(response: Record<string, unknown>): Record<string, unknown>[] {
    const data = response.data;
    if (Array.isArray(data)) return data.filter(this.isRecord);
    if (this.isRecord(data)) {
      for (const key of ["devices", "items", "list", "rows"]) {
        const value = data[key];
        if (Array.isArray(value)) return value.filter(this.isRecord);
      }
    }
    return [];
  }

  private getDeviceSerial(row: Record<string, unknown>): string | undefined {
    return this.readString(row, "deviceSerial") ?? this.readString(row, "device_serial") ?? this.readString(row, "serial") ?? this.readString(row, "deviceId");
  }

  private normalizeEzvizOnlineStatus(row: Record<string, unknown>): string | undefined {
    const status = this.readString(row, "status") ?? this.readString(row, "onlineStatus") ?? this.readString(row, "online");
    if (!status) return undefined;
    const normalized = status.toLowerCase();
    if (["1", "online", "true"].includes(normalized)) return "online";
    if (["0", "offline", "false"].includes(normalized)) return "offline";
    return normalized;
  }

  private isEzvizCleaningRobotCandidate(row: Record<string, unknown>): boolean {
    const values = [
      this.getDeviceSerial(row),
      this.readString(row, "deviceName"),
      this.readString(row, "device_name"),
      this.readString(row, "name"),
      this.readString(row, "model"),
      this.readString(row, "deviceModel"),
      this.readString(row, "productModel"),
      this.readString(row, "deviceType"),
      this.readString(row, "device_type"),
      this.readString(row, "category"),
      this.readString(row, "parentCategory"),
      this.readString(row, "resourceType"),
      this.readString(row, "productType")
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());
    const text = values.join(" ");

    // 萤石商用清洁文档明确：机器人详情 parentCategory=commercialRobot，回调 resourceType=SweepingRobot。
    if (/(commercialrobot|sweepingrobot)/i.test(text)) {
      return true;
    }

    if (/(sweeper|sweeprobot|cleaning[_ -]?robot|clean[_ -]?robot|robot|扫地|清洁|洗地|机器人)/i.test(text)) {
      return true;
    }

    // 萤石开放平台的通用设备列表会返回摄像头、NVR、门口机等安防设备。
    // 清洁机器人页面只允许同步机器人候选设备，明确监控类设备留给视频安防模块处理。
    if (/(^|\s)(ds-|cs-c|cs-t|c6|c6c|c6cn|nvr|dvr|camera|ipc|摄像|监控|录像机|门口|门禁)/i.test(text)) {
      return false;
    }

    // 设备详情接口对机器人型号字段并不稳定；未知型号允许手工添加后继续按控制接口验证。
    return true;
  }

  private isEzvizDeviceAlreadyLinkedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /(已被.*添加|已添加|已存在|已绑定|already.*(add|exist|bind|own|link))/i.test(message);
  }

  private recordOrEmpty(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  private assertText(value: unknown, message: string): asserts value is string {
    if (typeof value !== "string" || value.trim() === "") throw new BadRequestException(message);
  }

  private maskCommandResponse(payload: Record<string, unknown>): Record<string, unknown> {
    const clone = { ...payload };
    delete clone.accessToken;
    delete clone.appSecret;
    delete clone.app_key;
    return clone;
  }
}
