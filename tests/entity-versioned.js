
const test = require('tape');
const {
  clear,
  validateRows,
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
        versioned: true,
      },
    };
  }

  static get $maxVersions() {
    return 3;
  }
}


test('Create entity versioned', async (t) => {
  await clear();
  // Create
  const obj = new Foo('test');
  obj.bar1 = 'mybar1';
  obj.bar2 = 'mybar2';
  const writes = await obj.save();
  t.equals(writes, 2, 'Numbers of writes should be equals to 2');
  await validateRows(t, t, [
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
        S: 'Foo#000001',
      },
    },
  ], 'Invalid creation');
  t.end();
});


test('Update entity versioned', async (t) => {
  await clear();
  // Create
  let obj = new Foo('test');
  obj.bar1 = 'mybar1';
  obj.bar2 = 'mybar2';
  let writes = await obj.save();
  t.equals(writes, 2, 'Numbers of writes should be equals to 2');
  await validateRows(t, [{
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
      S: 'Foo#000001',
    },
  },
  ], 'Invalid creation');
  writes = await obj.save();
  t.equals(writes, 0, 'Numbers of writes should be equals to 0');
  // Update
  obj.bar1 = 'mybar1updated';
  obj.bar2 = 'mybar2updated';
  writes = await obj.save();
  t.equals(writes, 2, 'Numbers of writes should be equals to 2');

  await validateRows(t, [
    {
      bar1: {
        S: 'mybar1updated',
      },
      bar2: {
        S: 'mybar2updated',
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
        S: 'Foo#000001',
      },
    },
    {
      bar2: {
        S: 'mybar2updated',
      },
      $sk: {
        S: 'test',
      },
      $id: {
        S: 'Foo:test',
      },
      $kt: {
        S: 'Foo#000002',
      },
    },


  ], 'Invalid update');


  obj = await Foo.get('test');
  obj.bar1 = 'plop';
  writes = await obj.save();
  t.equals(writes, 1, 'Numbers of writes should be equals to 1, bar1 not versioned');

  obj = await Foo.get('test');
  obj.bar2 = 'plip';
  writes = await obj.save();
  t.equals(writes, 2, 'Numbers of writes should be equals to 2');

  obj = await Foo.get('test');
  obj.bar2 = 'plap';
  writes = await obj.save();
  t.equals(writes, 3, 'Numbers of writes should be equals to 3, because should remove extra versions');

  await validateRows(t, [
    {
      bar1: {
        S: 'plop',
      },
      bar2: {
        S: 'plap',
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
      bar2: {
        S: 'mybar2updated',
      },
      $sk: {
        S: 'test',
      },
      $id: {
        S: 'Foo:test',
      },
      $kt: {
        S: 'Foo#000002',
      },
    },
    {
      bar2: {
        S: 'plip',
      },
      $sk: {
        S: 'test',
      },
      $id: {
        S: 'Foo:test',
      },
      $kt: {
        S: 'Foo#000003',
      },
    },
    {
      bar2: {
        S: 'plap',
      },
      $sk: {
        S: 'test',
      },
      $id: {
        S: 'Foo:test',
      },
      $kt: {
        S: 'Foo#000004',
      },
    },

  ], 'Invalid update');

  t.end();
});


test('Delete entity', async (t) => {
  await clear();

  const obj = new Foo({
    id: 'test',
    bar1: 'mybar1',
    bar2: 'mybar2',
  });
  await obj.save();
  obj.bar2 = 'mybar2updated';
  await obj.save();
  await obj.delete();
  await validateRows(t, [], 'Invalid deletion');

  t.end();
});
