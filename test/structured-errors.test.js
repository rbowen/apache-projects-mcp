import test from 'node:test';
import assert from 'node:assert';
import { server } from '../index.js';

const fixtures = {
  committees: [],
  people: {},
  people_name: {},
  releases: {
    'spark-old': {},
  },
  groups: {
    'iceberg-pmc': [],
  },
  repositories: {
    'apache-iceberg': 'https://github.com/apache/iceberg',
  },
};

globalThis.fetch = async (url) => {
  const source = Object.entries({
    committees: '/foundation/committees.json',
    people_name: '/foundation/people_name.json',
    people: '/foundation/people.json',
    releases: '/foundation/releases.json',
    groups: '/foundation/groups.json',
    repositories: '/foundation/repositories.json',
  }).find(([, suffix]) => url.endsWith(suffix));

  assert.ok(source, `unexpected URL: ${url}`);

  return {
    ok: true,
    json: async () => fixtures[source[0]],
  };
};

function tool(name) {
  return server._registeredTools[name].handler;
}

test('missing committee response includes structured content', async () => {
  const result = await tool('get_committee')({ id: 'missing' });

  assert.match(result.content[0].text, /Committee "missing" not found/);
  assert.deepStrictEqual(result.structuredContent, {
    id: 'missing',
    found: false,
    committee: null,
  });
});

test('missing person response includes structured content', async () => {
  const result = await tool('get_person')({ id: 'missing' });

  assert.match(result.content[0].text, /Person "missing" not found/);
  assert.deepStrictEqual(result.structuredContent, {
    id: 'missing',
    found: false,
    person: null,
  });
});

test('missing releases response includes structured content without suggestions', async () => {
  const result = await tool('get_releases')({ project: 'missing' });

  assert.match(result.content[0].text, /No releases found for "missing"/);
  assert.deepStrictEqual(result.structuredContent, {
    project: 'missing',
    count: 0,
    releases: [],
    suggestions: [],
  });
});

test('missing group response includes structured suggestions', async () => {
  const result = await tool('get_group_members')({ group: 'iceberg' });

  assert.match(result.content[0].text, /Similar groups: iceberg-pmc/);
  assert.deepStrictEqual(result.structuredContent, {
    group: 'iceberg',
    count: 0,
    members: [],
    suggestions: ['iceberg-pmc'],
  });
});

test('missing group response includes structured content without suggestions', async () => {
  const result = await tool('get_group_members')({ group: 'missing' });

  assert.match(result.content[0].text, /Group "missing" not found/);
  assert.deepStrictEqual(result.structuredContent, {
    group: 'missing',
    count: 0,
    members: [],
    suggestions: [],
  });
});

test('missing repositories response includes structured content', async () => {
  const result = await tool('get_repositories')({ project: 'missing' });

  assert.match(result.content[0].text, /No repositories found matching "missing"/);
  assert.deepStrictEqual(result.structuredContent, {
    project: 'missing',
    count: 0,
    repositories: [],
  });
});
