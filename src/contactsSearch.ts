import type { HighLevel } from '@gohighlevel/api-client';
import type { Filter, FilterGroup, SortField } from './types';
import { CONTACTS_FIELDS, classifyGhlSearchError, validateFilterTree } from './filters';
import { dateRangeFilter } from './dateRange';
import { paginateAll, type PaginateOptions } from './pagination';

export interface ContactsSearchParams {
  locationId: string;
  filters?: Array<Filter | FilterGroup>;
  sort?: SortField[];
  page?: number;
  pageLimit?: number;
  query?: string;
  includeTotal?: boolean;
}

export interface ContactsSearchResponse {
  contacts: any[];
  total?: number;
  [key: string]: unknown;
}

/**
 * POST /contacts/search/2 — internal search-v2 endpoint (Version 2021-07-28).
 * Field names are camelCase; see docs/contacts-search-documentation.md and
 * docs/filters-reference.md for the confirmed filterable fields/operators.
 */
export async function searchContacts(
  client: HighLevel,
  params: ContactsSearchParams
): Promise<ContactsSearchResponse> {
  const filters = params.filters ?? [{ group: 'OR', filters: [] }];
  for (const node of filters) validateFilterTree(node, CONTACTS_FIELDS, 'contacts');

  try {
    const response: any = await client.request({
      method: 'POST',
      url: '/contacts/search/2',
      data: {
        locationId: params.locationId,
        filters,
        sort: params.sort ?? [],
        page: params.page ?? 1,
        pageLimit: params.pageLimit ?? 20,
        query: params.query,
        includeTotal: params.includeTotal ?? true,
      },
      headers: { Version: '2021-07-28' },
    });
    return response.data;
  } catch (err) {
    throw classifyGhlSearchError(err);
  }
}

export interface ContactsByDateRangeParams extends PaginateOptions {
  locationId: string;
  /** Which date field to range over. Defaults to `dateAdded` (when the contact was created). */
  dateField?: 'dateAdded' | 'dateUpdated' | 'dateOfBirth';
  startDate?: string | number | Date;
  endDate?: string | number | Date;
  timeZone?: string;
  /** Extra conditions, ANDed with the date-range filter — same as adding more filter rows in the GHL UI. */
  filters?: Array<Filter | FilterGroup>;
  sort?: SortField[];
}

/**
 * Fetch every contact matching a date range (+ optional extra filters),
 * auto-paginating to exhaustion — the same result set the Contacts tab in
 * the GHL UI would show for that date-range + filter combination.
 */
export async function fetchContactsByDateRange(
  client: HighLevel,
  params: ContactsByDateRangeParams
): Promise<any[]> {
  const filters: Array<Filter | FilterGroup> = [];
  if (params.startDate !== undefined || params.endDate !== undefined) {
    filters.push(
      dateRangeFilter({
        field: params.dateField ?? 'dateAdded',
        startDate: params.startDate,
        endDate: params.endDate,
        timeZone: params.timeZone,
      })
    );
  }
  filters.push(...(params.filters ?? []));

  return paginateAll(
    async (page, pageLimit) => {
      const data = await searchContacts(client, {
        locationId: params.locationId,
        filters,
        sort: params.sort,
        page,
        pageLimit,
        includeTotal: true,
      });
      return { items: data.contacts ?? [], total: data.total };
    },
    { pageLimit: params.pageLimit, maxResults: params.maxResults, maxPages: params.maxPages }
  );
}
