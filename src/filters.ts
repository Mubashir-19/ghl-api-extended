import { type Filter, type FilterGroup, isFilterGroup } from './types';

/**
 * Field status, per the empirical mapping in docs/filters-reference.md:
 * - 'ok'                 — confirmed filterable with at least one operator.
 * - 'operator-restricted' — valid field, but the obvious operator (exists/contains_set)
 *                           was rejected; array/nested field, needs `nested`/`has_child`
 *                           or an unconfirmed value shape. Allowed through, but flagged.
 * - 'invalid'            — GHL returns "Invalid field" for this name in both casings.
 */
type FieldStatus = 'ok' | 'operator-restricted' | 'invalid';

type FieldTable = Record<string, FieldStatus>;

export const CONTACTS_FIELDS: FieldTable = {
  id: 'ok',
  locationId: 'ok',
  email: 'ok',
  firstName: 'ok',
  lastName: 'ok',
  firstNameLowerCase: 'ok',
  lastNameLowerCase: 'ok',
  phone: 'ok',
  contactName: 'ok',
  companyName: 'ok',
  businessName: 'ok',
  address: 'ok',
  city: 'ok',
  state: 'ok',
  country: 'ok',
  postalCode: 'ok',
  timezone: 'ok',
  source: 'ok',
  type: 'ok',
  tags: 'ok',
  dnd: 'ok',
  dateAdded: 'ok',
  dateUpdated: 'ok',
  dateOfBirth: 'ok',
  validEmail: 'ok',
  assignedTo: 'ok',
  followers: 'ok',
  additionalEmails: 'operator-restricted',
  additionalPhones: 'operator-restricted',
  opportunities: 'operator-restricted',
  dndSettings: 'operator-restricted',
  attributionSource: 'invalid',
  lastAttributionSource: 'invalid',
  businessId: 'invalid',
  phoneLabel: 'invalid',
  inboundDndSettings: 'invalid',
  searchAfter: 'invalid',
};

export const OPPORTUNITIES_FIELDS: FieldTable = {
  id: 'ok',
  location_id: 'ok',
  name: 'ok',
  monetary_value: 'ok',
  pipeline_id: 'ok',
  pipeline_stage_id: 'ok',
  status: 'ok',
  source: 'ok',
  assigned_to: 'ok',
  contact_id: 'ok',
  lost_reason_id: 'ok',
  followers: 'ok',
  date_added: 'ok',
  date_updated: 'ok',
  last_stage_change_date: 'ok',
  last_status_change_date: 'ok',
  relations: 'ok',
  custom_fields: 'operator-restricted',
  attributions: 'operator-restricted',
  pipeline_stage_u_id: 'invalid',
  contact: 'invalid',
};

export const APPOINTMENTS_FIELDS: FieldTable = {
  id: 'ok',
  locationId: 'ok',
  calendarId: 'ok',
  calendarProviderId: 'ok',
  contactId: 'ok',
  assignedUserId: 'ok',
  userCalendarId: 'ok',
  groupId: 'ok',
  categoryId: 'ok',
  commonPrimaryId: 'ok',
  formSubmissionId: 'ok',
  title: 'ok',
  address: 'ok',
  source: 'ok',
  channel: 'ok',
  status: 'ok',
  appoinmentStatus: 'ok', // sic — misspelled in the GHL API itself, this is the populated field
  appointmentStatus: 'ok', // correctly-spelled variant also passes validation; unconfirmed if it's live
  startTime: 'ok',
  endTime: 'ok',
  dateAdded: 'ok',
  dateUpdated: 'ok',
  deleted: 'ok',
  isCancelled: 'ok',
  isFree: 'ok',
  isFullDay: 'ok',
  isRecurring: 'ok',
  isRecurrenceEnded: 'ok',
  local: 'ok',
  selectedTimezone: 'ok',
  version: 'ok',
  assignedResources: 'operator-restricted',
  collectiveContacts: 'operator-restricted',
  collectiveUsers: 'operator-restricted',
  'appointmentMeta.eventType': 'ok',
  google: 'operator-restricted',
  integrationMeta: 'operator-restricted',
  locationConfigurationMeta: 'operator-restricted',
  createdBy: 'invalid',
  lastUpdatedBy: 'invalid',
  eventMetaType: 'invalid',
  isOccupied: 'invalid',
  paymentMeta: 'invalid',
  permissionMeta: 'invalid',
  reportingSource: 'invalid',
};

/** Build a `customFields.<key>` filter for the contacts endpoint (camelCase dot-path). */
export function contactCustomField(key: string, operator: Filter['operator'], value?: unknown): Filter {
  return { field: `customFields.${key}`, operator, value };
}

/** Build a `custom_fields.<key>` filter for the opportunities endpoint (snake_case dot-path). */
export function opportunityCustomField(key: string, operator: Filter['operator'], value?: unknown): Filter {
  return { field: `custom_fields.${key}`, operator, value };
}

function statusFor(table: FieldTable, field: string): FieldStatus | undefined {
  if (field in table) return table[field];
  // Dot-path fields (customFields.<key>, custom_fields.<key>, appointmentMeta.<key>)
  // aren't in the static table since the suffix is location-specific.
  if (field.includes('.')) return 'ok';
  return undefined;
}

/**
 * Walk a filter tree and reject fields confirmed invalid for this endpoint
 * before making a network call. Fields with unknown or 'operator-restricted'
 * status are passed through (they may still work with the right operator/value
 * shape) but 'operator-restricted' ones are logged so callers notice they're
 * on unconfirmed ground.
 */
export function validateFilterTree(node: Filter | FilterGroup, table: FieldTable, endpointName: string): void {
  if (isFilterGroup(node)) {
    for (const child of node.filters) validateFilterTree(child, table, endpointName);
    return;
  }

  const status = statusFor(table, node.field);
  if (status === 'invalid') {
    throw new GhlFilterFieldError(`Field "${node.field}" is not filterable on the ${endpointName} endpoint.`);
  }
  if (status === 'operator-restricted') {
    console.warn(
      `[ghl-api-extended] Field "${node.field}" on ${endpointName} rejected common operators (exists/contains_set) ` +
        `during discovery — verify the operator/value shape against a live location before relying on it.`
    );
  }
}

export class GhlFilterFieldError extends Error {}
export class GhlFilterOperatorError extends Error {}
export class GhlFilterValueError extends Error {}

/**
 * GHL's search-v2 validator distinguishes three failure modes by message shape
 * (see docs/filters-reference.md). Turn an axios error from one of these
 * endpoints into a typed error so callers can branch on "wrong field" vs
 * "wrong operator" vs "wrong value shape" instead of parsing strings themselves.
 */
export function classifyGhlSearchError(err: unknown): Error {
  const message: string = (err as any)?.response?.data?.message || (err as any)?.message || String(err);

  if (/Invalid field/i.test(message)) return new GhlFilterFieldError(message);
  if (/Invalid Operator/i.test(message)) return new GhlFilterOperatorError(message);
  if (/Invalid value for/i.test(message)) return new GhlFilterValueError(message);
  return err instanceof Error ? err : new Error(message);
}
