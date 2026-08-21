# GHL `/calendars/events/{locationId}/search/` — request structure

Endpoint: `POST https://backend.leadconnectorhq.com/calendars/events/{locationId}/search/`
Auth: **location** access token, header `Version: 2021-07-28`.
Script: [test-appointments-search.ts](test-appointments-search.ts) mints the token via
`ensureLocationAccessToken` + `getLocationHighLevelClient`, same as the contacts script.

This is GHL's internal calendar/appointments search endpoint (used by the app's
Calendar/Appointments UI). Two things make it different from `/contacts/search/2`
([contacts-search-documentation.md](contacts-search-documentation.md)):

- **Different host**: `backend.leadconnectorhq.com`, not `services.leadconnectorhq.com`
  (the SDK's default `baseURL`). The script overrides `baseURL` per-request on the same
  `HighLevel` client instance — its auth interceptor still attaches the location bearer
  token regardless of host, so no separate client/auth setup is needed.
- **`locationId` is a URL path segment**, not a body field (`.../events/9oIMDhYHEoDYgQDAByby/search/`),
  and there is a trailing slash after `search`.

## Top-level body

```jsonc
{
  "filters": [ /* array of filter groups or leaf filters — same shape as contacts search */ ],
  "sort": [ { "field": "startTime", "direction": "asc" } ],
  "limit": 10,
  "page": 1,
  "query": ""
}
```

- No `locationId` or `includeTotal` field here (unlike contacts search) — `locationId` is in
  the URL, and the response always includes a count (see Response shape below).
- `limit` is the page-size field (contacts search uses `pageLimit` for the same purpose —
  don't mix the two up across endpoints).
- `query` — free-text search box value; empty string when unused. Untested with a non-empty
  value.
- `sort` — confirmed working with `{ "field": "startTime", "direction": "asc" }`.

## `filters`: same leaf/group shape as contacts search

Leaf: `{ "field": "...", "operator": "...", "value": ... }`.
Group: `{ "group": "OR" | "AND", "filters": [ /* leaves or nested groups */ ] }`.

The captured example nests two independent structures under the top-level `filters` array —
confirming groups can sit side by side at the top level, not just nested inside one another:

```json
{
  "filters": [
    {
      "group": "OR",
      "filters": [
        { "group": "AND", "filters": [ /* startTime range + status */ ] },
        { "group": "AND", "filters": [ /* dateAdded range ("today") */ ] }
      ]
    },
    {
      "group": "AND",
      "filters": [
        { "field": "appointmentMeta.eventType", "operator": "not_exists" }
      ]
    }
  ]
}
```

This reads as: *((startTime in range AND status = confirmed) OR (dateAdded is today))
AND (appointmentMeta.eventType does not exist)* — the two top-level array entries are
implicitly AND-ed together.

## Fields seen

- `startTime` — appointment start, `range` operator, epoch-ms bounds (`gt`/`gte`/`lt`/`lte`).
- `appoinmentStatus` — **note the typo is in the API itself** (`appoinment`, missing the
  second `t`), not a mistake in the captured payload. This is GHL's actual field name for
  this endpoint. Confirmed value used: `"confirmed"`. Other likely values (unconfirmed):
  `"booked"`/`"cancelled"`/`"showed"`/`"noshow"` — the response's own `status` field (see
  below) also carries `"booked"` alongside `appoinmentStatus: "confirmed"`, so the two are
  related-but-distinct — don't assume they're the same enum.
- `dateAdded` — when the appointment record was created (as opposed to `startTime`, when the
  appointment is scheduled for). Supports `range` with the same epoch-ms style seen in
  contacts search, **and** the relative date-math strings shown below.
- `appointmentMeta.eventType` — dotted path into nested appointment metadata, used here with
  `not_exists`. Confirms nested-field dot-path filtering works on this endpoint, same as
  `customFields.<key>` on contacts search.

Not tested: filtering by `calendarId`, `assignedUserId`, `contactId`, or other fields visible
in the response payload (see Response shape) — only the four fields above were exercised via
the captured example, so treat anything else as unconfirmed until checked directly.

## `range` operator: two different value styles

Unlike contacts search (which only used epoch-ms `gte`/`lte`), this payload demonstrates
**relative date-math strings** as an alternative to absolute epoch-ms values within the same
`range` operator:

```jsonc
// absolute epoch-ms (single-sided, gt only)
{ "gt": 1787122799999, "time_zone": "-07:00" }

// relative date math ("today" in the given time zone)
{ "gte": "now/d", "lt": "now+1d/d", "time_zone": "-07:00" }
```

`"now/d"` rounds down to the start of the current day; `"now+1d/d"` is the start of the next
day — together forming a `[startOfToday, startOfTomorrow)` window. This is Elasticsearch-style
date-math syntax, consistent with GHL's search backends generally being ES-backed. Not
exercised here: other date-math offsets (`now-7d/d`, `now/w`, etc.) — treat as plausible but
unconfirmed.

`time_zone` in this payload is a **fixed UTC offset string** (`"-07:00"`), unlike the contacts
search example which used the unresolved template literal `"{{location.timezone}}"`. Both
forms were captured verbatim from devtools, not independently re-tested here — worth
confirming which forms the API actually requires/accepts vs. which are just what each specific
frontend view happened to send.

`uiMeta` (e.g. `{ "operator": "eq", "dateMeta": { "dateOperator": "afterDate" } }`) is present
on both `range` filters in the captured payload — same as contacts search, this looks like
frontend-only bookkeeping for reconstructing the filter-builder UI, not something the backend
requires. Untested whether omitting it changes results.

## Response shape

```jsonc
{
  "count": 20,
  "appointments": [ /* array of full appointment/event objects */ ],
  "errors": [],
  "traceId": "..."
}
```

`count` is the total match count (independent of `limit`/`page` — confirmed: requesting
`limit: 10` still returned `count: 20` with 10 items in `appointments`). Each appointment
object includes calendar/contact linkage (`calendarId`, `contactId`, `assignedUserId`), status
fields (`status`, `appoinmentStatus`, `isCancelled`), and — when the event originated from a
connected calendar — a nested provider payload (e.g. `google.data` with attendees, description,
start/end times per the provider's own timezone).
