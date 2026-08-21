import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { findMostRecentCompanyId, getAuthorizedLocationClient } from '../src/auth';
import { searchOpportunities } from '../src/opportunitiesSearch';

async function main() {
    const locationId = process.argv[2] || '9oIMDhYHEoDYgQDAByby';
    const pipelineId = process.argv[3] || 'iv0V9Sacl6njcBsOpZSg';

    const companyId = await findMostRecentCompanyId();
    if (!companyId) throw new Error('No company session found. Run "npm run authorize" first.');

    const client = await getAuthorizedLocationClient({ companyId, locationId });

    const data = await searchOpportunities(client, {
        locationId,
        filters: [
            {
                group: 'OR',
                filters: [
                    {
                        group: 'AND',
                        filters: [
                            {
                                field: 'last_stage_change_date',
                                operator: 'range',
                                value: {
                                    gte: 1786129200000,
                                    lte: 1787338799999,
                                    time_zone: '{{location.timezone}}',
                                },
                            },
                        ],
                    },
                ],
            },
            {
                field: 'pipeline_id',
                operator: 'eq',
                value: [pipelineId],
            },
        ],
        query: '',
        sort: [{ field: 'date_added', direction: 'desc' }],
        limit: 1,
        additionalDetails: {
            notes: false,
            tasks: false,
            calendarEvents: false,
            unReadConversations: false,
        },
        includeTopRelations: true,
        aggregations: [
            {
                name: 'pipelines',
                type: 'terms',
                field: 'pipeline_stage_id',
                size: 14,
                options: {
                    include: [
                        '179c93aa-5fa6-46fb-ab53-2debf81c607b',
                        'ce99d09a-d62a-44b2-9bd0-03d8bb8014c4',
                        '328cac35-037c-4805-a6c7-3b5d84e36650',
                        '3161a188-53cc-47d0-b2af-b8b6519b50d9',
                    ],
                },
                aggregations: [
                    {
                        name: 'top_opportunities',
                        type: 'top_hits',
                        size: 20,
                        options: {
                            sort: [{ date_added: { order: 'desc' } }],
                        },
                    },
                    {
                        name: 'revenues',
                        type: 'sum',
                        field: 'monetary_value',
                    },
                ],
            },
        ],
    });

    const outPath = path.join(__dirname, '..', 'fixtures', 'opportunities-search-response.json');
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
    console.log(`Saved response to ${outPath}`);
    console.log('Top-level keys:', Object.keys(data || {}));
    console.log(`Opportunities returned: ${data?.opportunities?.length}, total: ${data?.meta?.total}`);
}

main().catch((err) => {
    console.error('Request failed:', err?.response?.data || err?.message || err);
    process.exit(1);
});
