import type { HighLevel } from '@gohighlevel/api-client';
import type { Filter, FilterGroup, SortField } from './types';
import { OPPORTUNITIES_FIELDS, classifyGhlSearchError, validateFilterTree } from './filters';
import { dateRangeFilter } from './dateRange';
import { paginateAll, type PaginateOptions } from './pagination';

export interface OpportunityAggregation {
  name: string;
  type: string;
  field?: string;
  size?: number;
  options?: Record<string, unknown>;
  aggregations?: OpportunityAggregation[];
}

export interface OpportunitiesSearchParams {
  locationId: string;
  filters?: Array<Filter | FilterGroup>;
  sort?: SortField[];
  limit?: number;
  page?: number;
  query?: string;
  includeTopRelations?: boolean;
  additionalDetails?: {
    notes?: boolean;
    tasks?: boolean;
    calendarEvents?: boolean;
    unReadConversations?: boolean;
  };
  aggregations?: OpportunityAggregation[];
}

export interface OpportunitiesSearchResponse {
  opportunities: any[];
  total?: number;
  topRelations?: Array<{ recordId: string; totalRelations: number; associations: unknown[] }>;
  stageAggregations?: unknown[];
  [key: string]: unknown;
}

/**
 * POST /opportunities/search — internal search-v2 endpoint (Version 2021-07-28).
 * Filter field names are snake_case and do NOT always match the response's
 * camelCase field names 1:1 — see docs/filters-reference.md before hand-writing
 * a filter (createdAt -> date_added, not created_at, is the sharpest trap).
 */
export async function searchOpportunities(
  client: HighLevel,
  params: OpportunitiesSearchParams
): Promise<OpportunitiesSearchResponse> {
  const filters = params.filters ?? [];
  for (const node of filters) validateFilterTree(node, OPPORTUNITIES_FIELDS, 'opportunities');

  try {
    const response: any = await client.request({
      method: 'POST',
      url: '/opportunities/search',
      data: {
        locationId: params.locationId,
        filters,
        sort: params.sort ?? [],
        query: params.query ?? '',
        limit: params.limit ?? 20,
        page: params.page,
        includeTopRelations: params.includeTopRelations,
        additionalDetails: params.additionalDetails,
        aggregations: params.aggregations,
      },
      headers: { Version: '2021-07-28' },
    });
    return response.data;
  } catch (err) {
    throw classifyGhlSearchError(err);
  }
}

export interface OpportunitiesByDateRangeParams extends PaginateOptions {
  locationId: string;
  /** Which date field to range over. Defaults to `date_added` (when the opportunity was created). */
  dateField?: 'date_added' | 'date_updated' | 'last_stage_change_date' | 'last_status_change_date';
  startDate?: string | number | Date;
  endDate?: string | number | Date;
  timeZone?: string;
  /** Extra conditions, ANDed with the date-range filter — same as adding more filter rows in the GHL UI. */
  filters?: Array<Filter | FilterGroup>;
  sort?: SortField[];
}

/**
 * Fetch every opportunity matching a date range (+ optional extra filters),
 * auto-paginating to exhaustion — the same result set the Opportunities/
 * Pipeline view in the GHL UI would show for that date-range + filter combination.
 */
export async function fetchOpportunitiesByDateRange(
  client: HighLevel,
  params: OpportunitiesByDateRangeParams
): Promise<any[]> {
  const filters: Array<Filter | FilterGroup> = [];
  if (params.startDate !== undefined || params.endDate !== undefined) {
    filters.push(
      dateRangeFilter({
        field: params.dateField ?? 'date_added',
        startDate: params.startDate,
        endDate: params.endDate,
        timeZone: params.timeZone,
      })
    );
  }
  filters.push(...(params.filters ?? []));

  return paginateAll(
    async (page, pageLimit) => {
      const data = await searchOpportunities(client, {
        locationId: params.locationId,
        filters,
        sort: params.sort,
        page,
        limit: pageLimit,
      });
      return { items: data.opportunities ?? [], total: data.total };
    },
    { pageLimit: params.pageLimit, maxResults: params.maxResults, maxPages: params.maxPages }
  );
}
