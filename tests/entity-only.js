/* eslint-disable no-await-in-loop */

const test = require('tape');
const {
  clear,
  validateRows,
  validateObj,
} = require('./util');

const Entity = require('../src/entity');

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
}

test('Create entity', async (t) => {
  await clear();
  // Create
  const obj = new Foo('test');
  obj.bar1 = 'mybar1';
  const writes = await obj.save();
  t.equals(writes, 1, 'Numbers of writes should be equals to 1');
  await validateRows(t, [
    {
      bar1: {
        S: 'mybar1',
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
  ], 'Invalid creation');
  t.end();
});


test('Update entity', async (t) => {
  await clear();
  // Create
  const obj = new Foo('test');
  obj.bar1 = 'mybar1';
  let writes = await obj.save();
  t.equals(writes, 1, 'Numbers of writes should be equals to 1');
  await validateRows(t, [{
    bar1: {
      S: 'mybar1',
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
  }], 'Invalid creation');
  writes = await obj.save();
  t.equals(writes, 0, 'Numbers of writes should be equals to 0');

  // Update
  obj.bar1 = 'mybar1updated';
  obj.bar2 = 'mybar2';
  writes = await obj.save();
  t.equals(writes, 1, 'Numbers of writes should be equals to 1');

  await validateRows(t, [{
    bar1: {
      S: 'mybar1updated',
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
  }], 'Invalid update');

  t.end();
});


test('Get entity', async (t) => {
  await clear();
  // Create
  const obj = new Foo('test');
  obj.bar1 = 'mybar1';
  await obj.save();
  await validateRows(t, [{
    bar1: {
      S: 'mybar1',
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
  }], 'Invalid creation');
  // Get
  const obj1 = await Foo.get('test');
  validateObj(t, obj1, {
    id: 'test',
    bar1: 'mybar1',
  });
  t.end();
});

test('Find entity', async (t) => {
  await clear();
  // Create
  for (let i = 0; i < 10; i++) {
    const obj = new Foo({
      id: `test${i}`,
      bar1: `mybar${i}`,
    });
    await obj.save();
  }
  const count = await Foo.query().count();
  t.equals(count, 10, 'Count should be equals to 10');

  const { items } = await Foo.query().find();
  t.equals(items.length, 10, 'Count items should be equals to 10');

  items.forEach((itm, i) => {
    t.equals(itm.bar1, `mybar${i}`, `bar1 should be equals to "mybar${i}"`);
  });

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
