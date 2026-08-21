import { HighLevel as BaseHighLevel, type ValidConfig, type HighLevelConfig } from '@gohighlevel/api-client';
import { searchContacts, fetchContactsByDateRange, type ContactsSearchParams, type ContactsByDateRangeParams } from './contactsSearch';
import {
  searchOpportunities,
  fetchOpportunitiesByDateRange,
  type OpportunitiesSearchParams,
  type OpportunitiesByDateRangeParams,
} from './opportunitiesSearch';
import {
  searchAppointments,
  fetchAppointmentsByDateRange,
  type AppointmentsSearchParams,
  type AppointmentsByDateRangeParams,
} from './appointmentsSearch';

/**
 * Drop-in replacement for `@gohighlevel/api-client`'s `HighLevel` class —
 * same constructor, same official routes (`.contacts`, `.opportunities`,
 * `.calendars`, `.oauth`, ...), plus the internal search-v2 endpoints this
 * package adds (contacts/opportunities/appointments search + date-range
 * fetch helpers, filtered the way the GHL UI itself filters).
 *
 * Consumers only need `ghl-api-extended` installed — not
 * `@gohighlevel/api-client` separately — and migrating existing code that
 * already uses the official SDK is just a change of import path, since this
 * class extends it rather than reimplementing it.
 */
export class HighLevel extends BaseHighLevel {
  searchContacts(params: ContactsSearchParams) {
    return searchContacts(this, params);
  }

  fetchContactsByDateRange(params: ContactsByDateRangeParams) {
    return fetchContactsByDateRange(this, params);
  }

  searchOpportunities(params: OpportunitiesSearchParams) {
    return searchOpportunities(this, params);
  }

  fetchOpportunitiesByDateRange(params: OpportunitiesByDateRangeParams) {
    return fetchOpportunitiesByDateRange(this, params);
  }

  searchAppointments(params: AppointmentsSearchParams) {
    return searchAppointments(this, params);
  }

  fetchAppointmentsByDateRange(params: AppointmentsByDateRangeParams) {
    return fetchAppointmentsByDateRange(this, params);
  }
}

export type { ValidConfig, HighLevelConfig };
