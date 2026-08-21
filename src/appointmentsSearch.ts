import type { HighLevel } from '@gohighlevel/api-client';
import type { Filter, FilterGroup, SortField } from './types';
import { APPOINTMENTS_FIELDS, classifyGhlSearchError, validateFilterTree } from './filters';
import { dateRangeFilter } from './dateRange';
import { paginateAll, type PaginateOptions } from './pagination';

export interface AppointmentsSearchParams {
  locationId: string;
  filters?: Array<Filter | FilterGroup>;
  sort?: SortField[];
  limit?: number;
  page?: number;
  query?: string;
}

export interface AppointmentsSearchResponse {
  appointments: any[];
  count?: number;
  [key: string]: unknown;
}

/**
 * POST /calendars/events/{locationId}/search/ — lives on backend.leadconnectorhq.com
 * (not services.leadconnectorhq.com like the other two endpoints), and takes
 * locationId as a URL path segment rather than a body field. See
 * docs/appointments-search-documentation.md and docs/filters-reference.md.
 */
export async function searchAppointments(
  client: HighLevel,
  params: AppointmentsSearchParams
): Promise<AppointmentsSearchResponse> {
  const filters = params.filters ?? [];
  for (const node of filters) validateFilterTree(node, APPOINTMENTS_FIELDS, 'appointments');

  try {
    const response: any = await client.request({
      method: 'POST',
      baseURL: 'https://backend.leadconnectorhq.com',
      url: `/calendars/events/${params.locationId}/search/`,
      data: {
        filters,
        sort: params.sort ?? [],
        limit: params.limit ?? 20,
        page: params.page ?? 1,
        query: params.query ?? '',
      },
      headers: { Version: '2021-07-28' },
    });
    return response.data;
  } catch (err) {
    throw classifyGhlSearchError(err);
  }
}

export interface AppointmentsByDateRangeParams extends PaginateOptions {
  locationId: string;
  /** Which date field to range over. Defaults to `startTime` (the appointment's scheduled time). */
  dateField?: 'startTime' | 'endTime' | 'dateAdded' | 'dateUpdated';
  startDate?: string | number | Date;
  endDate?: string | number | Date;
  timeZone?: string;
  /** Extra conditions, ANDed with the date-range filter — same as adding more filter rows in the GHL UI. */
  filters?: Array<Filter | FilterGroup>;
  sort?: SortField[];
}

/**
 * Fetch every appointment matching a date range (+ optional extra filters),
 * auto-paginating to exhaustion — the same result set the Calendar/Appointments
 * view in the GHL UI would show for that date-range + filter combination.
 */
export async function fetchAppointmentsByDateRange(
  client: HighLevel,
  params: AppointmentsByDateRangeParams
): Promise<any[]> {
  const filters: Array<Filter | FilterGroup> = [];
  if (params.startDate !== undefined || params.endDate !== undefined) {
    filters.push(
      dateRangeFilter({
        field: params.dateField ?? 'startTime',
        startDate: params.startDate,
        endDate: params.endDate,
        timeZone: params.timeZone,
      })
    );
  }
  filters.push(...(params.filters ?? []));

  return paginateAll(
    async (page, pageLimit) => {
      const data = await searchAppointments(client, {
        locationId: params.locationId,
        filters,
        sort: params.sort,
        page,
        limit: pageLimit,
      });
      return { items: data.appointments ?? [], total: data.count };
    },
    { pageLimit: params.pageLimit, maxResults: params.maxResults, maxPages: params.maxPages }
  );
}
