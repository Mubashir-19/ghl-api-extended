import type { HighLevel } from '@gohighlevel/api-client';
import type { Filter, FilterGroup, SortField } from './types';
import { APPOINTMENTS_FIELDS, classifyGhlSearchError, validateFilterTree } from './filters';

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
