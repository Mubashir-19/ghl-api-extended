import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { findMostRecentCompanyId, getAuthorizedLocationClient } from '../src/auth';
import { searchContacts } from '../src/contactsSearch';

async function main() {
    const locationId = process.argv[2] || '9oIMDhYHEoDYgQDAByby';

    const companyId = await findMostRecentCompanyId();
    if (!companyId) throw new Error('No company session found. Run "npm run authorize" first.');

    const client = await getAuthorizedLocationClient({ companyId, locationId });

    const data = await searchContacts(client, {
        locationId,
        filters: [{ group: 'OR', filters: [] }],
        page: 1,
        pageLimit: 20,
        includeTotal: true,
    });

    const outPath = path.join(__dirname, '..', 'fixtures', 'contacts-search-2-response.json');
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
    console.log(`Saved response to ${outPath}`);
    console.log(`Total contacts: ${data?.total ?? data?.contacts?.length}`);
}

main().catch((err) => {
    console.error('Request failed:', err?.response?.data || err?.message || err);
    process.exit(1);
});
