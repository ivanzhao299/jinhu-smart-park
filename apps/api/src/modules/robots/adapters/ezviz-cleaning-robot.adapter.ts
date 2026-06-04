import { BadGatewayException, Injectable } from "@nestjs/common";

const DEFAULT_BASE_URL = "https://open.ys7.com";

export interface EzvizApiResult<T = unknown> {
  code?: string;
  msg?: string;
  data?: T;
  [key: string]: unknown;
}

export interface EzvizTaskStatus {
  currentTask?: unknown;
  preTask?: unknown;
  taskID?: string;
  currentMapID?: string;
  cleanModeCfg?: unknown;
  exception?: unknown;
  exceptionInfo?: unknown;
  cleanTaskInfo?: unknown;
}

export class EzvizApiException extends BadGatewayException {
  constructor(
    public readonly ezvizCode: string,
    message: string
  ) {
    super(message);
  }
}

@Injectable()
export class EzvizCleaningRobotAdapter {
  async getToken(baseUrl: string | undefined, appKey: string, appSecret: string): Promise<EzvizApiResult<{ accessToken: string; expireTime: number }>> {
    return this.postForm(baseUrl, "/api/lapp/token/get", { appKey, appSecret });
  }

  async addDevice(baseUrl: string | undefined, accessToken: string, deviceSerial: string, validateCode: string): Promise<EzvizApiResult> {
    return this.postForm(baseUrl, "/api/lapp/device/add", { accessToken, deviceSerial, validateCode });
  }

  async deleteDevice(baseUrl: string | undefined, accessToken: string, deviceSerial: string): Promise<EzvizApiResult> {
    return this.postForm(baseUrl, "/api/lapp/device/delete", { accessToken, deviceSerial });
  }

  async listDevices(baseUrl: string | undefined, accessToken: string, pageStart = 0, pageSize = 50): Promise<EzvizApiResult> {
    return this.postForm(baseUrl, "/api/lapp/device/list", { accessToken, pageStart: String(pageStart), pageSize: String(pageSize) });
  }

  async deviceInfo(baseUrl: string | undefined, accessToken: string, deviceSerial: string): Promise<EzvizApiResult> {
    return this.postForm(baseUrl, "/api/lapp/device/version/info", { accessToken, deviceSerial });
  }

  async queryCurrentTask(baseUrl: string | undefined, accessToken: string, deviceSerial: string): Promise<EzvizApiResult<EzvizTaskStatus>> {
    return this.putOtapAction(baseUrl, accessToken, deviceSerial, "SweeperTaskMgr", "QueryCurrentTask", {});
  }

  async cleanControl(baseUrl: string | undefined, accessToken: string, deviceSerial: string, command: string): Promise<EzvizApiResult> {
    return this.putOtapAction(baseUrl, accessToken, deviceSerial, "SweeperCleanTask", "CleanControl", command);
  }

  async setCleanMode(baseUrl: string | undefined, accessToken: string, deviceSerial: string, mode: string): Promise<EzvizApiResult> {
    return this.putOtapProp(baseUrl, accessToken, deviceSerial, "SweeperCleanTask", "SweepMopMode", mode);
  }

  async queryPath(baseUrl: string | undefined, accessToken: string, deviceSerial: string, mapId: string): Promise<EzvizApiResult> {
    return this.postForm(baseUrl, "/api/specialbiz/v3/sweeprobot/v3/rule/path", { accessToken, deviceSerial, mapId });
  }

  async startRegionClean(baseUrl: string | undefined, accessToken: string, deviceSerial: string, payload: unknown): Promise<EzvizApiResult> {
    return this.putOtapAction(baseUrl, accessToken, deviceSerial, "SweeperCleanTask", "StartRegionClean", payload);
  }

  async startTempRegionClean(baseUrl: string | undefined, accessToken: string, deviceSerial: string, payload: unknown): Promise<EzvizApiResult> {
    return this.putOtapAction(baseUrl, accessToken, deviceSerial, "SweeperCleanTask", "StartTempRegionClean", payload);
  }

  private async postForm<T>(baseUrl: string | undefined, path: string, form: Record<string, string>): Promise<EzvizApiResult<T>> {
    const response = await fetch(`${this.base(baseUrl)}${path}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form)
    });
    return this.parseResponse<T>(response);
  }

  private async putOtapAction<T>(
    baseUrl: string | undefined,
    accessToken: string,
    deviceSerial: string,
    domainIdentifier: string,
    actionIdentifier: string,
    body: unknown
  ): Promise<EzvizApiResult<T>> {
    return this.putJson<T>(baseUrl, "/api/v3/device/otap/action", accessToken, deviceSerial, {
      resourceCategory: "SweepingRobot",
      domainIdentifier,
      actionIdentifier
    }, body);
  }

  private async putOtapProp<T>(
    baseUrl: string | undefined,
    accessToken: string,
    deviceSerial: string,
    domainIdentifier: string,
    propIdentifier: string,
    body: unknown
  ): Promise<EzvizApiResult<T>> {
    return this.putJson<T>(baseUrl, "/api/v3/device/otap/prop", accessToken, deviceSerial, {
      resourceCategory: "SweepingRobot",
      domainIdentifier,
      propIdentifier
    }, body);
  }

  private async putJson<T>(
    baseUrl: string | undefined,
    path: string,
    accessToken: string,
    deviceSerial: string,
    headers: Record<string, string>,
    body: unknown
  ): Promise<EzvizApiResult<T>> {
    const response = await fetch(`${this.base(baseUrl)}${path}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        accessToken,
        deviceSerial,
        localIndex: "0",
        ...headers
      },
      body: JSON.stringify(body)
    });
    return this.parseResponse<T>(response);
  }

  private async parseResponse<T>(response: Response): Promise<EzvizApiResult<T>> {
    const text = await response.text();
    let payload: EzvizApiResult<T>;
    try {
      payload = text ? (JSON.parse(text) as EzvizApiResult<T>) : {};
    } catch {
      throw new BadGatewayException("EZVIZ response is not valid JSON");
    }
    if (!response.ok) {
      throw new BadGatewayException(payload.msg || `EZVIZ request failed: ${response.status}`);
    }
    if (payload.code && !["0", "200"].includes(String(payload.code))) {
      throw new EzvizApiException(String(payload.code), payload.msg || `EZVIZ request failed: ${payload.code}`);
    }
    return payload;
  }

  private base(baseUrl: string | undefined): string {
    return (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  }
}
