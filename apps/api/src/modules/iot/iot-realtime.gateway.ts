import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { SaaSModulesService } from "../saas-modules/saas-modules.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { IotRealtimeService } from "./iot-realtime.service";

interface ClientMessage {
  type?: string;
  topic?: string;
  topics?: string[];
}

const REALTIME_PATHS = new Set(["/api/v1/iot/realtime", "/iot/realtime"]);
const IOT_MODULE_CODE = "iot";

@Injectable()
export class IotRealtimeGateway implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IotRealtimeGateway.name);
  private readonly server = new WebSocketServer({ noServer: true });
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private attachedServer: { on(event: "upgrade", listener: (request: IncomingMessage, socket: Socket, head: Buffer) => void): unknown; off(event: "upgrade", listener: (request: IncomingMessage, socket: Socket, head: Buffer) => void): unknown } | null = null;

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly jwtService: JwtService,
    private readonly modulesService: SaaSModulesService,
    private readonly realtimeService: IotRealtimeService
  ) {}

  onApplicationBootstrap(): void {
    const httpServer = this.httpAdapterHost.httpAdapter?.getHttpServer?.();
    if (!httpServer) {
      this.logger.warn("IoT realtime gateway could not find HTTP server; WebSocket is disabled");
      return;
    }
    this.attachedServer = httpServer;
    httpServer.on("upgrade", this.handleUpgrade);
    this.heartbeatTimer = setInterval(() => this.realtimeService.pingClients(), 30_000);
    this.logger.log("IoT realtime WebSocket endpoint mounted at /api/v1/iot/realtime");
  }

  onApplicationShutdown(): void {
    if (this.attachedServer) {
      this.attachedServer.off("upgrade", this.handleUpgrade);
      this.attachedServer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.server.close();
  }

  private readonly handleUpgrade = (request: IncomingMessage, socket: Socket, head: Buffer): void => {
    void this.upgrade(request, socket, head);
  };

  private async upgrade(request: IncomingMessage, socket: Socket, head: Buffer): Promise<void> {
    const url = new URL(request.url ?? "", "http://localhost");
    if (!REALTIME_PATHS.has(url.pathname)) {
      return;
    }
    try {
      const token = this.extractToken(request, url);
      if (!token) {
        this.reject(socket, 401, "Unauthorized");
        return;
      }
      const principal = await this.verifyPrincipal(token);
      await this.assertIotModuleEnabled(principal);
      this.server.handleUpgrade(request, socket, head, (client) => this.bindClient(client, principal));
    } catch (error) {
      this.logger.warn(`IoT realtime connection rejected: ${error instanceof Error ? error.message : String(error)}`);
      this.reject(socket, 403, "Forbidden");
    }
  }

  private bindClient(client: WebSocket, principal: JwtPrincipal): void {
    this.realtimeService.registerClient(client, principal);
    client.on("message", (raw) => {
      void this.handleMessage(client, raw);
    });
    client.on("pong", () => this.realtimeService.markAlive(client));
    client.on("close", () => this.realtimeService.unregisterClient(client));
    client.on("error", (error) => this.logger.warn(`IoT realtime client error: ${error.message}`));
  }

  private async handleMessage(client: WebSocket, raw: RawData): Promise<void> {
    try {
      const message = JSON.parse(raw.toString()) as ClientMessage;
      if (message.type === "subscribe" && message.topic) {
        await this.realtimeService.subscribe(client, message.topic);
        return;
      }
      if (message.type === "subscribe" && Array.isArray(message.topics)) {
        for (const topic of message.topics) {
          await this.realtimeService.subscribe(client, topic);
        }
        return;
      }
      if (message.type === "unsubscribe" && message.topic) {
        this.realtimeService.unsubscribe(client, message.topic);
        return;
      }
      if (message.type === "ping") {
        client.send(JSON.stringify({ type: "pong", server_time: new Date().toISOString() }));
        return;
      }
      client.send(JSON.stringify({ type: "error", message: "Unsupported IoT realtime message" }));
    } catch (error) {
      client.send(
        JSON.stringify({
          type: "error",
          message: error instanceof Error ? error.message : "Invalid IoT realtime message"
        })
      );
    }
  }

  private extractToken(request: IncomingMessage, url: URL): string | null {
    const queryToken = url.searchParams.get("token") ?? url.searchParams.get("access_token");
    if (queryToken) return queryToken;
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return null;
    return authorization.slice("Bearer ".length).trim();
  }

  private async verifyPrincipal(token: string): Promise<JwtPrincipal> {
    const principal = await this.jwtService.verifyAsync<JwtPrincipal>(token);
    if (!principal?.tenantId || !principal.parkId || !principal.sub) {
      throw new Error("Invalid JWT principal");
    }
    return principal;
  }

  private async assertIotModuleEnabled(principal: JwtPrincipal): Promise<void> {
    const modules = await this.modulesService.listEnabledModulesForTenant(principal.tenantId, principal.parkId);
    if (!modules.some((item) => item.module_code === IOT_MODULE_CODE)) {
      throw new Error("MODULE_NOT_ENABLED");
    }
  }

  private reject(socket: Socket, statusCode: number, reason: string): void {
    if (socket.destroyed) return;
    socket.write(`HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  }
}
