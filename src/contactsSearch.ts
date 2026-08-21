import type { HighLevel } from '@gohighlevel/api-client';
import type { Filter, FilterGroup, SortField } from './types';
import { CONTACTS_FIELDS, classifyGhlSearchError, validateFilterTree } from './filters';

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
