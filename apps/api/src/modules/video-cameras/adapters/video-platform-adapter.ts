import type { CameraDeviceEntity } from "../entities/camera-device.entity";
import type { VideoPlatformConfigEntity } from "../entities/video-platform-config.entity";

export interface VideoPlaybackWindow {
  startTime?: string;
  endTime?: string;
}

export interface VideoStreamResult {
  protocol: "webrtc" | "hls" | "rtsp" | "snapshot" | "none";
  url: string | null;
  requiresTranscoding?: boolean;
  message: string;
  source: string;
}

export interface VideoStatusResult {
  status: string;
  checkedAt: string;
  source: string;
  message: string;
}

export interface VideoPlatformAdapter {
  readonly platformType: string;
  getPreviewUrl(camera: CameraDeviceEntity, config: VideoPlatformConfigEntity | null): Promise<VideoStreamResult>;
  getSnapshotUrl(camera: CameraDeviceEntity, config: VideoPlatformConfigEntity | null): Promise<VideoStreamResult>;
  refreshToken(config: VideoPlatformConfigEntity): Promise<{ status: string; message: string; tokenExpireAt: Date | null }>;
  checkDeviceStatus(camera: CameraDeviceEntity, config: VideoPlatformConfigEntity | null): Promise<VideoStatusResult>;
  getPlaybackUrl(camera: CameraDeviceEntity, config: VideoPlatformConfigEntity | null, window: VideoPlaybackWindow): Promise<VideoStreamResult>;
}

export function sanitizePlayableUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return value.replace(/(rtsp|http|https):\/\/([^/@]+)@/i, "$1://***@");
  }
}

export function chooseCameraStream(camera: CameraDeviceEntity): VideoStreamResult {
  if (camera.webrtcUrl) {
    return { protocol: "webrtc", url: sanitizePlayableUrl(camera.webrtcUrl), message: "WebRTC 地址可直接用于低延迟预览", source: "camera" };
  }
  if (camera.hlsUrl) {
    return { protocol: "hls", url: sanitizePlayableUrl(camera.hlsUrl), message: "HLS 地址可直接预览", source: "camera" };
  }
  if (camera.rtspUrl) {
    return {
      protocol: "rtsp",
      url: sanitizePlayableUrl(camera.rtspUrl),
      requiresTranscoding: true,
      message: "RTSP 需要经转码服务转换为 HLS 或 WebRTC 后播放",
      source: "camera"
    };
  }
  return { protocol: "none", url: null, message: "未配置可用视频流地址", source: "camera" };
}

export abstract class BaseVideoPlatformAdapter implements VideoPlatformAdapter {
  abstract readonly platformType: string;

  async getPreviewUrl(camera: CameraDeviceEntity): Promise<VideoStreamResult> {
    return chooseCameraStream(camera);
  }

  async getSnapshotUrl(camera: CameraDeviceEntity): Promise<VideoStreamResult> {
    return {
      protocol: camera.snapshotUrl ? "snapshot" : "none",
      url: sanitizePlayableUrl(camera.snapshotUrl),
      message: camera.snapshotUrl ? "快照地址已配置" : "未配置快照地址",
      source: "camera"
    };
  }

  async refreshToken(config: VideoPlatformConfigEntity): Promise<{ status: string; message: string; tokenExpireAt: Date | null }> {
    return {
      status: config.status,
      message: "当前阶段仅预留第三方平台 token 刷新接口，未调用真实厂家 API",
      tokenExpireAt: config.tokenExpireAt
    };
  }

  async checkDeviceStatus(camera: CameraDeviceEntity): Promise<VideoStatusResult> {
    return {
      status: camera.isEnabled ? camera.status : "DISABLED",
      checkedAt: new Date().toISOString(),
      source: "camera",
      message: "当前阶段使用本地摄像头状态字段模拟检测"
    };
  }

  async getPlaybackUrl(camera: CameraDeviceEntity): Promise<VideoStreamResult> {
    const preview = chooseCameraStream(camera);
    return { ...preview, message: preview.url ? `${preview.message}；回放接口已预留时间窗参数` : preview.message };
  }
}
