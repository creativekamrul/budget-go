// Contract/example checks only; no database, external n8n or network access.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tsImport } from 'tsx/esm/api';

const { ingestSchema, automationCommandSchema } = await tsImport('../lib/automation.ts', import.meta.url);
const documents = ['quickstart', 'api', 'automation', 'n8n', 'mcp', 'security', 'operations', 'parity'];
const guideText = await Promise.all(documents.map(name => readFile(new URL(`../docs/developer/${name}.md`, import.meta.url), 'utf8')));
for (const [index, markdown] of guideText.entries()) {
  assert.match(markdown, /^# .+/);
  const fences = [...markdown.matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)];
  for (const match of fences) {
    const example = JSON.parse(match[1]);
    if ('sourceId' in example) assert.equal(ingestSchema.safeParse(example).success, true, `Invalid ingest example in ${documents[index]}`);
    if ('command' in example && example.command.type.startsWith('event_')) assert.equal(automationCommandSchema.safeParse(example.command).success, true, `Invalid automation example in ${documents[index]}`);
  }
}
console.log('PASS documentation JSON examples parse and automation examples match runtime schemas');

const specification = JSON.parse(await readFile(new URL('../docs/API.openapi.json', import.meta.url), 'utf8'));
assert.equal(specification.openapi, '3.1.0');
const ids = new Set();
for (const operations of Object.values(specification.paths)) for (const operation of Object.values(operations)) {
  assert.ok(operation.operationId);
  assert.ok(!ids.has(operation.operationId), 'Operation IDs must be unique');
  ids.add(operation.operationId);
}
function references(value) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref) {
    assert.ok(value.$ref.startsWith('#/'));
    let target = specification;
    for (const segment of value.$ref.slice(2).split('/')) target = target?.[segment.replaceAll('~1', '/').replaceAll('~0', '~')];
    assert.ok(target, `Missing schema reference ${value.$ref}`);
  }
  for (const child of Object.values(value)) references(child);
}
references(specification);
for (const path of ['/api/v3/workspace', '/api/v3/automation', '/api/v3/automation/parse', '/api/v3/ingest', '/api/v1/tokens', '/api/v1/tokens/{id}', '/api/mcp']) assert.ok(specification.paths[path]);
console.log('PASS generated OpenAPI JSON has unique operations, all documented core routes and resolving local references');

const workflow = JSON.parse(await readFile(new URL('../integrations/n8n/budget-go-alert-inbox.json', import.meta.url), 'utf8'));
assert.equal(workflow.active, false);
assert.equal(workflow.nodes.length, 3);
const code = workflow.nodes.find(node => node.type === 'n8n-nodes-base.code');
assert.throws(() => new Function(code.parameters.jsCode)(), /Configure your Budget Go source ID/);
const emitted = new Function(code.parameters.jsCode.replace("const sourceId = 'YOUR_SOURCE_ID';", "const sourceId = 'fixture-source';"))();
assert.equal(ingestSchema.safeParse(emitted[0].json).success, true);
const http = workflow.nodes.find(node => node.type === 'n8n-nodes-base.httpRequest');
assert.equal(http.parameters.method, 'POST');
assert.equal(http.parameters.genericAuthType, 'httpBearerAuth');
assert.equal(http.parameters.jsonBody, '={{ JSON.stringify($json) }}');
assert.ok(http.parameters.url.includes('.invalid/'));
assert.ok(!JSON.stringify(workflow).includes('bg_'));
console.log('PASS inactive n8n starter guards placeholders and emits a runtime-valid synthetic event; no external n8n execution claimed');

const result = spawnSync(process.execPath, ['integrations/n8n/ingest-event.mjs'], { env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }, encoding: 'utf8', windowsHide: true });
assert.equal(result.status, 1);
assert.match(result.stderr, /Set private BUDGET_GO_URL/);
console.log('PASS Node ingestion helper refuses missing private configuration before any request');
