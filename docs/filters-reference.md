# `filters` reference across all three search endpoints

Consolidated from empirical probing (not GHL's public docs, which don't cover these internal
search-v2 endpoints) — see [contacts-search-documentation.md](contacts-search-documentation.md),
[appointments-search-documentation.md](appointments-search-documentation.md), and
[opportunities-search-documentation.md](opportunities-search-documentation.md) for the
per-endpoint request/response shape. This file is the field-by-field and operator-by-operator
map you'd need to build a typed filter-builder for a custom SDK wrapper.

Method: for each endpoint, sent every field from a real response object back in as a filter
(`{ field, operator: 'exists' }`, no `value`) and read the validation error. GHL's validator
distinguishes two failure modes, which is what makes this reliable:
- `"Invalid field <x>"` / `"Invalid field - <x>"` → the field name itself isn't recognized.
- `"Invalid Operator (<op>) passed for field <x>"` → the field **is** valid, just not with
  that operator (nested/array fields need a different operator — see "Unresolved" below).
- `"Invalid value for '<op>' operator for '<x>' field"` → field **and** operator are valid,
  the `value` shape sent was wrong.

## Operators (shared validation, confirmed identical error across all three endpoints)

```
eq, not_eq, contains, not_contains, wildcard, not_wildcard, match, not_match,
exists, not_exists, range, not_range, contains_set, contains_not_set,
gt, gte, lt, lte, nested, nested_not, has_child, has_parent
```

Confirmed behavior for a subset (see individual endpoint docs for more):
- `eq` / `not_eq` — exact match. Confirmed on scalar fields (`type`, `status`) and array
  fields (`tags`, `pipeline_id` with an array `value`).
- `contains` / `not_contains` — substring match. `contains` requires **min. 3 characters** in
  `value` (`400 Min. 3 characters required for applying contains filter`).
- `exists` / `not_exists` — presence check, no `value` needed.
- `range` / `not_range` — object `value` with `gte`/`gt`/`lte`/`lt` bounds (epoch-ms, or
  Elasticsearch-style date-math strings like `"now/d"` on the appointments endpoint — see
  its doc). `gt`/`gte`/`lt`/`lte` also appear standalone in the enum, suggesting they may work
  as bare scalar-comparison operators outside a `range` wrapper too — untested standalone.
- `contains_set` / `contains_not_set` — for array/set-valued fields (`tags`-like). Confirmed
  the operator is accepted for array fields (`additionalEmails`, `opportunities`, `customFields`
  on contacts; `custom_fields` on opportunities) but every attempt with no `value` failed as
  `"Invalid value for 'contains_set' operator for '<field>' field"` — so it needs some
  non-empty `value`, shape unconfirmed (likely an array of literal values or `{id,value}`
  pairs, given `customFields.<key>` is the path form used with `contains`/`eq` instead — see
  below). **Unresolved** — if you need to filter on these array fields, prototype the value
  shape against a live location before relying on it.
- `wildcard` / `not_wildcard`, `match` / `not_match`, `nested` / `nested_not`, `has_child`,
  `has_parent` — present in the enum, **never exercised**. `nested`/`has_child`/`has_parent`
  read like they're meant for the array/object fields that rejected `exists`/`contains_set`
  above (an ES nested-query family) — worth trying those next if `contains_set` doesn't pan
  out for a given field.

## Custom fields (contacts and opportunities): dot-path, not a bare field

`customFields`/`custom_fields` as a **bare** field name is invalid (`"Invalid field
customFields"` / operator-rejected on opportunities). The working form, confirmed on contacts
search, is a dot path with the custom field's **key** (not its id):

```json
{ "field": "customFields.<customFieldKey>", "operator": "contains", "value": "abc" }
```

