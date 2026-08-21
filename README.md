# ghl-api-extended

Typed wrapper around GoHighLevel's internal search-v2 endpoints — the same
filtering the GHL UI itself uses for Contacts, Opportunities, and
Appointments/Calendar — plus a self-contained OAuth token store, so you're
not tied into any other project's auth.

These endpoints aren't in GHL's public API docs; the field/operator behavior
in `docs/filters-reference.md` and the per-endpoint docs was reverse-engineered
by probing a live account. See those files before filtering on anything not
already covered by `fetchContactsByDateRange` / `fetchOpportunitiesByDateRange`
/ `fetchAppointmentsByDateRange` below.

## Install

```bash
npm install ghl-api-extended
```

## Authorize

Copy `.env.example` to `.env` and fill in your GHL marketplace app's
`GHL_CLIENT_ID` / `GHL_CLIENT_SECRET` / `GHL_REDIRECT_URI`, then:

```bash
npm run authorize
```

This opens the GHL OAuth consent screen, catches the redirect on a local
server, and saves the company session to `.tokens.json` (gitignored). Location
tokens are minted and cached automatically as you use them — no separate step.

## Usage

```ts
import { findMostRecentCompanyId, getAuthorizedLocationClient, fetchContactsByDateRange } from 'ghl-api-extended';

const companyId = await findMostRecentCompanyId();
const client = await getAuthorizedLocationClient({ companyId, locationId });

const contacts = await fetchContactsByDateRange(client, {
  locationId,
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  filters: [{ field: 'tags', operator: 'contains', value: ['confirmed'] }],
});
```

The `fetch*ByDateRange` helpers auto-paginate to exhaustion, same as scrolling
a filtered list in the GHL UI — no separate page-loop needed. Each accepts
`maxResults`/`maxPages`/`pageLimit` if you want to bound that.

For opportunities and appointments:

```ts
import { fetchOpportunitiesByDateRange, fetchAppointmentsByDateRange } from 'ghl-api-extended';

const opportunities = await fetchOpportunitiesByDateRange(client, {
  locationId,
  dateField: 'last_stage_change_date', // default: date_added
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  filters: [{ field: 'pipeline_id', operator: 'eq', value: [pipelineId] }],
});

const appointments = await fetchAppointmentsByDateRange(client, {
  locationId,
  startDate: '2026-01-01', // ranges over startTime by default
  endDate: '2026-01-31',
  filters: [{ field: 'appoinmentStatus', operator: 'eq', value: 'confirmed' }],
});
```

For a single page, or full control over sort/pagination/aggregations, use the
lower-level `searchContacts` / `searchOpportunities` / `searchAppointments`
directly.

## Filters

`filters` is an array of leaf filters (`{ field, operator, value }`) or groups
(`{ group: 'AND' | 'OR', filters: [...] }`), nestable arbitrarily. Multiple
entries at the top level are implicitly ANDed together — see
`docs/filters-reference.md` for the full field/operator map per endpoint,
including the traps (opportunities filter fields are snake_case and don't all
mechanically match the response's camelCase names; contacts/appointments
custom fields need a `customFields.<key>` dot-path).

Invalid fields are rejected client-side before the network call
(`GhlFilterFieldError`); operator/value-shape errors from GHL itself are
classified into `GhlFilterOperatorError` / `GhlFilterValueError` so you can
branch on them instead of parsing message strings.

## License

Apache-2.0
