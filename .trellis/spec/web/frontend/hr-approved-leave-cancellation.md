# Approved leave cancellation work surface

Use LeaveCancellationPanel within the modern attendance page. Lazy opening avoids eager source/history reads. Operation-only users can enter the panel without claiming attendance-ledger read authority; REQUEST/OPERATE control source selection, while every returned record carries server-calculated allowed actions. Account/context changes remount the page; a changed token also blocks writes without waiting for a render.

Source, records and version history have independent20-row paging, totals and last-page recovery. Abort replaced reads and unmount; do not publish late or foreign-context results. Read failures clear only affected rows, have explicit retry, and never enable creating from failed source reads. History selection resets paging and clears prior rows; return comments are visible.

Creation captures original version; edits/actions capture current version. Minute inputs explicitly display Beijing time and transmit timezone offsets. Mandatory reason/return comment validation precedes transport. Each exact operation/body/token owns one retry key; failed writes retain the form, synchronous submission lock prevents repeats, and panel collapse is disabled during write. Clear the form on confirmed success before subsequent ledger refresh. A refresh failure must retain confirmed success and never repeat the mutation.

Use shared DS surfaces/buttons/form fields. Cards remain visible on desktop and mobile; operation/paging rows wrap, controls are44px, and long source names wrap. Local CSS expresses layout only and removes native fieldset border. Browser acceptance uses the compiled actual component and shared CSS with synthetic transport at1280/390px; it proves UI rendering only, not production access/data/business acceptance.
