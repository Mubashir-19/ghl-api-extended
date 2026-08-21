import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { findMostRecentCompanyId, getAuthorizedLocationClient } from '../src/auth';
import { searchAppointments } from '../src/appointmentsSearch';

async function main() {
    const locationId = process.argv[2] || '9oIMDhYHEoDYgQDAByby';

    const companyId = await findMostRecentCompanyId();
    if (!companyId) throw new Error('No company session found. Run "npm run authorize" first.');

    const client = await getAuthorizedLocationClient({ companyId, locationId });

    const data = await searchAppointments(client, {
        locationId,
        filters: [
            {
                group: 'OR',
                filters: [
                    {
                        group: 'AND',
                        filters: [
                            {
                                field: 'startTime',
                                operator: 'range',
                                value: {
                                    gt: 1787122799999,
                                    time_zone: '-07:00',
                                },
                                uiMeta: {
                                    operator: 'eq',
                                    dateMeta: { dateOperator: 'afterDate' },
                                },
                            },
                            {
                                field: 'appoinmentStatus',
                                operator: 'eq',
                                value: 'confirmed',
                            },
                        ],
                    },
                    {
                        group: 'AND',
                        filters: [
                            {
                                field: 'dateAdded',
                                operator: 'range',
                                value: {
                                    gte: 'now/d',
                                    lt: 'now+1d/d',
                                    time_zone: '-07:00',
                                },
                                uiMeta: {
                                    operator: 'eq',
                                    dateMeta: { dateOperator: 'today' },
                                },
                            },
                        ],
                    },
                ],
            },
            {
                group: 'AND',
                filters: [{ field: 'appointmentMeta.eventType', operator: 'not_exists' }],
            },
        ],
        sort: [{ field: 'startTime', direction: 'asc' }],
        limit: 10,
        page: 1,
        query: '',
    });

    const outPath = path.join(__dirname, '..', 'fixtures', 'appointments-search-response.json');
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
    console.log(`Saved response to ${outPath}`);
    console.log(`Appointments found: ${data?.appointments?.length} (count=${data?.count})`);
}

main().catch((err) => {
    console.error('Request failed:', err?.response?.data || err?.message || err);
    process.exit(1);
});
