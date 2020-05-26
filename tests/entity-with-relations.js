const test = require('tape');
const {
  clear,
  validateRows,
  validateObj,
} = require('./util');

const Entity = require('../src/entity');

class Item extends Entity {

}

class Bag extends Entity {
  static get $schema() {
    return {
      label: {
        type: 'String',
      },
    };
  }

  static get $relations() {
    return {
      smallSlot: {
        type: Item,
        include: ['label'],
      },
      largeSlot: {
        type: Item,
        multiple: true,
      },
    };
  }
}

test('Create entity with relation', async (t) => {
  await clear();
  // Create
  const obj = new Bag('mainbag');
  obj.label = 'myBag';
  obj.smallSlot = new Item('itema');
  obj.largeSlot = [
    new Item('item1'),
    new Item('item2'),
  ];
  const writes = await obj.save();
  t.equals(writes, 4, 'Numbers of writes should be equals to 4');
  await validateRows(t, [
    {
      $sk: {
        S: 'mainbag',
      },
      label: {
        S: 'myBag',
      },
      $id: {
        S: 'Bag:mainbag',
      },
      $kt: {
        S: 'Bag',
      },
    },
    {
      $sk: {
        S: 'Bag:mainbag',
      },
      $id: {
        S: 'Bag:mainbag',
      },
      $kt: {
        S: 'Bag$largeSlot@Item:item1',
      },
    },
    {
      $sk: {
        S: 'Bag:mainbag',
      },
      $id: {
        S: 'Bag:mainbag',
      },
      $kt: {
        S: 'Bag$largeSlot@Item:item2',
      },
    },
    {
      $sk: {
        S: 'Bag:mainbag',
      },
      label: {
        S: 'myBag',
      },
      $id: {
        S: 'Bag:mainbag',
      },
      $kt: {
        S: 'Bag$smallSlot@Item:itema',
      },
    },
  ], 'Invalid creation');
  t.end();
});

test('Get entity with index', async (t) => {
  await clear();
  // Create
  const obj = new Bag('bagid');
  obj.label = 'Huge bag';
  obj.smallSlot = new Item('itemid1');
  obj.largeSlot = [
    new Item('itemid2'),
    new Item('itemid3'),
  ];
  const writes = await obj.save();
  t.equals(writes, 4, 'Numbers of writes should be equals to 4');
  // Get
  const obj1 = await Bag.get('bagid');
  validateObj(t, obj1, {
    id: 'bagid',
    label: 'Huge bag',
    smallSlot: {
      id: 'itemid1',
    },
    largeSlot: [{
      id: 'itemid2',
    }, {
      id: 'itemid3',
    }],
  });
  t.end();
});

test('Update entity with index', async (t) => {
  await clear();
  // Create
  const bagOne = new Bag('bagxxx');
  bagOne.label = 'Bag Triple X';
  bagOne.smallSlot = new Item('itemId');
  bagOne.largeSlot = [
    new Item('itemId2'),
    new Item('itemId3'),
  ];
  let writes = await bagOne.save();
  t.equals(writes, 4, 'Numbers of writes should be equals to 4');
  // Get
  const bagTwo = await Bag.get('bagxxx');
  bagTwo.smallSlot = new Item('newItemId');
  bagTwo.largeSlot = [...bagOne.largeSlot.filter(o => o.id !== 'itemId2'), new Item('itemId4')];
  writes = await bagTwo.save();
  t.equals(writes, 4, 'Numbers of writes should be equals to 4');
  await validateRows(t, [{
    $sk: {
      S: 'bagxxx',
    },
    $kt: {
      S: 'Bag',
    },
    $id: {
      S: 'Bag:bagxxx',
    },
    label: {
      S: 'Bag Triple X',
    },
  },
  {
    $id: {
      S: 'Bag:bagxxx',
    },
    $sk: {
      S: 'Bag:bagxxx',
    },
    $kt: {
      S: 'Bag$largeSlot@Item:itemId3',
    },
  },
  {
    $id: {
      S: 'Bag:bagxxx',
    },
    $sk: {
      S: 'Bag:bagxxx',
    },
    $kt: {
      S: 'Bag$largeSlot@Item:itemId4',
    },
  },
  {
    $sk: {
      S: 'Bag:bagxxx',
    },
    $id: {
      S: 'Bag:bagxxx',
    },
    $kt: {
      S: 'Bag$smalSlot@Item:newItemId',
    },
    label: {
      S: 'Bag Triple X',
    },
  },
  ], 'Invalid update');

  // Update included file
  bagTwo.label = 'renamedBag';
  writes = await bagTwo.save();
  t.equals(writes, 2, 'Numbers of writes should be equals to 2');
  await validateRows(t, [{
    $sk: {
      S: 'bagxxx',
    },
    $kt: {
      S: 'Bag',
    },
    $id: {
      S: 'Bag:bagxxx',
    },
    label: {
      S: 'renamedBag',
    },
  },
  {
    $id: {
      S: 'Bag:bagxxx',
    },
    $sk: {
      S: 'Bag:bagxxx',
    },
    $kt: {
      S: 'Bag$largeSlot@Item:itemId3',
    },
  },
  {
    $id: {
      S: 'Bag:bagxxx',
    },
    $sk: {
      S: 'Bag:bagxxx',
    },
    $kt: {
      S: 'Bag$largeSlot@Item:itemId4',
    },
  },
  {
    $sk: {
      S: 'Bag:bagxxx',
    },
    $kt: {
      S: 'Bag$smallSlot@Item:itemId',
    },
    $id: {
      S: 'Bag:bagxxx',
    },
    label: {
      S: 'renamedBag',
    },
  },
  ], 'Invalid update');
  t.end();
});

test('Delete entity', async (t) => {
  await clear();

  const obj = new Bag('1');
  obj.label = 'To be deleted';
  obj.smallSlot = new Item('A');
  obj.largeSlot = [
    new Item('B'),
    new Item('C'),
  ];
  await obj.save();
  await obj.delete();
  await validateRows(t, [], 'Invalid deletion');
  t.end();
});

test('Find on relation', async (t) => {
  await clear();
  // Create
  await new Bag({
    id: 'A',
    label: 'Bag A',
    smallSlot: new Item('itemA'),
    largeSlot: [
      new Item('item1'),
      new Item('item2'),
    ],
  }).save();
  await new Bag({
    id: 'B',
    label: 'Bag B',
    smallSlot: new Item('itemB'),
    largeSlot: [
      new Item('item1'),
      new Item('item3'),
    ],
  }).save();
  await new Bag({
    id: 'C',
    label: 'Foo3',
    smallSlot: new Item('itemA'),
    largeSlot: [
      new Item('item1'),
      new Item('item3'),
    ],
  }).save();

  let res = await Bag.query()
    .usingRelation('largeSlot', 'item3')
    .find();

  t.equals(res.items.length, 2);
  t.equals(res.items[0].id, 'B');
  t.equals(res.items[1].id, 'C');

  res = await Bag.query()
    .usingRelation('smallSlot', 'itemA')
    .find();

  t.equals(res.items.length, 2);
  t.equals(res.items[0].id, 'A');
  t.equals(res.items[1].id, 'C');

  res = await Bag.query()
    .usingRelation('largeSlot', 'item1')
    .find();

  t.equals(res.items.length, 3);
  t.equals(res.items[0].id, 'A');
  t.equals(res.items[1].id, 'B');
  t.equals(res.items[2].id, 'C');

  t.end();
});
