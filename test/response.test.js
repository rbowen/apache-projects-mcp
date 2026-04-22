import test from 'node:test';
import assert from 'node:assert';
import { makeProjectPeopleResponse, makeResponse } from '../index.js';

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
