# Talent operations on desktop and phones

The talent page must expose the same authorized profile, review-session and succession workflows on desktop and phone widths. Do not hide entire workflows with desktopSensitive. Preserve exact operation permissions, including open mutable panels after permission replacement.

Review subjects and succession use ds-data-table with data-label cells, so the shared responsive card rules apply. Profiles and development plans use ds-scene-grid and shared record cards on both viewport sizes; ds-mobile-record-list alone hides these records on desktop.

Talent forms use preventDefault plus existing FormData handlers rather than React action forms: the existing operation wrapper catches failures, which would otherwise resolve the action and automatically reset uncontrolled inputs. Preserve the draft on rejection and retry the same subject/employee. Keep backend authorization, evidence payloads and transitions unchanged.

Validate actual components at desktop and390px, including cards, open decision forms, failed profile/decision drafts and read-only roles. Synthetic transport checks do not establish production business acceptance.
