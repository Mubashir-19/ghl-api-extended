# ghl-api-extended

A drop-in replacement for [`@gohighlevel/api-client`](https://www.npmjs.com/package/@gohighlevel/api-client)'s
`HighLevel` class — same constructor, every official route unchanged
(`.contacts`, `.opportunities`, `.calendars`, `.oauth`, ...) — plus the
internal search-v2 endpoints GHL's own UI uses for Contacts, Opportunities,
and Appointments/Calendar filtering, which aren't in the public SDK or docs
at all.

If you're already using `@gohighlevel/api-client`, switching is a one-line
import change — everything you call today keeps working, you just gain the
extra routes. You don't need `@gohighlevel/api-client` installed separately;
this package depends on it internally.

```diff
- import { HighLevel } from '@gohighlevel/api-client';
+ import { HighLevel } from 'ghl-api-extended';
```

These search-v2 endpoints aren't in GHL's public API docs, so
`docs/filters-reference.md` and the per-endpoint docs cover the field/operator
behavior directly. Check those before filtering on anything not already
covered by the `fetch*ByDateRange` helpers below.

## Install

```bash
npm install ghl-api-extended
```

## Usage

`HighLevel` works exactly like the official SDK class — construct it however
you already do (private integration token, agency/location access token, your
own `SessionStorage`) — with the new methods available directly on the instance:

```ts
import { HighLevel } from 'ghl-api-extended';

const ghl = new HighLevel({
  clientId: process.env.GHL_CLIENT_ID,
  clientSecret: process.env.GHL_CLIENT_SECRET,
  locationAccessToken, // however you already obtain it
});

// Official SDK routes, unchanged:
await ghl.contacts.getContact({ contactId });

// New: filter + auto-paginate the way the GHL UI's Contacts tab does.
const contacts = await ghl.fetchContactsByDateRange({
  locationId,
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  filters: [{ field: 'tags', operator: 'contains', value: ['confirmed'] }],
});

const opportunities = await ghl.fetchOpportunitiesByDateRange({
  locationId,
  dateField: 'last_stage_change_date', // default: date_added
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  filters: [{ field: 'pipeline_id', operator: 'eq', value: [pipelineId] }],
});

const appointments = await ghl.fetchAppointmentsByDateRange({
  locationId,
  startDate: '2026-01-01', // ranges over startTime by default
  endDate: '2026-01-31',
  filters: [{ field: 'appoinmentStatus', operator: 'eq', value: 'confirmed' }],
});
```

The `fetch*ByDateRange` methods auto-paginate to exhaustion, same as
scrolling a filtered list in the GHL UI — no separate page-loop needed. Each
accepts `maxResults`/`maxPages`/`pageLimit` if you want to bound that. For a
single page, or full control over sort/pagination/aggregations, use
`ghl.searchContacts(...)` / `ghl.searchOpportunities(...)` /
`ghl.searchAppointments(...)` directly.

The same methods are also exported as standalone functions
(`searchContacts(client, params)`, `fetchContactsByDateRange(client, params)`,
...) that take any `HighLevel`-compatible client as their first argument —
useful if you'd rather keep constructing the official SDK's class yourself
and only pull in this package's search functions.

## No existing auth? Use the built-in OAuth flow

If you don't already have a token source, this package ships a self-contained
one — a local JSON file token store, no external infra:

Copy `.env.example` to `.env`, fill in your GHL marketplace app's
`GHL_CLIENT_ID` / `GHL_CLIENT_SECRET` / `GHL_REDIRECT_URI`, then:

```bash
npm run authorize
```

This opens the GHL OAuth consent screen, catches the redirect on a local
server, and saves the company session to `.tokens.json` (gitignored). Location
tokens are minted and cached automatically as you use them.

```ts
import { findMostRecentCompanyId, getAuthorizedLocationClient } from 'ghl-api-extended';

const companyId = await findMostRecentCompanyId();
const ghl = await getAuthorizedLocationClient({ companyId, locationId }); // a HighLevel instance
```

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
