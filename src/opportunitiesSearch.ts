import type { HighLevel } from '@gohighlevel/api-client';
import type { Filter, FilterGroup, SortField } from './types';
import { OPPORTUNITIES_FIELDS, classifyGhlSearchError, validateFilterTree } from './filters';

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
  meta?: { total?: number; [key: string]: unknown };
  aggregations?: Record<string, unknown>;
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
