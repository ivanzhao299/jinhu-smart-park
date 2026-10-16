# Five-channel template editor continuity

## 1. Scope / Trigger
Normal performance template list/editor maintenance for full five-channel definitions. Existing dimension authoring remains available. The same workbench now activates published five-channel versions through the complete workflow; see hr-performance-channel-workflow.md.

## 2. Signatures
`PerformanceTemplateEditor` chooses dimension or `PerformanceChannelDefinitionEditor`. `PerformanceChannelDefinitionFields` edits a full shared config and can display a retained revision read-only. `PerformanceChannelDefinitionHistory` pages every retained revision and selects historical version IDs. hrApi provides explicit create/version/append/history adapters with optional captured idempotency keys.

## 3. Contracts
Runtime detail decoding branches on calculationMode; five-channel detail requires strict full config, currentRevisionId and empty dimension/level arrays; published detail additionally requires frozen workflow policy and revision. Never run its101items/41grades through the legacy30/20 decoder. Store decimal/int strings without Number conversion; only int32 order uses Number. NULL controls preserve empty string separately; stable IDs are generated once and kept across field changes, pages and saves. Policies are explicit nullable choices with empty actor arrays, never inferred letter roles. Full arrays remain in local state while ten-row pages render; read-only navigation remains enabled.
All authoring uses existing DS panels/buttons/mobile records and scoped layout CSS; min44px actions and single-column390px layout. Current draft revision and new version are explicit choices. Stable parent name/code are read-only on continuation; version displayName remains editable. Five-channel list offers publication through the existing endpoint once complete workflow policies are configured. Definition editing can save a full paired workflow document with dual CAS; published configuration is continued through a new version.
Capture the full payload/token/key in an attempt. An uncertain network/5xx/malformed receipt freezes editing and shared competing writes; retry invokes exactly the captured attempt. Definite400/401/403/404/422 or ordinary409 releases the attempt and retains editable input. A matched receipt clears the attempt before refresh; failed refresh does not reopen a write. Parent lock releases after successful editor replacement/unmount. Full identity replacement suppresses old completion; abort/generation guards discard late detail/history reads. History old versions and all pages remain reachable.

## 4. Validation & Error Matrix
Malformed detail/config -> visible owned error; no editor mounted. Numeric/type/precision/identity/length failure -> local error and zero API write. Uncertain write -> original-request retry plus disabled competing writes. Definite rejection -> editable retained draft. Committed save plus read failure -> success with refresh warning. History failure -> independent refresh action; obsolete responses ignored.

## 5. Good / Base / Bad Cases
Good: edit item11 after paging and save all101 original items with exact9999999999999999.99. Base: read-only history can page through item101 and candidate41. Bad: disable all read-only pagination, treat an empty numeric field as NULL implicitly, regenerate IDs on each render or retry using a new key.

## 6. Tests Required
Actual component tests cover complete collections/guides, precision/NULL/empty texts, creation/version/revision adapters, failed drafts, original key/body/token retry and lock, malformed receipts, late completion/history generation, history paging and read-only permission/list activation boundaries. Run old13 dimension interactions without changes, shared build, both app lint/typecheck and final builds. Native desktop390px visual acceptance is root-owned; a synthetic preview does not establish production UAT.

## 7. Wrong vs Correct
Wrong: save `items.slice(pageOffset,pageEnd)` or use `Number(fullValue)`. Correct: submit complete `config.items` and preserve fullValue as a string. Wrong: mark the whole read-only fieldset disabled including Pager. Correct: disable mutable fields/actions while navigation continues to expose complete history.

Final native checks: pair every ds-button with ds-button-primary or ds-button-secondary; the base class supplies geometry only. Nested revision-history record buttons need a44px minimum target too. Show ordinary 未配置 text while preserving explicit internal NULL state. Async history tests wait for the actual revision row/button, not just the synchronously rendered history heading. Actual-component preview uses automatic JSX and verifies component/shared/global CSS source hashes before screenshots.
