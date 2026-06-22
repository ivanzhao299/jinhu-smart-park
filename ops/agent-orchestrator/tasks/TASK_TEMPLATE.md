# Agent Task

## Target Agent
agent-x

## Working Directory
/path/to/worktree

## Branch
branch-name

## Task Goal
明确目标

## Strict Boundaries
1. 不新增 migration，除非明确批准
2. 不修改旧 migration
3. 不修改 auth / CI / Docker / deploy
4. 不提交 secrets
5. 不扩大任务范围

## Files To Inspect
- file/path

## Implementation Requirements
1. requirement

## Validation Commands
- pnpm typecheck

## Commit Message
type(agent-x): message

## Final Report Required
1. Changed files
2. Implementation summary
3. Validation commands run
4. Validation results
5. Commit hash
6. Remaining risks
7. FINALIZE RESULT

Main orchestrator tasks must include a real `FINALIZE RESULT`. No `FINALIZE RESULT: PASS`, no DONE. Worker-agent tasks that cannot push/sync/finalize must explicitly state `FINALIZE RESULT: not applicable for worker agent`.
