const test = require('tape');
const {
  clear,
  validateRows,
} = require('./util');

const Entity = require('../src/entity');
const filters = require('../src/filters');

class Item extends Entity {

}

class Hero extends Entity {
  static get $schema() {
    return {
      name: {
        type: 'String',
      },
      class: {
        type: 'String',
      },
    };
  }

  static get $relations() {
    return {
      equipped: {
        type: Item,
      },
      inventory: {
        type: Item,
        multiple: true,
      },
    };
  }

  static get $indexes() {
    return {
      index1: {
        data(item) {
          return `${item.name}+${item.class}`;
        },
        include: ['name', 'class'],
        search: {
          normalizer: ['ci', 'no-accent', 'trim', 'no-extra-whitespace'],
        },
        relations: ['equipped', 'inventory'],
      },
    };
  }
}

test('Create entity with index', async (t) => {
  await clear();
  // Create
  const hero = new Hero('dovakin');
  hero.name = 'Døvakin';
  hero.class = 'Warrior';
  hero.inventory = [new Item('heal'), new Item('mana')];
  hero.equipped = new Item('sword');
  const writes = await hero.save();
  t.equals(writes, 5, 'Numbers of writes should be equals to 5');
  await validateRows(t, [
    {
      $sk: { S: 'dovakin' },
      name: { S: 'Døvakin' },
      class: { S: 'Warrior' },
      $kt: { S: 'Hero' },
      $id: { S: 'Hero:dovakin' },
    },
    {
      $kt: { S: 'Hero$equipped@Item:sword' },
      $sk: { S: 'Hero:dovakin' },
      $id: { S: 'Hero:dovakin' },
    },
    {
      $ss: {
        M: {
          name: { S: 'døvakin' },
          class: { S: 'warrior' },
        },
      },
      $sk: { S: 'Døvakin+Warrior' },
      $rl: {
        SS: [
          'Hero$equipped@Item:sword',
          'Hero$inventory@Item:heal',
          'Hero$inventory@Item:mana',
        ],
      },
      $kt: { S: 'Hero$index1' },
      $sf: {
        M: {
          name: { S: 'Døvakin' },
          class: { S: 'Warrior' },
        },
      },
      $id: { S: 'Hero:dovakin' },
    },
    {
      $kt: { S: 'Hero$inventory@Item:heal' },
      $sk: { S: 'Hero:dovakin' },
      $id: { S: 'Hero:dovakin' },
    },
    {
      $kt: { S: 'Hero$inventory@Item:mana' },
      $sk: { S: 'Hero:dovakin' },
      $id: { S: 'Hero:dovakin' },
    },
  ], 'Invalid creation');
  t.end();
});


test('Delete entity', async (t) => {
  await clear();

  const obj = new Hero();
  obj.name = 'Merlin';
  obj.class = 'Mage';
  obj.inventory = [new Item('1'), new Item('2')];
  obj.equipped = new Item();
  await obj.save();
  await obj.delete();
  await validateRows(t, [], 'Invalid deletion');
  t.end();
});


test('Find on fullsearch', async (t) => {
  const HELENA = {
    name: 'Jack',
    class: 'Butcher',
  };
  await clear();
  // Create
  await new Hero({
    name: 'Joe',
    class: 'Paul',
    equipped: new Item('item'),
    inventory: [
      new Item('itemA'),
      new Item('itemB'),
    ],
  }).save();
  await new Hero({
    ...HELENA,
    equipped: new Item('item2'),
    inventory: [
      new Item('itemA'),
      new Item('itemC'),
    ],
  }).save();
  await new Hero({
    name: 'George',
    class: 'Jane',
    equipped: new Item('item'),
    inventory: [
      new Item('itemA'),
      new Item('itemC'),
    ],
  }).save();
  let res;

  res = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      filters.relatedTo('inventory', 'itemC'),
    )
    .find();
  t.equals(res.items.length, 2);

  res = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      filters.notRelatedTo('inventory', 'itemC'),
    )
    .find();
  t.equals(res.items.length, 1);

  res = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      filters.containsLike('class', 'bUt'),
    )
    .find();
  t.equals(res.items[0].name, HELENA.name);
  t.equals(res.items[0].class, HELENA.class);
  t.equals(res.items.length, 1);

  res = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      filters.containsLike('class', 'Ybut'),
    )
    .find();
  t.equals(res.items.length, 0);

  res = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      filters.beginsLike('class', 'BUTc'),
    )
    .find();
  t.equals(res.items[0].name, HELENA.name);
  t.equals(res.items[0].class, HELENA.class);
  t.equals(res.items.length, 1);

  res = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      filters.beginsLike('class', 'IBut'),
    )
    .find();
  t.equals(res.items.length, 0);

  res = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      filters.like('class', 'BUtcher'),
    )
    .find();

  t.equals(res.items[0].name, HELENA.name);
  t.equals(res.items[0].class, HELENA.class);
  t.equals(res.items.length, 1);

  res = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      filters.like('class', 'IButcH'),
    )
    .find();
  t.equals(res.items.length, 0);

  res = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      filters.notRelatedTo('inventory', 'itemC'),
      filters.containsLike('class', 'chEr'),
    )
    .find();
  t.equals(res.items.length, 0);

  res = await Hero.query()
    .usingIndex('index1')
    .addFilter(
      filters.notRelatedTo('inventory', 'itemB'),
      filters.containsLike('class', 'chEr'),
    )
    .find();
  t.equals(res.items.length, 1);

  t.end();
});

/**
 *   const users = [{
    id: 'A',
    firstname: 'Arngeir',
    lastname: 'Greybeards',
    age: 120,
  },
  {
    id: 'B',
    firstname: 'Paarthurnax',
    lastname: 'Greybeards',
    age: 5000,
  },
  {
    id: 'C',
    firstname: 'Wulfgar',
    lastname: 'Greybeards',
    age: 78,
  },
  {
    id: 'D',
    firstname: 'Dova',
    lastname: 'Kin',
    age: 33,
  },
  ];

  await Promise.all(users.map(u => new User(u).save()));
*/
