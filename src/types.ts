export type FilterOperator =
  | 'eq'
  | 'not_eq'
  | 'contains'
  | 'not_contains'
  | 'wildcard'
  | 'not_wildcard'
  | 'match'
  | 'not_match'
  | 'exists'
  | 'not_exists'
  | 'range'
  | 'not_range'
  | 'contains_set'
  | 'contains_not_set'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'nested'
  | 'nested_not'
  | 'has_child'
  | 'has_parent';

export interface RangeValue {
  gt?: number | string;
  gte?: number | string;
  lt?: number | string;
  lte?: number | string;
  time_zone?: string;
}

export interface Filter {
  field: string;
  operator: FilterOperator;
  value?: unknown;
  uiMeta?: Record<string, unknown>;
}

export interface FilterGroup {
  group: 'AND' | 'OR';
  filters: Array<Filter | FilterGroup>;
}

export function isFilterGroup(node: Filter | FilterGroup): node is FilterGroup {
  return (node as FilterGroup).group !== undefined && Array.isArray((node as FilterGroup).filters);
}

export interface SortField {
  field: string;
  direction: 'asc' | 'desc';
}
