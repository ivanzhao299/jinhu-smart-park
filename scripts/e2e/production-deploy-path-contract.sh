#!/usr/bin/env sh
set -eu

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
guard="$repo_root/scripts/validate-production-deploy-path.sh"

expect_pass() {
  path="$1"
  sh "$guard" "$path" >/dev/null
}

expect_fail() {
  path="$1"
  if sh "$guard" "$path" >/dev/null 2>&1; then
    echo "expected deploy path to be rejected: $path" >&2
    exit 1
  fi
}

expect_pass /srv/jinhu-smart-park-production
expect_pass /var/lib/jinhu-smart-park/app

expect_fail ""
expect_fail relative/path
expect_fail /
expect_fail /srv
expect_fail /srv/agent-studio
expect_fail /srv/agent-studio/releases/current
expect_fail /srv/agent-studio-runtime
expect_fail /srv/managed-projects/jinhu-smart-park/state
expect_fail /srv/managed-projects/jinhu-smart-park/worktrees/task-1
expect_fail /srv/managed-projects
expect_fail /etc/anksen-runner
expect_fail /opt/phoenix-runner
expect_fail /opt/phoenix-runner/app

echo "Production deploy path contract passed."
