"use client";

import { RemoteEntityPickerView } from "./RemoteEntityPickerView";
import { useRemotePickerController } from "./picker-controller";
import type { RemoteEntityPickerProps } from "./types";

export type { RemoteEntityPickerProps } from "./types";

export function RemoteEntityPicker(props: RemoteEntityPickerProps) {
  const controller = useRemotePickerController(props);
  return <RemoteEntityPickerView {...props} controller={controller} />;
}
