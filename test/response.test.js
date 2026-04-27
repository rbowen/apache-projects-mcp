import test from 'node:test';
import assert from 'node:assert';
import {
  addMemberSection,
  bestSearchRank,
  cleanText,
  compactSearchText,
  enrichMembers,
  findProjectOverviewTarget,
  findProjectSuggestions,
  formatAge,
  formatProjectNotFound,
  formatTimestamp,
  getData,
  getDataStatus,
  getRecentReleases,
  getReleaseDate,
  makeProjectOverviewResponse,
  makeProjectPeopleResponse,
  makeResponse,
  makeTextResponse,
  matchesProjectRepository,
  normalizeProjectId,
  normalizeSearchText,
  rankedMatch,
  resetTestState,
  server,
  truncateList,
  warmCache,
} from '../index.js';

const SOURCE_FIXTURES = {
  committees: [
    {
      id: 'demo',
      name: 'Apache Demo',
      shortdesc: 'Demo committee',
      chair: 'Jane Doe',
      established: '2020-01-01',
      homepage: 'https://demo.apache.org/',
      reporting: 'January',
      charter: 'Build demo things',
      group: 'demo',
      roster: {
        alice: { name: 'Alice Example', date: '2020-01-02' },
        bob: { name: 'Bob Example', date: '2020-01-03' },
      },
    },
    {
      id: 'delta',
      name: 'Apache Delta',
      shortdesc: 'Analytics and storage',
      chair: 'Dora Delta',
      established: '2021-02-03',
      homepage: 'https://delta.apache.org/',
      charter: 'Delta charter text',
      group: 'delta',
    },
  ],
  people: {
    alice: { member: true, groups: ['demo', 'demo-pmc'] },
    bob: { member: false, groups: ['demo', 'demo-pmc'] },
    carol: { member: false, groups: ['demo'] },
    dora: { member: true, groups: ['delta', 'delta-pmc'] },
  },
  people_name: {
    alice: 'Alice Example',
    bob: 'Bob Example',
    carol: 'Carol Example',
    dora: 'Dora Delta',
  },
  releases: {
    demo: {
      'demo-2.0.0': '2026-04-20',
      'demo-1.0.0': { date: '2025-01-01' },
    },
    delta: {
      'delta-1.0.0': '2024-12-01',
    },
  },
  groups: {
    demo: ['alice', 'bob', 'carol'],
    'demo-pmc': ['alice', 'bob'],
    delta: ['dora'],
    'delta-pmc': ['dora'],
  },
  podlings: {
    demo_podling: {
      name: 'Demo Podling',
      description: 'Podling demo project',
      started: '2026-01-01',
      homepage: 'https://demo-podling.apache.org/',
    },
  },
  repositories: {
    demo: 'https://github.com/apache/demo',
    'demo-site': 'https://github.com/apache/demo-site',
    delta: 'https://github.com/apache/delta',
  },
};

function mockFetchWithFixtures(fixtures = SOURCE_FIXTURES) {
  return async function fetch(url) {
    const sourceName = url.split('/').pop().replace('.json', '');
    const data = fixtures[sourceName];
    if (data === undefined) {
      return {
        ok: false,
        status: 404,
        async json() {
          return null;
        },
      };
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return data;
      },
    };
  };
}

function withMockedFetch(testFn, fixtures = SOURCE_FIXTURES) {
  return async () => {
    resetTestState();
    const originalFetch = global.fetch;
    global.fetch = mockFetchWithFixtures(fixtures);
    try {
      await testFn();
    } finally {
      global.fetch = originalFetch;
      resetTestState();
    }
  };
}

