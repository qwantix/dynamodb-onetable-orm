const test = require('tape');
const {
  clear,
} = require('./util');

const Entity = require('../src/entity');
const {
  attributeExists, attributeNotExists, attributeType, fn,
  not, greaterThan, greaterThanOrEqualTo, between, memberOf,
  equals, notEquals, lessThan, lessThanOrEqualTo, size,
} = require('../src/filters');

class Hero extends Entity {
  static get $schema() {
    return {
      name: {
        type: 'String',
      },
      class: {
        type: 'String',
      },
      age: {
        type: 'Number',
      },
      inventory: {
        type: 'List',
        memberType: { type: 'String' },
      },
    };
  }

  static get $indexes() {
    return {
      index1: {
        data(item) {
          return `${item.name}+${item.class}`;
        },
        include: ['name', 'class', 'age'],
        search: {
          normalizer: ['ci', 'no-accent', 'trim', 'no-extra-whitespace'],
        },
      },
    };
  }
}

const HEROES = [{
  id: 'A',
  name: 'Arngeir',
  class: 'Greybeards',
  age: 120,
},
{
  id: 'B',
  name: 'Paarthurnax',
  class: 'Greybeards',
  age: 5000,
},
{
  id: 'C',
  name: 'Wulfgar',
  class: 'Greybeards',
  age: 78,
  inventory: ['Crap', 'Dung', 'Fluff'],
},
{
  id: 'D',
  name: 'Dova',
  class: 'Kin',
  age: 33,
  inventory: ['Dust'],
}, {
  name: 'Unknown',
  class: 'Unknown',
},
];

test('Setup filters tests', async (assert) => {
  await clear();
  await Promise.all(HEROES.map(h => new Hero(h).save()));
  assert.end();
});

test('filters#not', async (assert) => {
  let result = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      not(
        equals('name', 'Paarthurnax'),
      ),
    )
    .find();

  assert.equals(result.items.length, 4);

  result = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      not(
        between('age', 78, 120),
      ),
    )
    .find();

  assert.equals(result.items.length, 3);

  assert.end();
});

test('filters#notEquals', async (assert) => {
  let result = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      notEquals('name', 'Paarthurnax'),
    )
    .find();

  assert.equals(result.items.length, 4);

  result = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      notEquals('name', 'Paarthurnax'),
      notEquals('name', 'Wulfgar'),
    )
    .find();

  assert.equals(result.items.length, 3);
  assert.end();
});

test('Filters#lessThan', async (assert) => {
  const result = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      lessThan('age', 78),
    )
    .find();

  assert.equals(result.items.length, 1);
  assert.end();
});

test('Filters#lessThanOrEqualTo', async (assert) => {
  const result = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      lessThanOrEqualTo('age', 78),
    )
    .find();

  assert.equals(result.items.length, 2);
  assert.end();
});

test('Filters#greaterThan', async (assert) => {
  const result = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      greaterThan('age', 120),
    )
    .find();

  assert.equals(result.items.length, 1);
  assert.end();
});

test('Filters#greaterThanOrEqualTo', async (assert) => {
  const result = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      greaterThanOrEqualTo('age', 120),
    )
    .find();

  assert.equals(result.items.length, 2);
  assert.end();
});

test('Filters#between', async (assert) => {
  let result = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      between('age', 79, 120),
    )
    .find();

  assert.equals(result.items.length, 1);

  result = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      between('age', 78, 120),
    )
    .find();

  assert.equals(result.items.length, 2);
  assert.end();
});

test('filters#attributeExists', async (assert) => {
  const result = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      attributeExists('age'),
    )
    .find();

  assert.equals(result.items.length, 4);
  assert.end();
});

test('filters#attributeNotExists', async (assert) => {
  const result = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      attributeNotExists('age'),
    )
    .find();

  assert.equals(result.items.length, 1);
  assert.end();
});

test('filters#attributeType', async (assert) => {
  const result = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      attributeType('age', 'N'),
    )
    .find();

  assert.equals(result.items.length, 4);
  assert.end();
});

test('filters#fn', async (assert) => {
  let result = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      fn('attribute_type', 'age', 'N'),
    )
    .find();

  assert.equals(result.items.length, 4);

  result = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      fn('attribute_not_exists', 'age'),
    )
    .find();

  assert.equals(result.items.length, 1);
  assert.end();
});

test('filters#memberOf', async (assert) => {
  const result = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      memberOf('class', ['Kin', 'Unknown']),
    )
    .find();
  assert.equals(result.items.length, 2);
  assert.end();
});

test('filters with function query', async (assert) => {
  const result = await Hero
    .query(filters => filters.attributeNotExists('age'))
    .usingIndex('index1')
    .find();
  assert.equals(result.items.length, 1);
  assert.end();
});

test('filter with function and multiple filters', async (assert) => {
  const result = await Hero.query(f => [
    f.notEquals('name', 'Paarthurnax'),
    f.notEquals('name', 'Wulfgar'),
  ])
    .usingIndex('index1')
    .find();

  assert.equals(result.items.length, 3);
  assert.end();
});

test('Teardown filters tests', async (assert) => {
  await clear();
  assert.end();
});
