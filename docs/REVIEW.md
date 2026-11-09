# Independent review — Budget Go

## Verdict and scope

**No known open material integrity finding in the independently exercised full-app paths.** The user approved expansion after the representative preview. Reviewer inspected actual core/hooks/dialog/dashboard code and executed the tests below against the expanded app. This is bounded evidence, not a security/accessibility certification or an exhaustive test claim.

Reviewer changed only this report and `tests/reviewer-acceptance.mjs`; no core application edits. Lead/Builder own production checks and implementation; Designer independently owns expanded visual review.

## Expanded application — executed evidence

Environment: existing app `http://127.0.0.1:3000`, approved external Chrome CDP `http://127.0.0.1:9222`, Chrome 156. Each scenario creates an isolated browser context and closes only that context, never the shared browser. Storage faults are injected before app code; raw persisted bytes are inspected using original storage methods.

`node tests/reviewer-acceptance.mjs --core` **passed**:
- 29 invalid backup cases: strict keys/version/currency/revision, duplicate transaction/budget/cross-entity IDs and month/category tuples, calendar/type/category/poisha, description/count/byte caps and unsafe transaction/budget aggregates.
- Six exact budget boundaries, including near MAX_SAFE_INTEGER; valid JSON roundtrip.
- Stale/invalid saves rejected before writes; quota error propagates; valid save writes once.

`node tests/reviewer-acceptance.mjs` **13/13 scenarios passed**, no unhandled browser exceptions. Machine-readable results: `artifacts/review/review-results.json`.

Reviewer initially executed these checks against the development app. Lead subsequently reported a successful final `npm run build` and `npm start` on the same port, then reran this reviewer's core suite (29 invalid cases/six boundaries) and all 13 browser scenarios against production: **all passed, no page errors** (Lead-collected job `pwsh-691bc621945b44c1`, exit 0). This production rerun is Lead-reported evidence, not an additional run independently executed by Reviewer. Lead also reported Designer's final production review passed.

1. Empty start does not seed storage. Add exactly 0.29 BDT, reload, verify 29 poisha/edit prefill, move transaction across month, restore header focus, cancel/confirm deletion.
2. Injected quota failure preserves transaction draft and old raw storage; retry in the same dialog succeeds after fault removal.
3. Read actual downloaded backup JSON; 27 invalid file fixtures leave current raw unchanged and do not open replacement confirmation; valid import Cancel preserves data; confirmed replacement replaces all data and uses current revision+1, not imported revision.
4. Import quota failure leaves old raw intact; confirmation stays open; same-dialog retry succeeds.
5. Sample transaction edits leave saved raw unchanged; import/export controls are absent in sample mode; exit removes sample changes.
6. Monthly budgets reject duplicate category/month, edit from near-limit to limit-reached/over-budget, clamp progress to 100%, remove only budget without transactions, and create a separate month-specific limit.
7. Corrupt raw remains untouched; actual recovery download matches original bytes; Cancel preserves it; explicit reset writes empty validated finances.
8. Blocked storage read disables mutation without overwriting prior raw; removing the fault and Retry loading recovers.
9. External valid→corrupt storage event, reload and confirmed reset recover successfully.
10. Maximum revision blocks ordinary save without losing draft/raw; explicit backup replacement recovers revision sequence to 1.
11. Near-2-MiB stored dataset exports an actual file within the import byte cap and successfully reimports it.
12. At 360px in America/Los_Angeles timezone: type/category filter reset, first-invalid focus/error association, invalid exponent amount rejection, 18 Tabs trapped in dialog, exact leap-date 2024-02-29 save/prefill, Escape focus restoration, month/year navigation and no horizontal overflow.
13. External raw mutation without a storage event is caught on read-before-write; old external data survives, draft survives, mutation disables and explicit reload recovers.

An initial storage-alert test matched Next's route announcer as well as the app alert; corrected the test selector, not application code. An initial MAX_SAFE threshold expectation was corrected because 7,205,759,403,792,792 / 9,007,199,254,740,991 is below 80%. These were test issues, not product findings.

## Findings and corrections

During representative preview review, independently reproduced and subsequently rechecked Builder corrections for exact MAX_SAFE amount display/prefill, same-dialog failed-save retry, focus restoration when the invoker unmounts, and undersized touch targets. No such material preview finding remains open.

During full-app review, Lead independently identified revision-limit recovery, stale corrupt reload recovery, export byte-cap roundtrip, and duplicate-budget category error association. Reviewer independently verified the first three corrections through scenarios 9–11; attribution remains Lead's. Designer's expanded visual findings/evidence are separate.

Storage read-compare-set is **best-effort stale detection, not atomic cross-tab compare-and-swap locking**. True simultaneous writers in separate tabs can still race. The tests establish explicit event and pre-save mismatch handling, not serializable concurrent transactions.

## Earlier representative preview evidence

Independent browser checks passed: empty/add and out-of-month edit focus fallback; failed-save preserved draft/retry; Edit Escape focus; first-error focus and 18 Tabs trapped; exact maximum-safe `.91` formatting/prefill including negative derived balance; no overflow at 360/720/768/1440; corrected ≥44×44 visible targets; no localStorage writes in preview; reduced-motion none/0s; actual CDP reduced-transparency media produced opaque header/no backdrop blur.

Computed visible-text foreground/background alpha-composite audit found no tested pairing below 4.5:1: muted on white 5.98:1, near-limit 6.11:1, over-budget 5.76:1, primary white text 7.25:1. Not a complete pixel/control/all-state audit. Independent `node tests/preview-unit.mjs`: three tests passed at preview closure.

## Explicit limitations

- True browser **200% zoom remains unverified**. In a viewport:null HeadlessChrome 156 context, Ctrl+0, five Ctrl++, then five Ctrl+= left inner 764×485, outer 780×580, devicePixelRatio 1 and visualViewport.scale 1 unchanged. No emulated scaling or narrow viewport is reported as actual browser zoom.
- Screen reader output and full all-state control/pixel contrast were not tested. Keyboard and semantic checks do not imply complete accessibility conformance.
- No real disk-full browser profile was created: quota/read failures are controlled Storage-method injections.
- Production acceptance is covered by the Lead-reported rerun above. Reviewer did not independently execute the production build, lint or typecheck; Lead/Builder report those checks separately.
- No cloud/auth/integration behavior is expected or tested; finances are browser-only and backups contain private financial data.
