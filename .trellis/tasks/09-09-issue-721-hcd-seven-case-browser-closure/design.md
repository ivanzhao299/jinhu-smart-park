# Design

## Approach

Extend the existing declarative browser-UAT runner only where needed to express real actions (open control, choose option, submit, wait for mutation, reload/back, assert echo). Keep generic navigation/session/network/privacy machinery unchanged. Build disposable fixtures through existing product API scripts, adding narrow fixture hooks only for states unavailable through public product flows (notably the unknown eligibility code).

## Evidence contract

Each viewport/case record binds the action log, same-origin mutation response, post-persistence DOM assertions, screenshot, console/runtime result, and tested commit/run identity. The evidence manifest hashes every retained file. A case fails closed when an action, persistence response, post-refresh echo, viewport, session-isolation, privacy, or manifest check is missing.

## Safety and rollback

Use a unique compose project, loopback ports, disposable volumes, synthetic RUN_ID data, and a dedicated Chromium profile. Enumerate resources before teardown and remove only resources carrying this run identity. Product fixes stay inside HCD presentation/interaction scope; fixture-only overrides are isolated to the disposable run and never shipped as production behavior.
