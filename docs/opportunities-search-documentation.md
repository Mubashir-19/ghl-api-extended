# GHL `/opportunities/search` — request structure

Endpoint: `POST https://services.leadconnectorhq.com/opportunities/search`
Auth: **location** access token, header `Version: 2021-07-28`.
Script: [test-opportunities-search.ts](test-opportunities-search.ts) mints the token via
`ensureLocationAccessToken` + `getLocationHighLevelClient`, same as the other two scripts.

Same host as `/contacts/search/2` ([contacts-search-documentation.md](contacts-search-documentation.md)),
different host from the appointments endpoint
([appointments-search-documentation.md](appointments-search-documentation.md)). Confirmed
**responds `201 Created`** on success (not `200`) — don't assert on status code `200` if you
wire this up in real code.

## Fields are snake_case here — unlike contacts search

This is the opposite convention from `/contacts/search/2`, which requires camelCase
(`dateAdded`, not `date_added`). Confirmed by direct testing:

- `pipeline_id` (snake_case) → works.
- `pipelineId` (camelCase) → `422 Invalid field - pipelineId`.

Don't assume field-name casing carries over between GHL search endpoints — check each one
independently. `last_stage_change_date`, `pipeline_id`, `date_added`, and `status` are all
confirmed snake_case fields on this endpoint; `monetary_value` also appears snake_case in the
aggregation spec (see below), consistent with the rest of the endpoint.

## Top-level body

```jsonc
{
  "locationId": "9oIMDhYHEoDYgQDAByby",
  "filters": [ /* leaf/group filters, same shape as the other two endpoints */ ],
  "query": "",
  "sort": [ { "field": "date_added", "direction": "desc" } ],
  "limit": 1,
  "page": 1,           // untested standalone but present in the minimal-payload test
  "additionalDetails": {
    "notes": false,
    "tasks": false,
    "calendarEvents": false,
    "unReadConversations": false
  },
  "includeTopRelations": true,
  "aggregations": [ /* see "Aggregations appear to be ignored" below */ ]
}
```

- `locationId` is a **body field** here (like contacts search), not a URL path segment (like
  appointments search).
- `additionalDetails` toggles whether related sub-resources are embedded per opportunity
  (notes/tasks/calendar events/unread conversation counts) — untested with any set to `true`,
  so the actual embedded shape when enabled is unconfirmed.
- `includeTopRelations: true` → response includes a `topRelations` array. Confirmed present in
  the response (`[{ recordId, totalRelations, associations }]`) but every value was empty/zero
  in the test data — the actual shape when relations exist is unconfirmed.

## `filters`: same leaf/group shape as the other two endpoints

Leaf: `{ "field": "...", "operator": "...", "value": ... }`.
Group: `{ "group": "OR" | "AND", "filters": [ /* leaves or nested groups */ ] }`.

The captured example puts a group and a bare leaf filter side by side in the top-level array
— confirming (again, as with appointments search) that top-level array entries are implicitly
AND-ed together, and a plain leaf doesn't need a single-item group wrapper:

```json
{
  "filters": [
    { "group": "OR", "filters": [ { "group": "AND", "filters": [ /* last_stage_change_date range */ ] } ] },
    { "field": "pipeline_id", "operator": "eq", "value": ["iv0V9Sacl6njcBsOpZSg"] }
  ]
}
```

## Fields and operators confirmed

| Field | Operator | Notes |
|---|---|---|
| `last_stage_change_date` | `range` | epoch-ms `gte`/`lte`, plus `time_zone` (tested with the unresolved template string `"{{location.timezone}}"`, same as contacts search — worked without substitution). |
| `pipeline_id` | `eq` | `value` passed as an **array** of pipeline ids in the captured example (`["iv0V9Sacl6njcBsOpZSg"]`) — not retested with a bare string, so array form is the confirmed-safe shape. |
| `status` | `eq` | Confirmed with `value: "open"` (scalar string, not an array) → `200`/`201` with `total: 264`. Other likely values (unconfirmed): `"won"`, `"lost"`, `"abandoned"`. |

Not tested: `monetary_value` as a filter field (only seen as an aggregation `field`, see
below), `contact_id`/`assigned_to`/`source`/`lost_reason_id` filtering, or operators other than
`eq`/`range` on this endpoint. `/contacts/search/2`'s confirmed operator set (`contains`,
`not_contains`, `exists`, `not_exists`) is plausible here too given the shared filter-group
syntax, but wasn't independently verified against this endpoint.

## Aggregations appear to be accepted but ignored

The request body's `aggregations` array (Elasticsearch-style `terms`/`top_hits`/`sum`
sub-aggregations, keyed by `name`) does **not** show up anywhere in the response under those
names. Instead, the response always includes a fixed `stageAggregations` array — one entry per
pipeline stage, each with `totalCount`/`totalValue`/`weightedValue`/`openValue`/
`openWeightedValue`/`wonValue` — regardless of whether `aggregations` is present in the
request at all:

- Sent the full aggregation spec from the captured payload (terms on `pipeline_stage_id` with
  an `include` list of 4 stage ids, `size: 14`, nested `top_hits`/`sum` sub-aggs) → got back
  `stageAggregations` covering **all 20 stages** of the pipeline, not just the 4 included ids,
  and with none of the requested `name` keys (`pipelines`, `top_opportunities`, `revenues`)
  anywhere in the response.
- Sent a minimal request with **no** `aggregations` key at all → got back the identical
  `stageAggregations` shape, same 20 stages.

Conclusion: `stageAggregations` is computed automatically from the opportunity/pipeline
context (independent of the request's `filters`, seemingly scoped by the pipeline(s) touched by
the search) and the `aggregations` request field itself doesn't appear to do anything
observable — worth confirming with GHL support/docs before relying on it, but for now: **don't
bother sending `aggregations`** if `stageAggregations`-style pipeline summary data is all you
need; it comes back regardless.

## Response shape

```jsonc
{
  "opportunities": [ /* array of opportunity objects, see below */ ],
  "topRelations": [ { "recordId": "...", "totalRelations": 0, "associations": [] } ],
  "total": 52,
  "stageAggregations": [
    {
      "pipelineStageId": "179c93aa-5fa6-46fb-ab53-2debf81c607b",
      "totalCount": 0,
      "totalValue": 0,
      "weightedValue": 0,
      "openValue": 0,
      "openWeightedValue": 0,
      "wonValue": 0
    }
    // ... one entry per pipeline stage
  ],
  "traceId": "..."
}
```

Each opportunity object (response fields are **camelCase**, unlike the snake_case request
filter fields — the two are not symmetric):

```jsonc
{
  "id": "...",
  "name": "...",
  "monetaryValue": 4000,
  "pipelineId": "...",
  "pipelineStageId": "...",
  "pipelineStageUId": "...",
  "assignedTo": "...",
  "status": "open",
  "source": "...",
  "lastStatusChangeAt": "...",
  "lastStageChangeAt": "...",
  "createdAt": "...",
  "updatedAt": "...",
  "forecastProbability": 0,
  "effectiveProbability": 0,
  "contactId": "...",
  "locationId": "...",
  "customFields": [],
  "lostReasonId": null,
  "followers": [],
  "relations": [],
  "contact": { /* embedded contact summary */ },
  "sort": [ /* pagination sort-cursor values */ ],
  "attributions": [ /* lead-source attribution */ ]
}
```

`total` is the overall match count independent of `limit`/`page` (confirmed: `limit: 1`
still returned `total: 52` with 1 item in `opportunities`).
