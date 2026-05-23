"use client";

import { API_PREFIX } from "./api-client";
import { getAccessToken } from "./authz";

export type IotRealtimeConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "closed" | "error";
export type IotRealtimeEventName = "device.latest" | "device.status" | "alert.created" | "alert.updated";

export interface IotRealtimeEvent<T = Record<string, unknown>> {
  type: "event";
  event: IotRealtimeEventName;
  tenant_id: string;
  park_id: string;
  device_id?: string;
  alert_id?: string;
  data: T;
  server_time: string;
}

export type IotRealtimeMessage =
  | IotRealtimeEvent
  | { type: "welcome"; tenant_id: string; park_id: string; server_time: string }
  | { type: "subscribed"; topic: string; server_time: string }
  | { type: "unsubscribed"; topic: string; server_time: string }
  | { type: "error"; message: string; topic?: string };

type MessageHandler = (message: IotRealtimeMessage) => void;
type StateHandler = (state: IotRealtimeConnectionState) => void;

export class IotRealtimeClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private shouldReconnect = true;
  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly stateHandlers = new Set<StateHandler>();
  private state: IotRealtimeConnectionState = "idle";

  constructor(private topics: string[] = []) {}

  connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) {
      return;
    }
    const token = getAccessToken();
    if (!token) {
      this.setState("error");
      this.emitMessage({ type: "error", message: "未登录，无法连接 IoT 实时通道" });
      return;
    }
    this.shouldReconnect = true;
    this.setState(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");
    const socket = new WebSocket(buildIotRealtimeUrl(token));
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.setState("connected");
      this.subscribeTopics();
    };
    socket.onmessage = (event) => {
      const message = parseRealtimeMessage(event.data);
      if (message) this.emitMessage(message);
    };
    socket.onerror = () => {
      this.setState("error");
    };
    socket.onclose = () => {
      this.socket = null;
      if (!this.shouldReconnect) {
        this.setState("closed");
        return;
      }
      this.scheduleReconnect();
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.setState("closed");
  }

  setTopics(topics: string[]): void {
    const nextTopics = normalizeTopics(topics);
    const previous = new Set(this.topics);
    this.topics = nextTopics;
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    for (const topic of previous) {
      if (!nextTopics.includes(topic)) {
        this.socket.send(JSON.stringify({ type: "unsubscribe", topic }));
      }
    }
    this.subscribeTopics();
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onState(handler: StateHandler): () => void {
    this.stateHandlers.add(handler);
    handler(this.state);
    return () => this.stateHandlers.delete(handler);
  }

  private subscribeTopics(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    for (const topic of this.topics) {
      this.socket.send(JSON.stringify({ type: "subscribe", topic }));
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempt += 1;
    this.setState("reconnecting");
    const delay = Math.min(10_000, 800 * this.reconnectAttempt);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private setState(state: IotRealtimeConnectionState): void {
    this.state = state;
    for (const handler of this.stateHandlers) {
      handler(state);
    }
  }

  private emitMessage(message: IotRealtimeMessage): void {
    for (const handler of this.messageHandlers) {
      handler(message);
    }
  }
}

export function buildIotRealtimeUrl(token: string): string {
  if (typeof window === "undefined") return "";
  const prefix = API_PREFIX.replace(/\/$/, "");
  if (/^https?:\/\//i.test(prefix)) {
    const url = new URL(`${prefix}/iot/realtime`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("token", token);
    return url.toString();
  }
  const origin = new URL(window.location.origin);
  origin.protocol = origin.protocol === "https:" ? "wss:" : "ws:";
  origin.pathname = `${prefix}/iot/realtime`;
  origin.searchParams.set("token", token);
  return origin.toString();
}

export function isIotRealtimeEvent(message: IotRealtimeMessage): message is IotRealtimeEvent {
  return message.type === "event";
}

function normalizeTopics(topics: string[]): string[] {
  return Array.from(new Set(topics.map((topic) => topic.trim()).filter(Boolean)));
}

function parseRealtimeMessage(data: unknown): IotRealtimeMessage | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data) as IotRealtimeMessage;
  } catch {
    return { type: "error", message: "IoT 实时消息解析失败" };
  }
}
