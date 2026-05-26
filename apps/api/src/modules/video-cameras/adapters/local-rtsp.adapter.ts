import { BaseVideoPlatformAdapter } from "./video-platform-adapter";

export class LocalRtspAdapter extends BaseVideoPlatformAdapter {
  readonly platformType = "LOCAL_RTSP";
}
