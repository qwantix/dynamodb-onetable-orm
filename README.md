DynamoDB OneTable ORM
==================

Simple ORM built on [DynamoDB Data Mapper](https://awslabs.github.io/dynamodb-data-mapper-js/) providing one table pattern on single GSI

It allow to store entity/relation in dynamodb

## Overview

DOTO use this builtin columns, all built in columns are prefixed by '$'

| Column | Type        | Key              | Comment        |
|--------|-------------|------------------|----------------|
| `$id`  | String      | pk               | Identifer      |
| `$kt`  | String      | sk, gsi-index.pk | Key type       |
| `$sk`  | String      | gsi-index.sk     | Sort key       |
| `$rl`  | Set(String) |                  | Relations      |
| `$sf`  | Document    |                  | Search fields  |
| `$ss`  | String      |                  | Search strings |


The cloud formation/serverless template:
```yml
Type: 'AWS::DynamoDB::Table'
Properties:
  TableName: 'MY_DOTO_TABLE'
  AttributeDefinitions:
    - AttributeName: $id
      AttributeType: S
    - AttributeName: $kt
      AttributeType: S
    - AttributeName: $sk
      AttributeType: S

  KeySchema:
    - AttributeName: $id
      KeyType: HASH
    - AttributeName: $kt
      KeyType: RANGE

  GlobalSecondaryIndexes:
    - IndexName: gsi-index
      KeySchema:
        - AttributeName: $kt
          KeyType: HASH
        - AttributeName: $sk
          KeyType: RANGE
      Projection:
        ProjectionType: INCLUDE
        NonKeyAttributes:
          - $rl
          - $sf
          - $ss
```


## Row types

|                    | **$id**                     | **kt**                         |
|--------------------|----------------------------|---------------------------------|
| Entity             | MyEntity:1                 | MyEntity                        |
| Indexed Field      | MyEntity:1                 | MyEntity$foo                    |
| Entity Versioned   | MyEntity:1                 | MyEntity#000001                 |
| Relation           | MyEntity:1                 | MyEntity$myRel@MyOtherEntity:1  |



## How to

### 1. Setup DynamoDB Table

Above all, you need to setup table that you use to store your model

```js
const { Table } = require('dynamodb-onetable-orm');

// Set Table default

const TABLE_NAME = 'my-table';
const REGION = 'eu-west-1';

Table.setDefault(TABLE_NAME, {
  dynamodb: {
    region: REGION,
  },
});
```

### 2. Model definition

#### Simple model
```js
const { Entity, filters } = require('dynamodb-onetable-orm');

class MyModel extends Entity {
  static get $schema() {
    // Schema definition, see https://awslabs.github.io/dynamodb-data-mapper-js/packages/dynamodb-data-marshaller/
    return {
      foo: {
        type: 'String',
      },
      bar: {
        type: 'Numeric'
      }
    };
  }
}

// Create
const m = new MyModel()
m.foo = 'The foo value'
await m.save()

// Get
const m = await MyModel.get('theID')

// Find
const { items } = await MyModel.query()
  .addFilter(
    filters.equals('foo', 'The foo value'),
  )
  .find()

```
#### Relations

DOTO allow to manages the relationships

```js
class MyModel extends Entity {
  static get $schema() {
    return {
      // .... Your schema defintion
    }
  }

  static get $relations() {
    return {
      foos: { // Create "foos" relation to Foo
        type: Foo, // Required, Other model implementing the Entity class
        // Optionals
        multiple: false, // Relation can be 1:n or n:m, default false
        include: ['label'], // Include given field to relation, default: []
      },
      blah: {
        type: Bla,
      }
    };
  }
}

// Usage

const m = new MyModel()

const foo1 = await Foo.get('somefoo')
const foo2 = await Foo.get('somefoo2')
const blah = await Bla.get('blah')
m.foos = [foo1, foo2]
m.blah = blah
await m.save()


// Find
const { items } = await MyModel.query()
  .usingRelation('foos', 'foo1')
  .find()

```

#### Indexes

You can manage multiple indexes for search

```js
class MyModel extends Entity {
  static get $schema() {
    return {
      // .... Your schema defintion
    }
  }

  static get $indexes() {
    return {
      bar1: true, // Index this field
      index1: { // Custom index
        data(item) {
          return `${item.bar1}+${item.bar2}`;
        },
        include: ['bar1', 'bar2'],
      },
      index2: {
        include: ['bar1','bar2],
        // You can define search by prop search

        search: ['bar2'], // List of fields can be searchable
        // or
        search: true // Apply search to
        // or
        search: {
          fields: ['bar2'], // If no field defined, will use 'include'
          normalizer: (v) => {return v.replace(/x/,'')},
          // or
          normalizer: ['lower', 'trim', 'no-accents', (v) => {return v.replace(/x/,'')}] // As pipeline
        }
      }
    };
  }
}

// Usage

const m = new MyModel()

const foo1 = await Foo.get('somefoo')
const foo2 = await Foo.get('somefoo2')
const blah = await Bla.get('blah')
m.foos = [foo1, foo2]
m.blah = blah
await m.save()

// Find
const { items } = await MyModel.query()
  .usingIndex('index2')
  .addFilter(
    ...
  )
  .find()

```

#### Versioning

Entity can be versioned if change is detected


```js
class MyModel extends Entity {
  static get $schema() {
    return {
      foo: { // This field will be versioned
        type: 'String',
        versioned: true,
      },
      bar: { // This field will be ignored
        type: 'Numeric'
      }
    };
  }

  // Define the maximum version to keep, here 2
  static get $maxVersions() {
    return 2; // -1 for unlimited, 0 not versionned
  }
}
```


### Misc

Improve doto performance using:
```sh
export AWS_NODEJS_CONNECTION_REUSE_ENABLED=1
```