const test = require('tape');
const {
  clear,
  validateRows,
} = require('./util');

const Entity = require('../src/entity');

class User extends Entity {
  static get $schema() {
    return {
      firstname: {
        type: 'String',
      },
      lastname: {
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
  const obj = new User('test');
  obj.firstname = 'mybar1';
  obj.lastname = 'mybar2';
  const writes = await obj.save();
  t.equals(writes, 2, 'Numbers of writes should be equals to 2');
  await validateRows(t, [
    {
      firstname: { S: 'mybar1' },
      lastname: { S: 'mybar2' },
      $sk: { S: 'test' },
      $id: { S: 'User:test' },
      $kt: { S: 'User' },
    },
    {
      lastname: { S: 'mybar2' },
      $sk: { S: 'test' },
      $id: { S: 'User:test' },
      $kt: { S: 'User#000001' },
    },
  ], 'Invalid creation');
  t.end();
});

test('Update entity versioned', async (t) => {
  await clear();
  // Create
  let obj = new User('test');
  obj.firstname = 'mybar1';
  obj.lastname = 'mybar2';
  let writes = await obj.save();
  t.equals(writes, 2, 'Numbers of writes should be equals to 2');
  await validateRows(t, [{
    firstname: { S: 'mybar1' },
    lastname: { S: 'mybar2' },
    $sk: { S: 'test' },
    $id: { S: 'User:test' },
    $kt: { S: 'User' },
  },
  {
    lastname: { S: 'mybar2' },
    $sk: { S: 'test' },
    $id: { S: 'User:test' },
    $kt: { S: 'User#000001' },
  },
  ], 'Invalid creation');
  writes = await obj.save();
  t.equals(writes, 0, 'Numbers of writes should be equals to 0');
  // Update
  obj.firstname = 'mybar1updated';
  obj.lastname = 'mybar2updated';
  writes = await obj.save();
  t.equals(writes, 2, 'Numbers of writes should be equals to 2');

  await validateRows(t, [
    {
      firstname: { S: 'mybar1updated' },
      lastname: { S: 'mybar2updated' },
      $sk: { S: 'test' },
      $id: { S: 'User:test' },
      $kt: { S: 'User' },
    },
    {
      lastname: { S: 'mybar2' },
      $sk: { S: 'test' },
      $id: { S: 'User:test' },
      $kt: { S: 'User#000001' },
    },
    {
      lastname: { S: 'mybar2updated' },
      $sk: { S: 'test' },
      $id: { S: 'User:test' },
      $kt: { S: 'User#000002' },
    },
  ], 'Invalid update');

  obj = await User.get('test');
  obj.firstname = 'plop';
  writes = await obj.save();
  t.equals(writes, 1, 'Numbers of writes should be equals to 1, bar1 not versioned');

  obj = await User.get('test');
  obj.lastname = 'plip';
  writes = await obj.save();
  t.equals(writes, 2, 'Numbers of writes should be equals to 2');

  obj = await User.get('test');
  obj.lastname = 'plap';
  writes = await obj.save();
  t.equals(writes, 3, 'Numbers of writes should be equals to 3, because should remove extra versions');

  await validateRows(t, [
    {
      firstname: { S: 'plop' },
      lastname: { S: 'plap' },
      $sk: { S: 'test' },
      $id: { S: 'User:test' },
      $kt: { S: 'User' },
    },
    {
      lastname: { S: 'mybar2updated' },
      $sk: { S: 'test' },
      $id: { S: 'User:test' },
      $kt: { S: 'User#000002' },
    },
    {
      lastname: { S: 'plip' },
      $sk: { S: 'test' },
      $id: { S: 'User:test' },
      $kt: { S: 'User#000003' },
    },
    {
      lastname: { S: 'plap' },
      $sk: { S: 'test' },
      $id: { S: 'User:test' },
      $kt: { S: 'User#000004' },
    },

  ], 'Invalid update');

  t.end();
});

test('Delete entity', async (t) => {
  await clear();

  const obj = new User({
    firstname: 'john',
    lastname: 'doo',
  });
  await obj.save();
  obj.lastname = 'doov2';
  await obj.save();
  await obj.delete();
  await validateRows(t, [], 'Invalid deletion');

  t.end();
});
