"use client";

import { MonitorPlay } from "lucide-react";

export interface VideoStreamResult {
  protocol: "webrtc" | "hls" | "rtsp" | "snapshot" | "none";
  url: string | null;
  requiresTranscoding?: boolean;
  message: string;
  source: string;
}

export function VideoPlayer({ stream }: { stream: VideoStreamResult | null }) {
  if (!stream) {
    return <p className="muted-text">请选择摄像头后查看实时预览。</p>;
  }
  if (!stream.url || stream.protocol === "none") {
    return (
      <div className="empty-state">
        <MonitorPlay size={22} />
        <p>{stream.message}</p>
      </div>
    );
  }
  if (stream.protocol === "rtsp") {
    return (
      <div className="empty-state">
        <MonitorPlay size={22} />
        <p>{stream.message}</p>
        <code className="code-chip">{stream.url}</code>
      </div>
    );
  }
  if (stream.protocol === "snapshot") {
    return (
      <div className="video-preview-frame">
        <img src={stream.url} alt="摄像头快照" />
      </div>
    );
  }
  return (
    <div className="video-preview-frame">
      <video controls playsInline src={stream.url} />
      <p className="muted-text">{stream.message}</p>
    </div>
  );
}
