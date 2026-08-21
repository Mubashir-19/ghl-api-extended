import type { Filter } from './types';

export interface DateRangeOptions {
  field: string;
  startDate?: string | number | Date;
  endDate?: string | number | Date;
  /** e.g. "-07:00", or a location's `{{location.timezone}}` placeholder. */
  timeZone?: string;
}

function toEpochMs(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: ${value}`);
  return parsed.getTime();
}

/** Build a `range` filter over a date field, same shape the GHL UI's date-range picker sends. */
export function dateRangeFilter(opts: DateRangeOptions): Filter {
  if (opts.startDate === undefined && opts.endDate === undefined) {
    throw new Error('dateRangeFilter requires at least one of startDate/endDate');
  }

  const value: Record<string, unknown> = {};
  if (opts.startDate !== undefined) value.gte = toEpochMs(opts.startDate);
  if (opts.endDate !== undefined) value.lte = toEpochMs(opts.endDate);
  if (opts.timeZone) value.time_zone = opts.timeZone;

  return { field: opts.field, operator: 'range', value };
}
