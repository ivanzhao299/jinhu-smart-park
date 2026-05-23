"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  IotRealtimeClient,
  isIotRealtimeEvent,
  type IotRealtimeConnectionState,
  type IotRealtimeEvent,
  type IotRealtimeMessage
} from "../lib/iot-realtime";

export interface UseIotRealtimeOptions {
  topics: string[];
  enabled?: boolean;
  onEvent?: (event: IotRealtimeEvent) => void;
  onMessage?: (message: IotRealtimeMessage) => void;
}

export interface UseIotRealtimeResult {
  connectionState: IotRealtimeConnectionState;
  lastEvent: IotRealtimeEvent | null;
  errorMessage: string;
}

export function useIotRealtime(options: UseIotRealtimeOptions): UseIotRealtimeResult {
  const { topics, enabled = true, onEvent, onMessage } = options;
  const [connectionState, setConnectionState] = useState<IotRealtimeConnectionState>("idle");
  const [lastEvent, setLastEvent] = useState<IotRealtimeEvent | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const eventHandlerRef = useRef(onEvent);
  const messageHandlerRef = useRef(onMessage);
  const topicsKey = useMemo(() => topics.map((topic) => topic.trim()).filter(Boolean).sort().join("|"), [topics]);

  useEffect(() => {
    eventHandlerRef.current = onEvent;
    messageHandlerRef.current = onMessage;
  }, [onEvent, onMessage]);

  useEffect(() => {
    if (!enabled || !topicsKey) {
      setConnectionState("idle");
      return;
    }
    const client = new IotRealtimeClient(topicsKey.split("|"));
    const offState = client.onState(setConnectionState);
    const offMessage = client.onMessage((message) => {
      messageHandlerRef.current?.(message);
      if (message.type === "error") {
        setErrorMessage(message.message);
        return;
      }
      if (isIotRealtimeEvent(message)) {
        setLastEvent(message);
        eventHandlerRef.current?.(message);
      }
    });
    client.connect();
    return () => {
      offMessage();
      offState();
      client.disconnect();
    };
  }, [enabled, topicsKey]);

  return { connectionState, lastEvent, errorMessage };
}
