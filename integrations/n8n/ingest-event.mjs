// Explicit integration action: stages one event; never posts a financial transaction.
// Usage: BUDGET_GO_URL=https://your-origin BUDGET_GO_TOKEN=<private> node ingest-event.mjs event.json
import { readFile } from 'node:fs/promises';

async function main() {
  const origin = process.env.BUDGET_GO_URL;
  const token = process.env.BUDGET_GO_TOKEN;
  const filename = process.argv[2];
  if (!origin || !token || !filename) throw new Error('Set private BUDGET_GO_URL/BUDGET_GO_TOKEN and pass an event JSON file path.');
  const url = new URL(origin);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw new Error('Use a trusted HTTPS origin, or HTTP loopback for development, without credentials or a path.');
  const event = JSON.parse(await readFile(filename, 'utf8'));
  if (!event || typeof event !== 'object' || !event.sourceId || !event.externalId) throw new Error('The event must contain your sourceId and a stable original externalId.');
  const body = JSON.stringify(event);
  const response = await fetch(new URL('/api/v3/ingest', url), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(30000), redirect: 'error' });
  const result = await response.json();
  if (!response.ok) throw new Error(`Ingestion returned HTTP ${response.status} (${typeof result?.error?.code === 'string' ? result.error.code : 'UNKNOWN_ERROR'}). Inspect the app; do not blindly change delivery IDs.`);
  console.log(JSON.stringify({ eventId: result.event?.id, status: result.event?.status, revision: result.revision, replayed: result.replayed, posted: false }, null, 2));
}
main().catch(error => { console.error(error instanceof Error && /^(Set private|Use a trusted|The event|Ingestion returned)/.test(error.message) ? error.message : 'Submission could not be confirmed. Inspect the inbox or retry the exact same event body and delivery identity. No secrets or message contents were logged.'); process.exitCode = 1; });
