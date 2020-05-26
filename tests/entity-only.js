/* eslint-disable no-await-in-loop */

const test = require('tape');
const {
  clear,
  validateRows,
  validateObj,
} = require('./util');

const Entity = require('../src/entity');
const filters = require('../src/filters');

class User extends Entity {
  static get $schema() {
    return {
      firstname: {
        type: 'String',
      },
      lastname: {
        type: 'String',
      },
      age: {
        type: 'Number',
      },
    };
  }
}

test('Create entity', async (t) => {
  await clear();
  // Create
  const obj = new User('123');
  obj.firstname = 'John';
  const writes = await obj.save();
  t.equals(writes, 1, 'Numbers of writes should be equals to 1');
  await validateRows(t, [
    {
      firstname: { S: 'John' },
      $sk: { S: '123' },
      $id: { S: 'User:123' },
      $kt: { S: 'User' },
    },
  ], 'Invalid creation');
  t.end();
});


test('Update entity', async (t) => {
  await clear();
  // Create
  const obj = new User('456');
  obj.firstname = 'JohnyTee';
  let writes = await obj.save();
  t.equals(writes, 1, 'Numbers of writes should be equals to 1');
  await validateRows(t, [{
    firstname: { S: 'JohnyTee' },
    $sk: { S: '456' },
    $id: { S: 'User:456' },
    $kt: { S: 'User' },
  }], 'Invalid creation');
  writes = await obj.save();
  t.equals(writes, 0, 'Numbers of writes should be equals to 0');

  // Update
  obj.firstname = 'JohnyTeeUpdated';
  obj.lastname = 'Fury';
  writes = await obj.save();
  t.equals(writes, 1, 'Numbers of writes should be equals to 1');

  await validateRows(t, [{
    firstname: { S: 'JohnyTeeUpdated' },
    lastname: { S: 'Fury' },
    $sk: { S: '456' },
    $id: { S: 'User:456' },
    $kt: { S: 'User' },
  }], 'Invalid update');

  t.end();
});

test('Get entity', async (t) => {
  await clear();
  // Create
  const obj = new User('789');
  obj.firstname = 'Jay';
  await obj.save();
  await validateRows(t, [{
    firstname: {
      S: 'Jay',
    },
    $sk: {
      S: '789',
    },
    $id: {
      S: 'User:789',
    },
    $kt: {
      S: 'User',
    },
  }], 'Invalid creation');
  // Get
  const obj1 = await User.get('789');
  validateObj(t, obj1, {
    id: '789',
    firstname: 'Jay',
  });
  t.end();
});

test('Find entity', async (t) => {
  await clear();
  // Create
  for (let i = 0; i < 10; i++) {
    const obj = new User({
      id: `test${i}`,
      firstname: `Louis ${i}`,
    });
    await obj.save();
  }
  const count = await User.query().count();
  t.equals(count, 10, 'Count should be equals to 10');

  const { items } = await User.query().find();
  t.equals(items.length, 10, 'Count items should be equals to 10');

  items.forEach((itm, i) => {
    t.equals(itm.firstname, `Louis ${i}`, `bar1 should be equals to "Louis ${i}"`);
  });

  t.end();
});

test('Delete entity', async (t) => {
  await clear();

  const obj = new User({
    id: '123',
    firstname: 'Sonia',
  });
  await obj.save();
  await obj.delete();
  await validateRows(t, [], 'Invalid deletion');

  t.end();
});

test.only('Tryng to filter with no indexes', async (t) => {
  await clear();

  try {
    await User.query()
      .addFilter(
        filters.notEquals('lastname', 'Greybeards'),
      )
      .find();
    t.fail('Should not get here');
  } catch (err) {
    t.ok(err, 'Got expected error');
  }
  t.end();
});
