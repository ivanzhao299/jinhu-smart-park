import { canonicalSha256, sha256 } from "./lib.mjs";

export async function buildClosureBindings({ profile, resolvedCommits, git, cwd }) {
  const closures = {};
  for (const rehearsalCase of profile.cases) {
    const touched = new Set();
    const reverseDiffs = [];
    let combined = "";
    for (const commitRef of [...rehearsalCase.commits].reverse()) {
      const fullSha = resolvedCommits[commitRef];
      if (!fullSha) throw new Error(`missing resolved closure commit: ${commitRef}`);
      const names = (await git(["diff-tree", "--no-commit-id", "--name-only", "-r", fullSha], cwd)).split("\n").filter(Boolean);
      const semanticAuditPaths = new Set([
        ...(rehearsalCase.rollbackSemanticContract?.postApply ?? []).map(({ path }) => path),
        ...(rehearsalCase.rollbackSemanticContract?.retainedShell ?? []).map(({ path }) => path),
        ...(rehearsalCase.rollbackSemanticContract?.protectedExternalPaths ?? []).map(({ path }) => path)
      ]);
      const owned = names.filter((path) => rehearsalCase.allowedPatchPrefixes.some((prefix) => path.startsWith(prefix)) || semanticAuditPaths.has(path)).sort();
      if (owned.length === 0) throw new Error(`closure has no owned changed paths: ${rehearsalCase.id}/${commitRef}`);
      owned.forEach((path) => touched.add(path));
      const reverse = await git(["diff", "--binary", "--full-index", fullSha, `${fullSha}^`, "--", ...owned], cwd);
      if (!reverse.trim()) throw new Error(`closure reverse diff is empty: ${rehearsalCase.id}/${commitRef}`);
      combined += `${reverse}\n`;
      reverseDiffs.push({ commitRef, fullSha, reverseDiffSha256: sha256(reverse) });
    }
    const touchedPaths = [...touched].sort();
    closures[rehearsalCase.id] = {
      commits: reverseDiffs,
      touchedPaths,
      touchedPathsSha256: canonicalSha256(touchedPaths),
      reversePatchSha256: sha256(combined)
    };
  }
  return closures;
}
