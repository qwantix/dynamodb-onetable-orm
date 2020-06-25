/* eslint-disable no-await-in-loop */

const test = require('tape');
const {
  clear,
  validateRows,
  validateObj,
} = require('./util');

const Entity = require('../src/entity');
const filters = require('../src/filters');

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

  static get $indexes() {
    return {
      bar1: true,
      index1: {
        data(item) {
          return `${item.bar1}+${item.bar2}`;
        },
        include: ['bar1', 'bar2'],
      },
    };
  }
}

test('Create entity with index', async (t) => {
  await clear();
  // Create
  const obj = new Foo('test');
  obj.bar1 = 'mybar1';
  obj.bar2 = 'mybar2';
  const writes = await obj.save();
  t.equals(writes, 3, 'Numbers of writes should be equals to 3');
  await validateRows(t, [
    {
      bar1: {
        S: 'mybar1',
      },
      bar2: {
        S: 'mybar2',
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
      $id: {
        S: 'Foo:test',
      },
      $kt: {
        S: 'Foo$bar1',
      },
      $sf: {
        M: {

        },
      },
      $sk: {
        S: 'mybar1',
      },
    },
    {
      $id: {
        S: 'Foo:test',
      },
      $kt: {
        S: 'Foo$index1',
      },
      $sf: {
        M: {
          bar1: {
            S: 'mybar1',
          },
          bar2: {
            S: 'mybar2',
          },
        },
      },
      $sk: {
        S: 'mybar1+mybar2',
      },
    },
  ], 'Invalid creation');
  t.end();
});

test('find all', async (t) => {
  await clear();
  await Promise.all([{ bar1: 'FancyBag' }, { bar1: 'DoggyBag' }].map(b => new Foo(b).save()));
  const res = await Foo.query()
    .find();
  t.equals(res.items.length, 2);
  t.end();
});

test('Get entity with index', async (t) => {
  await clear();
  // Create
  const obj = new Foo('test');
  obj.bar1 = 'mybar1';
  const writes = await obj.save();
  t.equals(writes, 3, 'Numbers of writes should be equals to 3');
  // Get
  const obj1 = await Foo.get('test');
  validateObj(t, obj1, {
    id: 'test',
    bar1: 'mybar1',
  });
  t.end();
});


test('Update entity with index', async (t) => {
  await clear();
  // Create
  const obj = new Foo('test');
  obj.bar1 = 'mybar1';
  let writes = await obj.save();
  t.equals(writes, 3, 'Numbers of writes should be equals to 3');
  // Get
  const obj1 = await Foo.get('test');
  validateObj(t, obj1, {
    id: 'test',
    bar1: 'mybar1',
  });
  obj1.bar2 = 'bar2';
  writes = await obj1.save();
  t.equals(writes, 2, 'Numbers of writes should be equals to 2');
  await validateRows(t, [{
    bar1: {
      S: 'mybar1',
    },
    bar2: {
      S: 'bar2',
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
    $id: {
      S: 'Foo:test',
    },
    $kt: {
      S: 'Foo$bar1',
    },
    $sf: {
      M: {

      },
    },
    $sk: {
      S: 'mybar1',
    },
  },
  {
    $id: {
      S: 'Foo:test',
    },
    $kt: {
      S: 'Foo$index1',
    },
    $sf: {
      M: {
        bar1: {
          S: 'mybar1',
        },
        bar2: {
          S: 'bar2',
        },
      },
    },
    $sk: {
      S: 'mybar1+bar2',
    },
  },
  ], 'Invalid creation');
  t.end();
});


test('Find on index', async (t) => {
  await clear();
  // Create
  for (let i = 0; i < 10; i++) {
    const obj = new Foo({
      id: `test${i}`,
      bar1: `mybar1-${i}`,
      bar2: `mybar2-${i}`,
    });
    await obj.save();
  }
  const count = await Foo.query().count();
  t.equals(count, 10, 'Count should be equals to 10');

  let res = await Foo.query().find();
  t.equals(res.items.length, 10, 'Count items should be equals to 10');

  res = await Foo.query()
    .usingIndex('index1')
    .sortKeyBeginsWith('mybar1')
    .addFilter(filters.or(
      filters.equals('bar1', 'mybar1-1'),
      filters.beginsWith('bar1', 'mybar1-4'),
    ))
    .asc()
    .find();
  t.equals(res.items.length, 2);
  t.equals(res.items[0].id, 'test1');
  t.equals(res.items[1].id, 'test4');

  t.end();
});


test('Delete entity', async (t) => {
  await clear();

  const obj = new Foo({
    id: 'test',
    bar1: 'mybar',
  });
  await obj.save();
  await obj.delete();
  await validateRows(t, [], 'Invalid deletion');
  t.end();
});
