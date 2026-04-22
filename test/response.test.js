import test from 'node:test';
import assert from 'node:assert';
import {
  makeCommitteeResponse,
  makeGroupMembersResponse,
  makeListCommitteesResponse,
  makeResponse,
} from '../index.js';

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

test('makeListCommitteesResponse includes PMCs and podlings in structured content', () => {
  const result = makeListCommitteesResponse({
    committees: [{
      id: 'demo',
      name: 'Apache Demo',
      shortdesc: 'Demo PMC',
      chair: 'Jane Doe',
      established: '2020-01',
      homepage: 'https://demo.apache.org/',
      type: 'PMC',
    }],
    podlings: {
      pod: {
        name: 'Apache Pod',
        description: 'Podling project',
        started: '2026-01',
        homepage: 'https://pod.apache.org/',
      },
    },
    limit: 1,
  });

  assert.match(result.content[0].text, /## Apache Committees \(2 total\)/);
  assert.match(result.content[0].text, /\.\.\. showing 1 of 2 results/);
  assert.deepStrictEqual(result.structuredContent, {
    query: null,
    count: 2,
    shown: 1,
    truncated: true,
    committees: [{
      id: 'demo',
      name: 'Apache Demo',
      shortdesc: 'Demo PMC',
      chair: 'Jane Doe',
      established: '2020-01',
      homepage: 'https://demo.apache.org/',
    }],
  });
});

test('makeCommitteeResponse returns committee roster structured content', () => {
  const result = makeCommitteeResponse({
    id: 'demo',
    committees: [{
      id: 'demo',
      name: 'Apache Demo',
      group: 'demo',
      chair: 'Jane Doe',
      established: '2020-01',
      homepage: 'https://demo.apache.org/',
      reporting: 'January',
      shortdesc: 'Demo PMC',
      charter: 'Build demo things.',
      roster: {
        bob: { name: 'Bob Example', date: '2021-02-03' },
        alice: { name: 'Alice Example' },
      },
    }],
    podlings: {},
  });

  assert.match(result.content[0].text, /^# Apache Demo/);
  assert.match(result.content[0].text, /## PMC Roster \(2 members\)/);
  assert.deepStrictEqual(result.structuredContent, {
    id: 'demo',
    name: 'Apache Demo',
    group: 'demo',
    chair: 'Jane Doe',
    established: '2020-01',
    homepage: 'https://demo.apache.org/',
    reporting: 'January',
    shortdesc: 'Demo PMC',
    charter: 'Build demo things.',
    roster: [
      { id: 'alice', name: 'Alice Example', joined: null },
      { id: 'bob', name: 'Bob Example', joined: '2021-02-03' },
    ],
  });
});

test('makeGroupMembersResponse returns sorted LDAP project owners', () => {
  const result = makeGroupMembersResponse({
    group: 'demo-pmc',
    groups: {},
    ldapProjectsData: {
      projects: {
        demo: {
          owners: ['bob', 'alice'],
          members: ['carol'],
        },
      },
    },
    names: {
      alice: 'Alice Example',
      bob: 'Bob Example',
      carol: 'Carol Example',
    },
  });

  assert.match(result.content[0].text, /## Group: demo \(2 members\)/);
  assert.deepStrictEqual(result.structuredContent, {
    group: 'demo-pmc',
    count: 2,
    members: [
      { id: 'alice', name: 'Alice Example' },
      { id: 'bob', name: 'Bob Example' },
    ],
  });
});
