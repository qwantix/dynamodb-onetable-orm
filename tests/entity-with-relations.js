
const test = require('tape');
const {
  clear,
  validateRows,
  validateObj,
} = require('./util');

const Entity = require('../src/entity');

class Bar extends Entity {

}

class Foo extends Entity {
  static get $schema() {
    return {
      label: {
        type: 'String',
      },
    };
  }

  static get $relations() {
    return {
      mainbar: {
        type: Bar,
        include: ['label'],
      },
      bars: {
        type: Bar,
        multiple: true,
      },
    };
  }
}

test('Create entity with relation', async (t) => {
  await clear();
  // Create
  const obj = new Foo('test');
  obj.label = 'myFoo';
  obj.mainbar = new Bar('themainbar');
  obj.bars = [
    new Bar('bar1'),
    new Bar('bar2'),
  ];
  const writes = await obj.save();
  t.equals(writes, 4, 'Numbers of writes should be equals to 4');
  await validateRows([
    {
      $sk: {
        S: 'test',
      },
      label: {
        S: 'myFoo',
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
        S: 'Foo$bars@Bar:bar1',
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
        S: 'Foo$bars@Bar:bar2',
      },
    },
    {
      $sk: {
        S: 'Foo:test',
      },
      label: {
        S: 'myFoo',
      },
      $id: {
        S: 'Foo:test',
      },
      $kt: {
        S: 'Foo$mainbar@Bar:themainbar',
      },
    },
  ], 'Invalid creation');
  t.end();
});


test('Get entity with index', async (t) => {
  await clear();
  // Create
  const obj = new Foo('test');
  obj.label = 'myFoo';
  obj.mainbar = new Bar('themainbar');
  obj.bars = [
    new Bar('bar1'),
    new Bar('bar2'),
  ];
  const writes = await obj.save();
  t.equals(writes, 4, 'Numbers of writes should be equals to 4');
  // Get
  const obj1 = await Foo.get('test');
  validateObj(obj1, {
    id: 'test',
    label: 'myFoo',
    mainbar: {
      id: 'themainbar',
    },
    bars: [{
      id: 'bar1',
    }, {
      id: 'bar2',
    }],
  });
  t.end();
});


test('Update entity with index', async (t) => {
  await clear();
  // Create
  const obj = new Foo('test');
  obj.label = 'myFoo';
  obj.mainbar = new Bar('themainbar');
  obj.bars = [
    new Bar('bar1'),
    new Bar('bar2'),
  ];
  let writes = await obj.save();
  t.equals(writes, 4, 'Numbers of writes should be equals to 4');
  // Get
  const obj1 = await Foo.get('test');
  obj1.mainbar = new Bar('themainbar2');
  obj1.bars = [...obj.bars.filter(o => o.id !== 'bar1'), new Bar('bar3')];
  writes = await obj1.save();
  t.equals(writes, 4, 'Numbers of writes should be equals to 4');
  await validateRows([{
    $sk: {
      S: 'test',
    },
    $kt: {
      S: 'Foo',
    },
    $id: {
      S: 'Foo:test',
    },
    label: {
      S: 'myFoo',
    },
  },
  {
    $id: {
      S: 'Foo:test',
    },
    $sk: {
      S: 'Foo:test',
    },
    $kt: {
      S: 'Foo$bars@Bar:bar2',
    },
  },
  {
    $id: {
      S: 'Foo:test',
    },
    $sk: {
      S: 'Foo:test',
    },
    $kt: {
      S: 'Foo$bars@Bar:bar3',
    },
  },
  {
    $sk: {
      S: 'Foo:test',
    },
    $kt: {
      S: 'Foo$mainbar@Bar:themainbar2',
    },
    $id: {
      S: 'Foo:test',
    },
    label: {
      S: 'myFoo',
    },
  },
  ], 'Invalid update');

  // Update included file
  obj1.label = 'myFooUpdated';
  writes = await obj1.save();
  t.equals(writes, 2, 'Numbers of writes should be equals to 2');
  await validateRows([{
    $sk: {
      S: 'test',
    },
    $kt: {
      S: 'Foo',
    },
    $id: {
      S: 'Foo:test',
    },
    label: {
      S: 'myFooUpdated',
    },
  },
  {
    $id: {
      S: 'Foo:test',
    },
    $sk: {
      S: 'Foo:test',
    },
    $kt: {
      S: 'Foo$bars@Bar:bar2',
    },
  },
  {
    $id: {
      S: 'Foo:test',
    },
    $sk: {
      S: 'Foo:test',
    },
    $kt: {
      S: 'Foo$bars@Bar:bar3',
    },
  },
  {
    $sk: {
      S: 'Foo:test',
    },
    $kt: {
      S: 'Foo$mainbar@Bar:themainbar2',
    },
    $id: {
      S: 'Foo:test',
    },
    label: {
      S: 'myFooUpdated',
    },
  },
  ], 'Invalid update');


  t.end();
});


test('Delete entity', async (t) => {
  await clear();

  const obj = new Foo('test');
  obj.label = 'myFoo';
  obj.mainbar = new Bar('themainbar');
  obj.bars = [
    new Bar('bar1'),
    new Bar('bar2'),
  ];
  await obj.save();
  await obj.delete();
  await validateRows([], 'Invalid deletion');
  t.end();
});


test('Find on relation', async (t) => {
  await clear();
  // Create
  await new Foo({
    id: 'test1',
    label: 'Foo1',
    mainbar: new Bar('themainbar'),
    bars: [
      new Bar('bar1'),
      new Bar('bar2'),
    ],
  }).save();
  await new Foo({
    id: 'test2',
    label: 'Foo2',
    mainbar: new Bar('themainbar2'),
    bars: [
      new Bar('bar1'),
      new Bar('bar3'),
    ],
  }).save();
  await new Foo({
    id: 'test3',
    label: 'Foo3',
    mainbar: new Bar('themainbar'),
    bars: [
      new Bar('bar1'),
      new Bar('bar3'),
    ],
  }).save();

  let res = await Foo.query()
    .usingRelation('bars', 'bar3')
    .find();

  t.equals(res.items.length, 2);
  t.equals(res.items[0].id, 'test2');
  t.equals(res.items[1].id, 'test3');

  res = await Foo.query()
    .usingRelation('mainbar', 'themainbar')
    .find();

  t.equals(res.items.length, 2);
  t.equals(res.items[0].id, 'test1');
  t.equals(res.items[1].id, 'test3');


  res = await Foo.query()
    .usingRelation('bars', 'bar1')
    .find();

  t.equals(res.items.length, 3);
  t.equals(res.items[0].id, 'test1');
  t.equals(res.items[1].id, 'test2');
  t.equals(res.items[2].id, 'test3');


  t.end();
});
