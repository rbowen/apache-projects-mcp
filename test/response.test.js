import test from 'node:test';
import assert from 'node:assert';
import { makeFindProjectsByPersonResponse, makeResponse } from '../index.js';

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

test('makeFindProjectsByPersonResponse returns structured project roles', () => {
  const result = makeFindProjectsByPersonResponse({
    id: 'jdoe',
    committees: [{
      id: 'demo',
      name: 'Apache Demo',
      group: 'demo',
      homepage: 'https://demo.apache.org/',
    }],
    podlings: {
      pod: {
        name: 'Apache Pod',
        homepage: 'https://pod.apache.org/',
      },
    },
    groups: {
      demo: ['jdoe'],
      'demo-pmc': ['jdoe'],
      pod: ['jdoe'],
      other: ['someoneelse'],
    },
    people: {
      jdoe: { member: true },
    },
    names: {
      jdoe: 'Jane Doe',
    },
  });

  assert.match(result.content[0].text, /^# Project involvement for Jane Doe \(jdoe\)/);
  assert.match(result.content[0].text, /## PMC Memberships \(1\)/);
  assert.match(result.content[0].text, /## Committer Groups \(2\)/);
  assert.deepStrictEqual(result.structuredContent, {
    query: 'jdoe',
    found: true,
    id: 'jdoe',
    name: 'Jane Doe',
    member: true,
    pmcMembershipCount: 1,
    committerGroupCount: 2,
    pmcMemberships: [{
      group: 'demo-pmc',
      project: {
        type: 'committee',
        id: 'demo',
        name: 'Apache Demo',
        homepage: 'https://demo.apache.org/',
      },
    }],
    committerGroups: [
      {
        group: 'demo',
        project: {
          type: 'committee',
          id: 'demo',
          name: 'Apache Demo',
          homepage: 'https://demo.apache.org/',
        },
      },
      {
        group: 'pod',
        project: {
          type: 'podling',
          id: 'pod',
          name: 'Apache Pod',
          homepage: 'https://pod.apache.org/',
        },
      },
    ],
  });
});

test('makeFindProjectsByPersonResponse returns structured suggestions when not found', () => {
  const result = makeFindProjectsByPersonResponse({
    id: 'jan',
    committees: [],
    podlings: {},
    groups: {},
    people: {},
    names: {
      jdoe: 'Jane Doe',
      jsmith: 'Jan Smith',
    },
  });

  assert.strictEqual(
    result.content[0].text,
    'Person "jan" not found. Similar people: Jane Doe (jdoe), Jan Smith (jsmith).'
  );
  assert.deepStrictEqual(result.structuredContent, {
    query: 'jan',
    found: false,
    suggestions: [
      { id: 'jdoe', name: 'Jane Doe', label: 'Jane Doe (jdoe)' },
      { id: 'jsmith', name: 'Jan Smith', label: 'Jan Smith (jsmith)' },
    ],
  });
});
