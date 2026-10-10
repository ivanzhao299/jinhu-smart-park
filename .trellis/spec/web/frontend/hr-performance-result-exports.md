# Modern performance result exports

## Scope and entry
Modern evaluation summary and dimension ledgers are readonly CSV exports of existing /hr/performance-v2/review-page. They use the same cycle/status filters and READ, TEAM_READ, SELF_READ precedence as the workbench. They do not reproduce every legacy report format or reimplement scoring rules.

## Data contract
Use ScopedLedgerExport and collectScopedExport:100-row pages,maximum5000 reviews,actual page/pageSize mapped to page_size,one captured token and AbortSignal,all pages plus first-page recheck. Invalid metadata,partial pages,duplicates,changed total/first page and failures reject without downloading partial data. This detects drift and is not an atomic cross-page snapshot.

Explicit summary columns:cycle,employee code/name,business status,self total,manager total,calibration total,result score/level,appeal status. Dimension columns:cycle,employee code/name,status,dimension code/name/weight/bounds,self/manager/calibration scores and actual self/manager comments. No internal IDs,raw snapshot,actions,links or computed missing scores. Preserve decimal strings,zero/null,CSV BOM and formula escaping. Unknown enum labels retain actual text.

## Projection and lifetime
Park READ precedes TEAM then SELF. Self-only without RESULT_READ may see manager,calibration and final results only at employee_acknowledged,appealed,confirmed stages,matching the existing backend projection; injected early-stage fields must not leak. Existing backend output is authoritative. Full auth/filter context,enabled transitions and unmount cancel pending downloads. No read capability means no export/query. Disable exports during writes or loading/errors.

## Verification
Real-workbench interaction tests cover complete101-review paging,filter forwarding,response metadata failure,failed retry,context/disabled cancellation,double-click,no-read and masking; serializers cover summary/dimensions,decimal zero/null and CSV protection. Run focused tests,Web final type/lint/build and actual desktop/390px browser inspection. Production runtime evidence and real-role business acceptance remain separate.