function createSpyFetch(fixtures = SOURCE_FIXTURES, failures = {}) {
  const calls = [];
  const fetch = async function(url) {
    calls.push(url);
    const sourceName = url.split('/').pop().replace('.json', '');
    if (sourceName in failures) {
      const failure = failures[sourceName];
      if (failure instanceof Error) {
        throw failure;
      }
      return {
        ok: false,
        status: failure.status ?? 500,
        async json() {
          return null;
        },
      };
    }

    const data = fixtures[sourceName];
    if (data === undefined) {
      return {
        ok: false,
        status: 404,
        async json() {
          return null;
        },
      };
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return data;
      },
    };
  };
  return { fetch, calls };
}

function getToolHandler(name) {
  return server._registeredTools[name].handler;
}

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

test('makeTextResponse returns text content without structuredContent', () => {
  const result = makeTextResponse('plain text');

  assert.deepStrictEqual(result, {
    content: [{ type: 'text', text: 'plain text' }],
  });
  assert.ok(!('structuredContent' in result));
});

test('normalize and ranking helpers handle spacing, prefixes, and substrings', () => {
  assert.strictEqual(normalizeSearchText(' Demo_Podling  Project '), 'demo podling project');
  assert.strictEqual(compactSearchText('Demo Podling'), 'demopodling');
  assert.strictEqual(rankedMatch('Apache Demo', 'demo'), 0);
  assert.strictEqual(rankedMatch('DemoPodling', 'demo'), 1);
  assert.strictEqual(rankedMatch('Apache Delta Storage', 'stor'), 1);
  assert.strictEqual(rankedMatch('Apache Analytics', 'lyt'), 2);
  assert.strictEqual(rankedMatch('Apache Demo', 'zzz'), Infinity);
  assert.strictEqual(bestSearchRank(['zzz', 'Demo Podling'], 'demo'), 1);
});

test('truncateList returns both non-truncated and truncated shapes', () => {
  assert.deepStrictEqual(truncateList([1, 2], 5), {
    items: [1, 2],
    truncated: false,
  });
  assert.deepStrictEqual(truncateList([1, 2, 3], 2), {
    items: [1, 2],
    truncated: true,
    total: 3,
  });
});

test('project helper functions normalize ids and build suggestions', () => {
  assert.strictEqual(normalizeProjectId(' Demo '), 'demo');
  assert.strictEqual(cleanText(' Alpha\n  Beta '), 'Alpha Beta');
  assert.deepStrictEqual(
    findProjectSuggestions(SOURCE_FIXTURES.committees, SOURCE_FIXTURES.podlings, 'dem'),
    ['demo', 'demo_podling']
  );
  assert.strictEqual(
    formatProjectNotFound('dem', SOURCE_FIXTURES.committees, SOURCE_FIXTURES.podlings),
    'Project "dem" not found. Similar project IDs: demo, demo_podling.'
  );
  assert.strictEqual(
    formatProjectNotFound('zzz', SOURCE_FIXTURES.committees, SOURCE_FIXTURES.podlings),
    'Project "zzz" not found.'
  );
});

test('findProjectOverviewTarget finds both committees and podlings', () => {
  assert.deepStrictEqual(
    findProjectOverviewTarget(SOURCE_FIXTURES.committees, SOURCE_FIXTURES.podlings, 'demo'),
    {
      type: 'committee',
      id: 'demo',
      name: 'Apache Demo',
      description: 'Demo committee',
      homepage: 'https://demo.apache.org/',
      chair: 'Jane Doe',
      groupBase: 'demo',
    }
  );
  assert.deepStrictEqual(
    findProjectOverviewTarget(SOURCE_FIXTURES.committees, SOURCE_FIXTURES.podlings, 'demo podling'),
    {
      type: 'podling',
      id: 'demo_podling',
      name: 'Demo Podling',
      description: 'Podling demo project',
      homepage: 'https://demo-podling.apache.org/',
      chair: '',
      groupBase: 'demo_podling',
    }
  );
});