Confirmed this passes field validation (error changes from "Invalid field" to a
content-specific one: `"Invalid Filter field type - custom_fields.someKey! Check if custom
field exists"` when the key doesn't correspond to a real custom field on the location) — so
look up real custom field keys via `locations.getCustomFields` (see
[list-custom-fields.ts](../../scripts/verify-diagnose/list-custom-fields.ts)) before filtering
on them. Not independently re-tested on the opportunities endpoint, but the same
`customFields`/`custom_fields`-is-invalid-bare pattern there strongly suggests the same
`custom_fields.<key>` dot-path applies (snake_case, matching that endpoint's field casing).

## Contacts (`/contacts/search/2`) — camelCase, dot-path for nested

| Field | Filterable | Notes |
|---|---|---|
| `id` | ✅ | |
| `locationId` | ✅ | |
| `email` | ✅ | |
| `firstName` | ✅ | |
| `lastName` | ✅ | |
| `firstNameLowerCase` | ✅ | |
| `lastNameLowerCase` | ✅ | |
| `phone` | ✅ | |
| `contactName` | ✅ | |
| `companyName` | ✅ | |
| `businessName` | ✅ | |
| `address` | ✅ | |
| `city` | ✅ | |
| `state` | ✅ | |
| `country` | ✅ | |
| `postalCode` | ✅ | |
| `timezone` | ✅ | |
| `source` | ✅ | |
| `type` | ✅ | |
| `tags` | ✅ | array field — `eq`/`contains` accept scalar or array `value` (see contacts doc). |
| `dnd` | ✅ | boolean. |
| `dateAdded` | ✅ | `range` confirmed (epoch-ms). |
| `dateUpdated` | ✅ | field exists and passes validation; not independently exercised with `range`. |
| `dateOfBirth` | ✅ | field exists and passes validation; operator not exercised beyond `exists`. |
| `validEmail` | ✅ | field exists and passes validation; likely boolean, not independently confirmed. |
| `assignedTo` | ✅ | |
| `followers` | ✅ | field passes validation with `exists`; array-shaped in the response so `eq`/`contains` behavior unconfirmed. |
| `customFields.<key>` | ✅ | dot-path only, see above. |
| `additionalEmails` | ⚠️ valid field, wrong operator | rejects `exists`/`contains_set` (no value) — array field, needs a value shape or a different operator (`nested`?). Internal name is `additional_emails` (snake_case) per the error message, even though the request field was sent as camelCase. |
| `additionalPhones` | ⚠️ same as above | internal name `additional_phones`. |
| `opportunities` | ⚠️ same as above | nested array of the contact's opportunities. |
| `customFields` (bare) | ⚠️ invalid bare, use dot-path | see above. |
| `dndSettings` | ⚠️ same pattern | rejects `exists`. |
| `attributionSource` | ❌ | `"Invalid field"` in both camelCase and snake_case. |
| `lastAttributionSource` | ❌ | same. |
| `businessId` | ❌ | same. |
| `phoneLabel` | ❌ | same. |
| `inboundDndSettings` | ❌ | same. |
| `searchAfter` | ❌ | expected — this is a pagination cursor field GHL echoes back, not a real indexed contact attribute. |

## Opportunities (`/opportunities/search`) — snake_case, does NOT match response casing

Response fields are camelCase (`pipelineId`) but filter fields are snake_case
(`pipeline_id`) — confirmed mismatch, see
[opportunities-search-documentation.md](opportunities-search-documentation.md). A naive
`camelCase → snake_case` conversion of the response field name is **not always right** —
three fields below have a real filter name that diverges from the mechanical conversion.

| Response field | Filter field | Filterable | Notes |
|---|---|---|---|
| `id` | `id` | ✅ | |
| `locationId` | `location_id` | ✅ | |
| `name` | `name` | ✅ | |
| `monetaryValue` | `monetary_value` | ✅ | also the `aggregations` sum field in the captured payload. |
| `pipelineId` | `pipeline_id` | ✅ | `eq` confirmed with an **array** `value`. |
| `pipelineStageId` | `pipeline_stage_id` | ✅ | also the aggregation `terms` field. |
| `pipelineStageUId` | — | ❌ | tried `pipeline_stage_u_id` and `pipeline_stage_uid`, both invalid. Not filterable under any guessed name. |
| `status` | `status` | ✅ | confirmed value `"open"`; `"won"`/`"lost"`/`"abandoned"` plausible but unconfirmed. |
| `source` | `source` | ✅ | |
| `assignedTo` | `assigned_to` | ✅ | |
| `contactId` | `contact_id` | ✅ | |
| `lostReasonId` | `lost_reason_id` | ✅ | |
| `followers` | `followers` | ✅ | array-shaped in response; only `exists` exercised. |
| `createdAt` | ~~`created_at`~~ → **`date_added`** | ✅ | mechanical conversion is wrong — real field matches the `sort` field name from the captured payload. |
| `updatedAt` | ~~`updated_at`~~ → **`date_updated`** | ✅ | same pattern. |
| `lastStageChangeAt` | ~~`last_stage_change_at`~~ → **`last_stage_change_date`** | ✅ | this is the field from the original captured payload — confirms the naming pattern is `..._date`, not `..._at`, for this trio. |
| `lastStatusChangeAt` | ~~`last_status_change_at`~~ → **`last_status_change_date`** | ✅ | inferred from the pattern above and confirmed directly. |
| `customFields` | `custom_fields.<key>` (inferred) | ⚠️ | bare `custom_fields` rejects `exists`/`contains_set`/`has_child`/`nested` (valid field, wrong operator/value each time) — same shape as contacts' `customFields`, so the dot-path form is a strong inference but **not independently confirmed** on this endpoint. |
| `attributions` | `attributions` | ⚠️ valid field, wrong operator | array field, same open question as contacts' array fields. |
| `contact` | — | ❌ | `"Invalid field - contact"` — this is a joined/embedded object in the response (only present because of `includeTopRelations`/default embedding), not a real indexed opportunity attribute. |
| `relations` | `relations` | ✅ | passes `exists`; content/shape for a real filter unconfirmed. |
| `sort` | — | n/a | this is the response's pagination cursor, not a filterable attribute (mirrors contacts' `searchAfter`). |

## Appointments (`/calendars/events/{locationId}/search/`) — camelCase, dot-path for nested

| Field | Filterable | Notes |
|---|---|---|
| `id` | ✅ | |
| `locationId` | ✅ | |
| `calendarId` | ✅ | |
| `calendarProviderId` | ✅ | |
| `contactId` | ✅ | |
| `assignedUserId` | ✅ | |
| `userCalendarId` | ✅ | |
| `groupId` | ✅ | |
| `categoryId` | ✅ | |
| `commonPrimaryId` | ✅ | |
| `formSubmissionId` | ✅ | |
| `title` | ✅ | |
| `address` | ✅ | |
| `source` | ✅ | |
| `channel` | ✅ | |
| `status` | ✅ | e.g. `"booked"`. |
| `appoinmentStatus` | ✅ | **misspelled in the API itself** (missing second `t`) — confirmed via the captured payload, e.g. `"confirmed"`. |
| `appointmentStatus` | ✅ | the correctly-spelled variant **also** passes field validation — untested whether it's an alias for the same underlying value or a distinct field. Given the response object only ever showed `appoinmentStatus` (typo'd) populated, treat `appointmentStatus` as unconfirmed/possibly dead until checked against real data. |
| `startTime` | ✅ | `range`, confirmed both epoch-ms and date-math bounds. |
| `endTime` | ✅ | field passes validation; operator not independently exercised. |
| `dateAdded` | ✅ | `range`, confirmed with date-math (`"now/d"`/`"now+1d/d"`). |
| `dateUpdated` | ✅ | field passes validation; operator not exercised. |
| `deleted` | ✅ | boolean. |
| `isCancelled` | ✅ | boolean. |
| `isFree` | ✅ | boolean. |
| `isFullDay` | ✅ | boolean. |
| `isRecurring` | ✅ | boolean. |
| `isRecurrenceEnded` | ✅ | boolean. |
| `local` | ✅ | boolean. |
| `selectedTimezone` | ✅ | |
| `version` | ✅ | |
| `assignedResources` | ✅ | array field; `exists` passed, `eq`/`contains` value shape unconfirmed. |
| `collectiveContacts` | ✅ | same. |
| `collectiveUsers` | ✅ | same. |
| `appointmentMeta.eventType` | ✅ | dot-path into nested metadata — confirmed directly (this is the field from the original captured payload, used with `not_exists`). |
| `google` | ⚠️ valid field, wrong operator | rejects both `exists` and `contains_set` — nested provider-sync object, likely needs `nested`/`has_child` or a dot-path into a specific sub-field (untested). |
| `integrationMeta` | ⚠️ same | |
| `locationConfigurationMeta` | ⚠️ same | |
| `createdBy` | ❌ | `"Invalid field"` in both casings. |
| `lastUpdatedBy` | ❌ | same. |
| `eventMetaType` | ❌ | same — note this is distinct from `appointmentMeta.eventType`, which **is** valid; the top-level `eventMetaType` is not. |
| `isOccupied` | ❌ | same. |
| `paymentMeta` | ❌ | same. |
| `permissionMeta` | ❌ | same. |
| `reportingSource` | ❌ | same. |

## Practical guidance for a wrapper

- **Don't derive filter-field names mechanically from response object keys.** Contacts and
  appointments happen to match (camelCase in, camelCase out), but opportunities doesn't
  (snake_case in, camelCase out) — and even within opportunities, 3 of the snake_case names
  diverge from the obvious mechanical conversion (`date_added` not `created_at`, etc). Hardcode
  a verified allowlist per endpoint (the tables above) rather than transforming field names
  generically.
- **Treat "field accepted but operator rejected" as a distinct, catchable error class** — the
  message shape (`"Invalid Operator (<op>) passed for field <x>"`) is different from an
  invalid-field error, so a wrapper can specifically say "this field needs a different
  operator" instead of just "unsupported field."
- Before shipping filtering on any of the ⚠️/unresolved fields above (array/nested fields
  needing `contains_set`/`nested`/`has_child`), re-run the discovery pattern in this doc
  against a live location with a few candidate `value` shapes — don't guess in production
  code.
