import { existsSync, rmSync } from "node:fs";
import { assertMutationPathHasNoSymlink, resolveInside } from "./lib.mjs";

export function cleanDeclaredBuildOutput(worktree, spec) {
  if (!spec.cleanPath) return null;
  const path = resolveInside(worktree, spec.cleanPath, "declared build output");
  assertMutationPathHasNoSymlink(worktree, path);
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  if (existsSync(path)) throw new Error(`declared build output remains after cleanup: ${spec.cleanPath}`);
  return path;
}
