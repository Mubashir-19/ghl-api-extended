# GHL `/contacts/search/2` — request structure

Endpoint: `POST https://services.leadconnectorhq.com/contacts/search/2`
Auth: **location** access token (not agency/company token), header `Version: 2021-07-28`.
Script: [test-contacts-search-2.ts](test-contacts-search-2.ts) mints the token via
`ensureLocationAccessToken` + `getLocationHighLevelClient` the same way the rest of the
codebase does (see `src/app/utils/highLevelService.ts`).

This is GHL's internal "advanced contact search" endpoint (used by the app's Contacts UI —
not the same as the SDK's public `searchContactsAdvanced`, which posts to `/contacts/search`,
one path segment short of this one).

## Top-level body

```jsonc
{
  "filters": [ /* array of filter groups or leaf filters, see below */ ],
  "locationId": "9oIMDhYHEoDYgQDAByby",
  "page": 1,
  "pageLimit": 20,
  "sort": [],
  "includeTotal": true
}
```

- `locationId` — required, must match the location the access token was minted for.
- `page` / `pageLimit` — standard pagination. Not tested against the 1000-row-ish caps GHL
  applies elsewhere; page through it defensively (see the PostgREST-cap lesson in memory —
  don't assume a single page is everything).
- `includeTotal: true` — response includes a `total` count in addition to the page of
  `contacts`. Omitting it presumably skips the (likely more expensive) count query.
- `sort` — array of `{ "field": "<field>", "direction": "asc" | "desc" }`. Confirmed working
  with `{ "field": "dateAdded", "direction": "desc" }`. `[]` = no explicit sort.

## `filters`: leaf filters vs groups

A **leaf filter** is a single condition:

```json
{ "field": "email", "operator": "contains", "value": "test" }
```

A **group** wraps other filters (leaves or nested groups) and combines them with AND/OR:

```json
{ "group": "OR", "filters": [ /* leaves or groups */ ] }
```

Both shapes are valid directly inside the top-level `filters` array — confirmed a flat array
of bare leaf filters (no group wrapper at all) works fine, e.g.:

```json
{ "filters": [{ "field": "email", "operator": "contains", "value": "test" }], "locationId": "...", ... }
```

Groups nest arbitrarily. The pattern the GHL UI itself generates (and the payload you found
in devtools) is **top-level OR-of-ANDs**, i.e. "match any of these rule sets, where each rule
set is all of its conditions":

```json
{
  "filters": [
    {
      "group": "OR",
      "filters": [
        {
          "group": "AND",
          "filters": [
            { "field": "dateAdded", "operator": "range", "value": { "gte": 1785654000000, "lte": 1787209199999, "time_zone": "{{location.timezone}}" } },
            { "field": "email", "operator": "contains", "value": "test" }
          ]
        },
        {
          "group": "AND",
          "filters": [
            { "field": "tags", "operator": "contains", "value": ["confirmed", "hq confirm"] }
          ]
        }
      ]
    }
  ]
}
```

This reads as: *(dateAdded in range AND email contains "test") OR (tags contains "confirmed"
AND "hq confirm")*. An empty `filters` array on a group (`{ "group": "OR", "filters": [] }`,
the minimal payload) matches everything — no conditions to apply.

## Fields

- **Must be camelCase**, matching the `Contact` object's JSON keys — **not** snake_case.
  Confirmed: `"field": "date_added"` → `400 Invalid field date_added`. `"field": "dateAdded"`
  → works. The `date_added` / snake_case form you saw in devtools is likely just what GHL's
  frontend happens to send in some flows, but the API itself validates against camelCase
  contact field names and rejects the snake_case one directly.
- Standard contact fields confirmed working: `email`, `type`, `tags`, `dateAdded`.
- Custom fields: `"field": "customFields.<customFieldKey>"` is accepted by the validator
  (confirmed — it got past field validation and failed only on the operator's own min-length
  rule, not on the field name). Use the custom field's `key`, not its `id` — GHL's field
  validation on this endpoint doesn't recognize raw custom-field ids as top-level fields the
  way `/contacts/search` (v1) does with `customFields: [{ id, ... }]`.

## Operators

Confirmed by direct testing against a live location:

| Operator      | Works | Notes |
|---------------|-------|-------|
| `contains`    | ✅ | Requires **min. 3 characters** in `value` — `400 Min. 3 characters required for applying contains filter` on a 1-char value. |
| `not_contains`| ✅ | |
| `eq`          | ✅ | Exact match. Works for scalar fields (`type`) and confirmed for `tags` with a single string value. |
| `exists`      | ✅ | No `value` needed — just field/operator. |
| `not_exists`  | ✅ | Same. |
| `range`       | ✅ | Used for numeric/date fields. `value` is an object: `{ "gte": <epoch ms>, "lte": <epoch ms>, "time_zone": "<IANA tz or the literal template string \"{{location.timezone}}\">" }`. Also accepted an optional `uiMeta` sibling key (`{ "operator": "eq", "dateMeta": { "dateOperator": "between" } }`) — this appears to be UI bookkeeping the frontend round-trips, not something the API itself requires; untested whether omitting it changes results. |

`tags` and other array-valued fields accept either a single string (`"value": "confirmed"`)
or an array of strings (`"value": ["confirmed", "hq confirm"]`) with `contains`/`eq`.

Not tested here: `gt`/`lt`/`gte`/`lte` as standalone operators (only seen bundled inside a
`range` value object), `not_eq`, array operators like `not_in`, or filtering on nested
opportunity/appointment sub-fields. Treat anything not in the table above as unconfirmed —
verify empirically before relying on it in production code.

## Timestamps

`dateAdded` range values are **epoch milliseconds** (not seconds, not ISO strings) —
`1785654000000` / `1787209199999` in the working example. `time_zone` was passed as the
literal unresolved template string `"{{location.timezone}}"` in the captured devtools
payload — this is presumably substituted by the GHL frontend before sending in the real app,
but the API accepted it verbatim (unsubstituted) in testing too, so it may just be ignored by
the endpoint for millisecond-range values with both bounds present.

## Response shape

```jsonc
{
  "contacts": [ /* array of full Contact objects, same shape as v1 /contacts/search */ ],
  "total": 576,
  "traceId": "..."
}
```
