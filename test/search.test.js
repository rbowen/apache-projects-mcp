import test from 'node:test';
import assert from 'node:assert';
import { searchPeople, searchProjects } from '../index.js';

const fixtures = {
  people: {
    jdoe: {
      groups: ['iceberg', 'iceberg-pmc'],
      member: true,
    },
    asmith: {
      groups: ['kafka'],
      member: false,
    },
  },
  people_name: {
    jdoe: 'Jane Doe',
    asmith: 'Alex Smith',
  },
  committees: [
    {
      id: 'iceberg',
      name: 'Apache Iceberg',
      shortdesc: 'Table format for huge analytic datasets',
      charter: 'Develops an open table format',
      homepage: 'https://iceberg.apache.org/',
    },
    {
      id: 'kafka',
      name: 'Apache Kafka',
      shortdesc: 'Distributed event streaming platform',
      charter: 'Develops event streaming software',
      homepage: 'https://kafka.apache.org/',
    },
  ],
  podlings: {
    streampark: {
      name: 'Apache StreamPark',
      description: 'Streaming application development framework',
      homepage: 'https://streampark.apache.org/',
    },
  },
};

test('searchPeople returns matching people as structured content', () => {
  const result = searchPeople(fixtures.people, fixtures.people_name, 'jane', 10);

  assert.deepStrictEqual(result, {
    query: 'jane',
    count: 1,
    shown: 1,
    truncated: false,
    people: [
      {
        id: 'jdoe',
        name: 'Jane Doe',
        member: true,
        groups: ['iceberg', 'iceberg-pmc'],
      },
    ],
  });
});

test('searchPeople reports truncation in structured content', () => {
  const result = searchPeople(fixtures.people, fixtures.people_name, 'a', 1);

  assert.strictEqual(result.count, 2);
  assert.strictEqual(result.shown, 1);
  assert.strictEqual(result.truncated, true);
  assert.strictEqual(result.people.length, 1);
});

test('searchProjects returns TLP and podling matches as structured content', () => {
  const result = searchProjects(fixtures.committees, fixtures.podlings, 'stream', 10);

  assert.deepStrictEqual(result, {
    query: 'stream',
    count: 2,
    shown: 2,
    truncated: false,
    projects: [
      {
        type: 'Podling',
        id: 'streampark',
        name: 'Apache StreamPark',
        description: 'Streaming application development framework',
        homepage: 'https://streampark.apache.org/',
      },
      {
        type: 'TLP',
        id: 'kafka',
        name: 'Apache Kafka',
        description: 'Distributed event streaming platform',
        homepage: 'https://kafka.apache.org/',
      },
    ],
  });
});
