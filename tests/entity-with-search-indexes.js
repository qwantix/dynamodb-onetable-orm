
const test = require('tape');
const {
  clear,
  validateRows,
} = require('./util');

const Entity = require('../src/entity');
const filters = require('../src/filters');

class Bar extends Entity {

}

class Foo extends Entity {
  static get $schema() {
    return {
      bar1: {
        type: 'String',
      },
      bar2: {
        type: 'String',
      },
    };
  }

  static get $relations() {
    return {
      mainbar: {
        type: Bar,
      },
      bars: {
        type: Bar,
        multiple: true,
      },
    };
  }

  static get $indexes() {
    return {
      index1: {
        data(item) {
          return `${item.bar1}+${item.bar2}`;
        },
        include: ['bar1', 'bar2'],
        search: {
          normalizer: ['ci', 'no-accent', 'trim', 'no-extra-whitespace'],
        },
        relations: ['mainbar', 'bars'],
      },
    };
  }
}

test('Create entity with index', async (t) => {
  await clear();
  // Create
  const obj = new Foo('test');
  obj.bar1 = 'myBar1éé';
  obj.bar2 = 'myBar2àà';
  obj.bars = [new Bar('b1'), new Bar('b2')];
  obj.mainbar = new Bar('mainbar');
  const writes = await obj.save();
  t.equals(writes, 5, 'Numbers of writes should be equals to 5');
  await validateRows(t, [
    {
      bar1: {
        S: 'myBar1éé',
      },
      bar2: {
        S: 'myBar2àà',
      },
      $sk: {
        S: 'test',
      },
      $id: {
        S: 'Foo:test',
      },
      $kt: {
        S: 'Foo',
      },
    },
    {
      $sk: {
        S: 'Foo:test',
      },
      $id: {
        S: 'Foo:test',
      },
      $kt: {
        S: 'Foo$bars@Bar:b1',
      },
    },
    {
      $sk: {
        S: 'Foo:test',
      },
      $id: {
        S: 'Foo:test',
      },
      $kt: {
        S: 'Foo$bars@Bar:b2',
      },
    },
    {
      $id: {
        S: 'Foo:test',
      },
      $kt: {
        S: 'Foo$index1',
      },
      $rl: {
        SS: [
          'Foo$bars@Bar:b1',
          'Foo$bars@Bar:b2',
          'Foo$mainbar@Bar:mainbar',
        ],
      },
      $sf: {
        M: {
          bar1: {
            S: 'myBar1éé',
          },
          bar2: {
            S: 'myBar2àà',
          },
        },
      },
      $sk: {
        S: 'myBar1éé+myBar2àà',
      },
      $ss: {
        M: {
          bar1: {
            S: 'mybar1ee',
          },
          bar2: {
            S: 'mybar2aa',
          },
        },
      },
    },
    {
      $sk: {
        S: 'Foo:test',
      },
      $id: {
        S: 'Foo:test',
      },
      $kt: {
        S: 'Foo$mainbar@Bar:mainbar',
      },
    },
  ], 'Invalid creation');
  t.end();
});


test('Delete entity', async (t) => {
  await clear();

  const obj = new Foo('test');
  obj.bar1 = 'myBar1éé';
  obj.bar2 = 'myBar2àà';
  obj.bars = [new Bar('b1'), new Bar('b2')];
  obj.mainbar = new Bar('mainbar');
  await obj.save();
  await obj.delete();
  await validateRows(t, [], 'Invalid deletion');
  t.end();
});


test('Find on fullsearch', async (t) => {
  const HELENA = {
    bar1: 'Jack',
    bar2: 'Elena',
  };
  await clear();
  // Create
  await new Foo({
    id: 'test1',
    bar1: 'Joe',
    bar2: 'Paul',
    mainbar: new Bar('themainbar'),
    bars: [
      new Bar('bar1'),
      new Bar('bar2'),
    ],
  }).save();
  await new Foo({
    id: 'test2',
    ...HELENA,
    mainbar: new Bar('themainbar2'),
    bars: [
      new Bar('bar1'),
      new Bar('bar3'),
    ],
  }).save();
  await new Foo({
    id: 'test3',
    bar1: 'George',
    bar2: 'Jane',
    mainbar: new Bar('themainbar'),
    bars: [
      new Bar('bar1'),
      new Bar('bar3'),
    ],
  }).save();
  let res;

  res = await Foo.query()
    .usingIndex('index1')
    .addFilter(
      filters.relatedTo('bars', 'bar3'),
    )
    .find();
  t.equals(res.items.length, 2);

  res = await Foo.query()
    .usingIndex('index1')
    .addFilter(
      filters.notRelatedTo('bars', 'bar3'),
    )
    .find();
  t.equals(res.items.length, 1);

  res = await Foo.query()
    .usingIndex('index1')
    .addFilter(
      filters.containsLike('bar2', 'eNa'),
    )
    .find();
  t.equals(res.items[0].bar1, HELENA.bar1);
  t.equals(res.items[0].bar2, HELENA.bar2);
  t.equals(res.items.length, 1);

  res = await Foo.query()
    .usingIndex('index1')
    .addFilter(
      filters.containsLike('bar2', 'YeNa'),
    )
    .find();
  t.equals(res.items.length, 0);

  res = await Foo.query()
    .usingIndex('index1')
    .addFilter(
      filters.beginsLike('bar2', 'ELeNa'),
    )
    .find();
  t.equals(res.items[0].bar1, HELENA.bar1);
  t.equals(res.items[0].bar2, HELENA.bar2);
  t.equals(res.items.length, 1);

  res = await Foo.query()
    .usingIndex('index1')
    .addFilter(
      filters.beginsLike('bar2', 'ILeNa'),
    )
    .find();
  t.equals(res.items.length, 0);

  res = await Foo.query()
    .usingIndex('index1')
    .addFilter(
      filters.like('bar2', 'ELeNa'),
    )
    .find();

  t.equals(res.items[0].bar1, HELENA.bar1);
  t.equals(res.items[0].bar2, HELENA.bar2);
  t.equals(res.items.length, 1);

  res = await Foo.query()
    .usingIndex('index1')
    .addFilter(
      filters.like('bar2', 'ILeNa'),
    )
    .find();
  t.equals(res.items.length, 0);

  res = await Foo.query()
    .usingIndex('index1')
    .addFilter(
      filters.notRelatedTo('bars', 'bar3'),
      filters.containsLike('bar2', 'eNa'),
    )
    .find();
  t.equals(res.items.length, 0);

  res = await Foo.query()
    .usingIndex('index1')
    .addFilter(
      filters.notRelatedTo('bars', 'bar2'),
      filters.containsLike('bar2', 'eNa'),
    )
    .find();
  t.equals(res.items.length, 1);

  t.end();
});