test('release helpers derive dates and recent release ordering', () => {
  assert.strictEqual(getReleaseDate('2026-01-01'), '2026-01-01');
  assert.strictEqual(getReleaseDate({ date: '2026-02-02' }), '2026-02-02');
  assert.deepStrictEqual(
    getRecentReleases(
      {
        demo: {
          'demo-1.0.0': '2025-01-01',
          'demo-3.0.0': { date: '2027-01-01' },
          'demo-2.0.0': { date: '' },
        },
      },
      'demo',
      2
    ),
    [
      { name: 'demo-2.0.0', date: 'unknown' },
      { name: 'demo-3.0.0', date: '2027-01-01' },
    ]
  );
});

test('repository and member helpers format structured data correctly', () => {
  const committeeTarget = {
    id: 'demo',
    groupBase: 'demo',
  };

  assert.strictEqual(matchesProjectRepository('demo', committeeTarget), true);
  assert.strictEqual(matchesProjectRepository('demo-site', committeeTarget), true);
  assert.strictEqual(matchesProjectRepository('demo_docs', committeeTarget), true);
  assert.strictEqual(matchesProjectRepository('other', committeeTarget), false);

  assert.deepStrictEqual(
    enrichMembers(['bob', 'alice'], SOURCE_FIXTURES.people_name),
    [
      { uid: 'alice', name: 'Alice Example' },
      { uid: 'bob', name: 'Bob Example' },
    ]
  );

  const lines = [];
  addMemberSection(lines, 'PMC Members', []);
  addMemberSection(lines, 'Committers', [{ uid: 'alice', name: 'Alice Example' }]);
  assert.deepStrictEqual(lines, [
    '## PMC Members (0)',
    'None found.',
    '## Committers (1)',
    '- Alice Example (alice)',
  ]);
});

test('time formatting helpers cover never, minutes, hours, and days', () => {
  const now = Date.parse('2026-04-22T10:00:00.000Z');
  assert.strictEqual(formatTimestamp(null), 'never');
  assert.strictEqual(formatTimestamp(now), '2026-04-22T10:00:00.000Z');
  assert.strictEqual(formatAge(null, now), 'n/a');
  assert.strictEqual(formatAge(now - 30 * 1000, now), '30s');
  assert.strictEqual(formatAge(now - 5 * 60 * 1000, now), '5m');
  assert.strictEqual(formatAge(now - 65 * 60 * 1000, now), '1h 5m');
  assert.strictEqual(formatAge(now - 3 * 24 * 60 * 60 * 1000, now), '3d');
});

test('getData returns cached data on repeated calls', async () => {
  resetTestState();
  const originalFetch = global.fetch;
  const spy = createSpyFetch();
  global.fetch = spy.fetch;
  try {
    const first = await getData('committees');
    const second = await getData('committees');

    assert.strictEqual(first, second);
    assert.strictEqual(spy.calls.length, 1);
  } finally {
    global.fetch = originalFetch;
    resetTestState();
  }
});

test('resetTestState clears cached fetch state between runs', async () => {
  resetTestState();
  const originalFetch = global.fetch;
  const spy = createSpyFetch();
  global.fetch = spy.fetch;
  try {
    await getData('committees');
    resetTestState();
    await getData('committees');
    assert.strictEqual(spy.calls.length, 2);
  } finally {
    global.fetch = originalFetch;
    resetTestState();
  }
});

test('getData throws wrapped HTTP failures', async () => {
  resetTestState();
  const originalFetch = global.fetch;
  const spy = createSpyFetch(SOURCE_FIXTURES, { committees: { status: 503 } });
  global.fetch = spy.fetch;
  try {
    await assert.rejects(
      () => getData('committees'),
      /Failed to fetch committees: HTTP 503/
    );
  } finally {
    global.fetch = originalFetch;
    resetTestState();
  }
});

