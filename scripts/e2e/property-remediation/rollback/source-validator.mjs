import { assertCommitRef, assertFinalSha, repoRoot } from "./lib.mjs";
import { buildClosureBindings } from "./closure-binding.mjs";
import { execFileBounded, TIMEOUTS } from "./timeout.mjs";

async function defaultGit(args, cwd = repoRoot) {
  const { stdout } = await execFileBounded("/usr/bin/git", args, { cwd, env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", TZ: "UTC" }, maxBuffer: 16 * 1024 * 1024 }, { timeout: TIMEOUTS.git, label: `source git ${args[0]}` });
  return stdout.trim();
}

export async function validateSourceBinding({
  finalSha,
  profile,
  cwd = repoRoot,
  requireClean = true
}) {
  const git = defaultGit;
  assertFinalSha(finalSha);
  const head = await git(["rev-parse", "HEAD"], cwd);
  if (head !== finalSha) throw new Error("final SHA does not equal the rehearsal worktree HEAD");
  const resolved = new Map();
  for (const rehearsalCase of profile.cases) {
    for (const commit of rehearsalCase.commits) {
      assertCommitRef(commit, `commit for ${rehearsalCase.id}`);
      const full = await git(["rev-parse", "--verify", `${commit}^{commit}`], cwd);
      assertFinalSha(full);
      if (!full.startsWith(commit)) throw new Error(`commit resolution mismatch for ${commit}`);
      const existing = resolved.get(commit);
      if (existing && existing !== full) throw new Error(`ambiguous commit binding for ${commit}`);
      resolved.set(commit, full);
      try {
        await git(["merge-base", "--is-ancestor", full, finalSha], cwd);
      } catch {
        throw new Error(`profile commit is not an ancestor of final SHA: ${commit}`);
      }
    }
  }
  if (requireClean) {
    const semanticPaths = profile.cases.flatMap((entry) => [
      ...entry.targetedTestFiles,
      ...(entry.rollbackSemanticContract?.postApply ?? []).map(({ path }) => path),
      ...(entry.rollbackSemanticContract?.retainedShell ?? []).map(({ path }) => path),
      ...(entry.rollbackSemanticContract?.protectedExternalPaths ?? []).map(({ path }) => path)
    ]);
    const status = await git([
      "status",
      "--porcelain",
      "--untracked-files=all",
      "--",
      "apps/api/src/modules/homestay",
      "apps/api/src/modules/housing",
      "apps/web/features/homestay",
      "apps/web/features/housing",
      "apps/web/features/property-shared/offline",
      "apps/web/components/runtime/MobileTerminalReliability.tsx",
      "scripts/e2e/property-remediation/rollback",
      ...[...new Set(semanticPaths)].sort()
    ], cwd);
    if (status) throw new Error("rollback source paths contain uncommitted changes");
  }
  const commits = Object.fromEntries([...resolved.entries()].sort(([left], [right]) => left.localeCompare(right)));
  const closures = await buildClosureBindings({ profile, resolvedCommits: commits, git, cwd });
  return {
    schemaVersion: "property-track-c-rollback-source-binding-v1",
    finalSha,
    head,
    commits,
    closures
  };
}
