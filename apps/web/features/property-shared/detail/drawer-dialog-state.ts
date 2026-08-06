export type DrawerDialogCommand = "show-modal" | "close" | "none";

export function resolveDrawerDialogCommand(
  presentation: "full" | "drawer",
  dialogOpen: boolean
): DrawerDialogCommand {
  if (presentation === "drawer" && !dialogOpen) {
    return "show-modal";
  }
  if (presentation === "full" && dialogOpen) {
    return "close";
  }
  return "none";
}