test('warmCache ignores failed sources and returns successful results', async () => {
  resetTestState();
  const originalFetch = global.fetch;
  const spy = createSpyFetch(SOURCE_FIXTURES, { groups: new Error('boom') });
  global.fetch = spy.fetch;
  try {
    const result = await warmCache();

    assert.ok(result.committees);
    assert.ok(result.people);
    assert.ok(!('groups' in result));
    assert.strictEqual(spy.calls.length, 7);
  } finally {
    global.fetch = originalFetch;
    resetTestState();
  }
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

test('makeProjectOverviewResponse returns structured content for a podling with no repos or releases', () => {
  const result = makeProjectOverviewResponse({
    id: 'demo_podling',
    committees: [],
    podlings: {
      demo_podling: {
        name: 'Demo Podling',
        description: ' Experimental\npodling ',
        homepage: 'https://demo-podling.apache.org/',
      },
    },
    groups: {},
    repos: {
      unrelated: 'https://github.com/apache/unrelated',
    },
    releases: {},
  });

  assert.match(result.content[0].text, /^# Demo Podling/);
  assert.match(result.content[0].text, /No repositories found\./);
  assert.match(result.content[0].text, /No releases found\./);
  assert.deepStrictEqual(result.structuredContent, {
    query: 'demo_podling',
    found: true,
    id: 'demo_podling',
    name: 'Demo Podling',
    type: 'podling',
    description: 'Experimental podling',
    homepage: 'https://demo-podling.apache.org/',
    chair: null,
    pmcGroupName: 'demo_podling-pmc',
    pmcMemberCount: null,
    committerGroupName: 'demo_podling',
    committerCount: null,
    repositories: [],
    recentReleases: [],
  });
});

test('makeProjectPeopleResponse returns structured content for a committee', () => {
  const result = makeProjectPeopleResponse({
    id: 'demo',
    committees: [{
      id: 'demo',
      name: 'Apache Demo',
      group: 'demo',
    }],
    podlings: {},
    groups: {
      demo: ['carol', 'alice', 'bob'],
      'demo-pmc': ['bob', 'alice'],
    },
    names: {
      alice: 'Alice Example',
      bob: 'Bob Example',
      carol: 'Carol Example',
    },
  });

  assert.match(result.content[0].text, /^# Apache Demo People/);
  assert.match(result.content[0].text, /## PMC Members \(2\)/);
  assert.deepStrictEqual(result.structuredContent, {
    query: 'demo',
    found: true,
    id: 'demo',
    name: 'Apache Demo',
    type: 'committee',
    pmcGroupName: 'demo-pmc',
    pmcMemberCount: 2,
    committerGroupName: 'demo',
    committerCount: 3,
    pmcMembers: [
      { id: 'alice', name: 'Alice Example' },
      { id: 'bob', name: 'Bob Example' },
    ],
    committers: [
      { id: 'alice', name: 'Alice Example' },
      { id: 'bob', name: 'Bob Example' },
      { id: 'carol', name: 'Carol Example' },
    ],
  });
});

test('makeProjectPeopleResponse returns structured suggestions when not found', () => {
  const result = makeProjectPeopleResponse({
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
    names: {},
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

test('makeProjectPeopleResponse returns empty member sections for a podling without groups', () => {
  const result = makeProjectPeopleResponse({
    id: 'demo_podling',
    committees: [],
    podlings: {
      demo_podling: {
        name: 'Demo Podling',
      },
    },
    groups: {},
    names: {},
  });

  assert.match(result.content[0].text, /^# Demo Podling People/);
  assert.match(result.content[0].text, /## PMC Members \(0\)\nNone found\./);
  assert.match(result.content[0].text, /## Committers \(0\)\nNone found\./);
  assert.deepStrictEqual(result.structuredContent, {
    query: 'demo_podling',
    found: true,
    id: 'demo_podling',
    name: 'Demo Podling',
    type: 'podling',
    pmcGroupName: 'demo_podling-pmc',
    pmcMemberCount: 0,
    committerGroupName: 'demo_podling',
    committerCount: 0,
    pmcMembers: [],
    committers: [],
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

test('getDataStatus formats multi-day cache ages and stale successes', () => {
  const now = Date.parse('2026-04-22T10:00:00.000Z');
  const cachedAt = now - 3 * 24 * 60 * 60 * 1000;
  const attemptedAt = now - 60 * 1000;
  const refreshedAt = now - 2 * 24 * 60 * 60 * 1000;

  const result = getDataStatus({
    now,
    cacheTtl: 24 * 60 * 60 * 1000,
    sources: { groups: 'https://example.test/groups.json' },
    dataCache: {
      groups: { data: { demo: ['alice'] }, ts: cachedAt },
    },
    statusCache: {
      groups: { lastAttempt: attemptedAt, lastSuccess: refreshedAt },
    },
  });

  assert.strictEqual(result.content[0].text, [
    '# Data Status',
    '',
    'Cache TTL: 24h',
    '',
    '- **groups**',
    '  URL: https://example.test/groups.json',
    '  Cached: yes | Age: 3d | Stale: yes',
    '  Last attempt: 2026-04-22T09:59:00.000Z',
    '  Last refresh: 2026-04-20T10:00:00.000Z | Last result: success',
  ].join('\n'));
  assert.deepStrictEqual(result.structuredContent, {
    cacheTtl: 24 * 60 * 60 * 1000,
    cacheTtlAge: '24h',
    sources: [{
      key: 'groups',
      url: 'https://example.test/groups.json',
      cached: true,
      age: '3d',
      stale: true,
      lastAttempt: attemptedAt,
      lastRefresh: refreshedAt,
      lastResult: 'success',
      lastFailure: null,
      error: null,
    }],
  });
});

test('list_committees returns filtered structured results', withMockedFetch(async () => {
  const result = await getToolHandler('list_committees')({ query: 'storage', limit: 5 });

  assert.match(result.content[0].text, /Committees matching "storage" \(1 found\)/);
  assert.deepStrictEqual(result.structuredContent, {
    query: 'storage',
    count: 1,
    shown: 1,
    truncated: false,
    committees: [{
      id: 'delta',
      name: 'Apache Delta',
      shortdesc: 'Analytics and storage',
      chair: 'Dora Delta',
      established: '2021-02-03',
      homepage: 'https://delta.apache.org/',
    }],
  });
}));

test('list_committees returns truncated unfiltered results', withMockedFetch(async () => {
  const result = await getToolHandler('list_committees')({ limit: 1 });

  assert.match(result.content[0].text, /Apache Committees \(2 total\)/);
  assert.match(result.content[0].text, /showing 1 of 2 results/);
  assert.deepStrictEqual(result.structuredContent, {
    query: null,
    count: 2,
    shown: 1,
    truncated: true,
    committees: [{
      id: 'demo',
      name: 'Apache Demo',
      shortdesc: 'Demo committee',
      chair: 'Jane Doe',
      established: '2020-01-01',
      homepage: 'https://demo.apache.org/',
    }],
  });
}));

test('get_committee returns a plain-text not found response for missing committees', withMockedFetch(async () => {
  const result = await getToolHandler('get_committee')({ id: 'missing' });

  assert.deepStrictEqual(result, {
    content: [{ type: 'text', text: 'Committee "missing" not found.' }],
  });
}));

test('get_committee returns structured roster details', withMockedFetch(async () => {
  const result = await getToolHandler('get_committee')({ id: 'demo' });

  assert.match(result.content[0].text, /## PMC Roster \(2 members\)/);
  assert.deepStrictEqual(result.structuredContent.roster, [
    { id: 'alice', name: 'Alice Example', joined: '2020-01-02' },
    { id: 'bob', name: 'Bob Example', joined: '2020-01-03' },
  ]);
}));

test('search_people returns ranked structured people results', withMockedFetch(async () => {
  const result = await getToolHandler('search_people')({ query: 'Alice', limit: 2 });

  assert.match(result.content[0].text, /People matching "Alice" \(1 found\)/);
  assert.deepStrictEqual(result.structuredContent, {
    query: 'Alice',
    count: 1,
    shown: 1,
    truncated: false,
    people: [{
      id: 'alice',
      name: 'Alice Example',
      member: true,
      groups: ['demo', 'demo-pmc'],
    }],
  });
}));

test('search_people returns truncated results when limit is smaller than matches', withMockedFetch(async () => {
  const result = await getToolHandler('search_people')({ query: 'a', limit: 1 });

  assert.match(result.content[0].text, /showing 1 of 4 results/);
  assert.strictEqual(result.structuredContent.count, 4);
  assert.strictEqual(result.structuredContent.shown, 1);
  assert.strictEqual(result.structuredContent.truncated, true);
}));

test('get_person returns structured membership breakdown', withMockedFetch(async () => {
  const result = await getToolHandler('get_person')({ id: 'alice' });

  assert.match(result.content[0].text, /ASF Member: Yes/);
  assert.deepStrictEqual(result.structuredContent, {
    id: 'alice',
    name: 'Alice Example',
    member: true,
    groups: ['demo', 'demo-pmc'],
    committerGroups: ['demo'],
    pmcGroups: ['demo-pmc'],
    pmcs: ['demo'],
  });
}));

test('get_person returns plain-text content when the person is missing', withMockedFetch(async () => {
  const result = await getToolHandler('get_person')({ id: 'missing' });

  assert.deepStrictEqual(result, {
    content: [{ type: 'text', text: 'Person "missing" not found.' }],
  });
}));

test('list_podlings returns structured filtered podlings', withMockedFetch(async () => {
  const result = await getToolHandler('list_podlings')({ query: 'demo' });

  assert.match(result.content[0].text, /Apache Podlings \(1\)/);
  assert.deepStrictEqual(result.structuredContent, {
    count: 1,
    podlings: [{
      id: 'demo_podling',
      name: 'Demo Podling',
      started: '2026-01-01',
      homepage: 'https://demo-podling.apache.org/',
      description: 'Podling demo project',
    }],
  });
}));

test('get_releases returns suggestions when a project is missing', withMockedFetch(async () => {
  const result = await getToolHandler('get_releases')({ project: 'del' });

  assert.strictEqual(
    result.content[0].text,
    'Project "del" not found. Did you mean: delta?'
  );
  assert.deepStrictEqual(result.structuredContent, {
    project: 'del',
    count: 0,
    releases: [],
    suggestions: ['delta'],
  });
}));

test('get_releases returns plain-text content when there are no matches at all', withMockedFetch(async () => {
  const result = await getToolHandler('get_releases')({ project: 'zzz' });

  assert.deepStrictEqual(result, {
    content: [{ type: 'text', text: 'No releases found for "zzz".' }],
  });
}));

test('get_releases returns structured release history for known projects', withMockedFetch(async () => {
  const result = await getToolHandler('get_releases')({ project: 'demo' });

  assert.match(result.content[0].text, /Releases for demo \(2 total\)/);
  assert.deepStrictEqual(result.structuredContent, {
    project: 'demo',
    count: 2,
    releases: [
      { name: 'demo-2.0.0', date: '2026-04-20' },
      { name: 'demo-1.0.0', date: '2025-01-01' },
    ],
  });
}));

test('get_group_members returns structured member names', withMockedFetch(async () => {
  const result = await getToolHandler('get_group_members')({ group: 'demo-pmc' });

  assert.match(result.content[0].text, /Group: demo-pmc \(2 members\)/);
  assert.deepStrictEqual(result.structuredContent, {
    group: 'demo-pmc',
    count: 2,
    members: [
      { id: 'alice', name: 'Alice Example' },
      { id: 'bob', name: 'Bob Example' },
    ],
  });
}));

test('get_group_members returns similar-group suggestions', withMockedFetch(async () => {
  const result = await getToolHandler('get_group_members')({ group: 'dem' });

  assert.deepStrictEqual(result, {
    content: [{
      type: 'text',
      text: 'Group "dem" not found. Similar groups: demo, demo-pmc',
    }],
  });
}));

test('get_group_members returns plain-text content when no groups match', withMockedFetch(async () => {
  const result = await getToolHandler('get_group_members')({ group: 'zzz' });

  assert.deepStrictEqual(result, {
    content: [{ type: 'text', text: 'Group "zzz" not found.' }],
  });
}));

test('get_repositories returns plain-text content when no repositories match', withMockedFetch(async () => {
  const result = await getToolHandler('get_repositories')({ project: 'zzz' });

  assert.deepStrictEqual(result, {
    content: [{ type: 'text', text: 'No repositories found matching "zzz".' }],
  });
}));

test('get_repositories returns structured repository matches', withMockedFetch(async () => {
  const result = await getToolHandler('get_repositories')({ project: 'demo' });

  assert.match(result.content[0].text, /Repositories matching "demo" \(2\)/);
  assert.deepStrictEqual(result.structuredContent, {
    project: 'demo',
    count: 2,
    repositories: [
      { name: 'demo', url: 'https://github.com/apache/demo' },
      { name: 'demo-site', url: 'https://github.com/apache/demo-site' },
    ],
  });
}));

test('search_projects returns combined structured project matches', withMockedFetch(async () => {
  const result = await getToolHandler('search_projects')({ query: 'demo', limit: 10 });

  assert.match(result.content[0].text, /Projects matching "demo" \(2 found\)/);
  assert.deepStrictEqual(result.structuredContent, {
    query: 'demo',
    count: 2,
    shown: 2,
    truncated: false,
    projects: [
      {
        type: 'TLP',
        id: 'demo',
        name: 'Apache Demo',
        description: 'Demo committee',
        homepage: 'https://demo.apache.org/',
      },
      {
        type: 'Podling',
        id: 'demo_podling',
        name: 'Demo Podling',
        description: 'Podling demo project',
        homepage: 'https://demo-podling.apache.org/',
      },
    ],
  });
}));

test('search_projects returns truncated results when limit is smaller than matches', withMockedFetch(async () => {
  const result = await getToolHandler('search_projects')({ query: 'a', limit: 1 });

  assert.match(result.content[0].text, /showing 1 of 2/);
  assert.strictEqual(result.structuredContent.count, 2);
  assert.strictEqual(result.structuredContent.shown, 1);
  assert.strictEqual(result.structuredContent.truncated, true);
}));

test('get_project_overview tool returns the same structured overview as the helper', withMockedFetch(async () => {
  const result = await getToolHandler('get_project_overview')({ id: 'demo' });

  assert.strictEqual(result.structuredContent.name, 'Apache Demo');
  assert.strictEqual(result.structuredContent.repositories.length, 2);
}));

test('get_project_people tool returns the same structured people summary as the helper', withMockedFetch(async () => {
  const result = await getToolHandler('get_project_people')({ id: 'demo' });

  assert.strictEqual(result.structuredContent.name, 'Apache Demo');
  assert.strictEqual(result.structuredContent.pmcMembers.length, 2);
  assert.strictEqual(result.structuredContent.committers.length, 3);
}));

test('get_data_status tool returns the structured cache status view', withMockedFetch(async () => {
  await getData('committees');
  const result = await getToolHandler('get_data_status')({});

  assert.match(result.content[0].text, /# Data Status/);
  assert.strictEqual(result.structuredContent.sources.length, 7);
  assert.strictEqual(result.structuredContent.sources[0].key, 'committees');
}));

test('project_stats returns structured aggregate counts', withMockedFetch(async () => {
  const result = await getToolHandler('project_stats')({});

  assert.match(result.content[0].text, /Committees \(TLPs\):\*\* 2/);
  assert.deepStrictEqual(result.structuredContent, {
    committees: 2,
    podlings: 1,
    people: 4,
    members: 2,
    groups: 4,
    pmcGroups: 2,
    committerGroups: 2,
    repositories: 3,
    projectsWithReleases: 2,
    totalReleases: 3,
  });
}));
