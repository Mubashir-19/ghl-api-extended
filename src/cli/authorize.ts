import 'dotenv/config';
import http from 'http';
import { URL } from 'url';
import { exchangeAuthCodeForTokens } from '../auth';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required (see .env.example).`);
  return value;
}

async function main() {
  const clientId = requireEnv('GHL_CLIENT_ID');
  const redirectUri = requireEnv('GHL_REDIRECT_URI');
  const scopes = process.env.GHL_SCOPES || 'contacts.readonly opportunities.readonly calendars/events.readonly';

  const authorizeUrl = new URL('https://marketplace.gohighlevel.com/oauth/chooselocation');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', scopes);

  const callbackUrl = new URL(redirectUri);
  const port = Number(callbackUrl.port) || 8734;

  console.log('Open this URL to authorize the app:\n');
  console.log(authorizeUrl.toString());
  console.log(`\nWaiting for the OAuth redirect on ${redirectUri} ...`);

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return;
      const reqUrl = new URL(req.url, `http://localhost:${port}`);
      if (reqUrl.pathname !== callbackUrl.pathname) {
        res.writeHead(404).end();
        return;
      }

      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(error ? `<p>Authorization failed: ${error}</p>` : '<p>Authorized — you can close this tab.</p>');

      server.close();
      if (error || !code) reject(new Error(error || 'No code returned'));
      else resolve(code);
    });

    server.listen(port);
  });

  const { companyId, userId } = await exchangeAuthCodeForTokens(code);
  console.log(`\nAuthorized. companyId=${companyId} userId=${userId}`);
  console.log('Company session saved to the local token store. Location tokens will be minted on demand.');
}

main().catch((err) => {
  console.error('Authorization failed:', err?.message || err);
  process.exit(1);
});
