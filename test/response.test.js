import test from 'node:test';
import assert from 'node:assert';
import { getDataStatus, makeProjectOverviewResponse, makeResponse } from '../index.js';

test('makeResponse returns content and structuredContent', () => {
  const text = 'hello';
  const data = { a: 1 };

  const result = makeResponse(text, data);

  assert.ok(result.content);
  assert.strictEqual(result.content[0].text, text);
  assert.deepStrictEqual(result.structuredContent, data);
});

test('structuredContent is present and object-like', () => {
    const result = makeResponse('test', { foo: 'bar' });

    assert.strictEqual(typeof result.structuredContent, 'object');
    assert.strictEqual(result.structuredContent.foo, 'bar');
});

test('makeProjectOverviewResponse returns structured content for a committee', () => {
  const result = makeProjectOverviewResponse({
    id: 'demo',
    committees: [{
      id: 'demo',
      name: 'Apache Demo',
      shortdesc: ' Demo project\nfor tests ',
      homepage: 'https://demo.apache.org/',
      chair: 'Jane Doe',
      group: 'demo',
    }],
    podlings: {},
    groups: {
      demo: ['alice', 'bob', 'carol'],
      'demo-pmc': ['alice', 'bob'],
    },
    repos: {
      demo: 'https://github.com/apache/demo',
      'demo-site': 'https://github.com/apache/demo-site',
      other: 'https://github.com/apache/other',
    },
    releases: {
      demo: {
        'demo-1.0.0': '2026-04-01',
        'demo-0.9.0': { date: '2026-03-01' },
      },
    },
  });

  assert.match(result.content[0].text, /^# Apache Demo/);
  assert.match(result.content[0].text, /## Repositories \(2\)/);
  assert.deepStrictEqual(result.structuredContent, {
    query: 'demo',
    found: true,
    id: 'demo',
    name: 'Apache Demo',
    type: 'committee',
    description: 'Demo project for tests',
    homepage: 'https://demo.apache.org/',
    chair: 'Jane Doe',
    pmcGroupName: 'demo-pmc',
    pmcMemberCount: 2,
    committerGroupName: 'demo',
    committerCount: 3,
    repositories: [
      { name: 'demo', url: 'https://github.com/apache/demo' },
      { name: 'demo-site', url: 'https://github.com/apache/demo-site' },
    ],
    recentReleases: [
      { name: 'demo-1.0.0', date: '2026-04-01' },
      { name: 'demo-0.9.0', date: '2026-03-01' },
    ],
  });
});

test('makeProjectOverviewResponse returns structured suggestions when not found', () => {
  const result = makeProjectOverviewResponse({
    id: 'dem',
    committees: [{
      id: 'demo',
      name: 'Apache Demo',
      group: 'demo',
    }],
    podlings: {
      demo_podling: { name: 'Demo Podling' },
    },
    groups: {},
    repos: {},
    releases: {},
  });

  assert.strictEqual(
    result.content[0].text,
    'Project "dem" not found. Similar project IDs: demo, demo_podling.'
  );
  assert.deepStrictEqual(result.structuredContent, {
    query: 'dem',
    found: false,
    suggestions: ['demo', 'demo_podling'],
  });
});

test('getDataStatus reports an unfetched data source', () => {
  const now = Date.parse('2026-04-22T10:00:00.000Z');
  const result = getDataStatus({
    now,
    sources: { committees: 'https://example.test/committees.json' },
    dataCache: {},
    statusCache: {},
  });

  assert.deepStrictEqual(result.content, [{
    type: 'text',
    text: [
      '# Data Status',
      '',
      'Cache TTL: 6h',
      '',
      '- **committees**',
      '  URL: https://example.test/committees.json',
      '  Cached: no | Age: n/a | Stale: yes',
      '  Last attempt: never',
      '  Last refresh: never | Last result: not fetched',
    ].join('\n'),
  }]);
  assert.deepStrictEqual(result.structuredContent, {
    cacheTtl: 6 * 60 * 60 * 1000,
    cacheTtlAge: '6h',
    sources: [{
      key: 'committees',
      url: 'https://example.test/committees.json',
      cached: false,
      age: 'n/a',
      stale: true,
      lastAttempt: null,
      lastRefresh: null,
      lastResult: 'not fetched',
      lastFailure: null,
      error: null,
    }],
  });
});

test('getDataStatus reports fresh cached data after a successful refresh', () => {
  const now = Date.parse('2026-04-22T10:00:00.000Z');
  const cachedAt = now - 5 * 60 * 1000;
  const attemptedAt = now - 10 * 1000;
  const refreshedAt = now - 5 * 1000;

  const result = getDataStatus({
    now,
    cacheTtl: 10 * 60 * 1000,
    sources: { people: 'https://example.test/people.json' },
    dataCache: {
      people: { data: { jdoe: {} }, ts: cachedAt },
    },
    statusCache: {
      people: { lastAttempt: attemptedAt, lastSuccess: refreshedAt },
    },
  });

  assert.strictEqual(result.content[0].text, [
    '# Data Status',
    '',
    'Cache TTL: 10m',
    '',
    '- **people**',
    '  URL: https://example.test/people.json',
    '  Cached: yes | Age: 5m | Stale: no',
    '  Last attempt: 2026-04-22T09:59:50.000Z',
    '  Last refresh: 2026-04-22T09:59:55.000Z | Last result: success',
  ].join('\n'));
  assert.deepStrictEqual(result.structuredContent, {
    cacheTtl: 10 * 60 * 1000,
    cacheTtlAge: '10m',
    sources: [{
      key: 'people',
      url: 'https://example.test/people.json',
      cached: true,
      age: '5m',
      stale: false,
      lastAttempt: attemptedAt,
      lastRefresh: refreshedAt,
      lastResult: 'success',
      lastFailure: null,
      error: null,
    }],
  });
});

test('getDataStatus reports stale cached data and the last failure', () => {
  const now = Date.parse('2026-04-22T10:00:00.000Z');
  const cachedAt = now - 7 * 60 * 60 * 1000;
  const attemptedAt = now - 30 * 1000;
  const failedAt = now - 25 * 1000;

  const result = getDataStatus({
    now,
    sources: { releases: 'https://example.test/releases.json' },
    dataCache: {
      releases: { data: {}, ts: cachedAt },
    },
    statusCache: {
      releases: {
        lastAttempt: attemptedAt,
        lastFailure: failedAt,
        lastError: 'HTTP 500',
      },
    },
  });

  assert.strictEqual(result.content[0].text, [
    '# Data Status',
    '',
    'Cache TTL: 6h',
    '',
    '- **releases**',
    '  URL: https://example.test/releases.json',
    '  Cached: yes | Age: 7h | Stale: yes',
    '  Last attempt: 2026-04-22T09:59:30.000Z',
    '  Last refresh: 2026-04-22T03:00:00.000Z | Last result: failure',
    '  Last failure: 2026-04-22T09:59:35.000Z',
    '  Error: HTTP 500',
  ].join('\n'));
  assert.deepStrictEqual(result.structuredContent, {
    cacheTtl: 6 * 60 * 60 * 1000,
    cacheTtlAge: '6h',
    sources: [{
      key: 'releases',
      url: 'https://example.test/releases.json',
      cached: true,
      age: '7h',
      stale: true,
      lastAttempt: attemptedAt,
      lastRefresh: cachedAt,
      lastResult: 'failure',
      lastFailure: failedAt,
      error: 'HTTP 500',
    }],
  });
});
