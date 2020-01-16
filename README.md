DynamoDB OneTable ORM
==================

Simple ORM built on [DynamoDB Data Mapper](https://awslabs.github.io/dynamodb-data-mapper-js/) providing one table pattern

In the following documentation it will be called **DOTO**


Built int Columns
- `pk` String (PK)
- `sk` String (SK) (gsi-search pk)
- `dt` String  (gsi-search sk)
- `ss` String
- `rl` Set(String)

## Row types

|                    | **pk**                     | **sk**                 |
|--------------------|----------------------------|------------------------|
| Entity             | MyEntity:1                 | MyEntity               |
| Indexed Field      | MyEntity:1                 | MyEntity$foo           |
| Entity Versioned   | MyEntity:1                 | MyEntity#000001        |
| Relation           | MyEntity:1                 | MyOtherEntity:1        |


MyEntity$foo#0000001

### Entity

Base type, used to store item

- `pk` : `NAME`:`ID`
- `sk` : `NAME`
- `dt` : As you want, by default the creation date

### Entity Indexed Field

Used to index field

- `pk` : `NAME`:`ID`
- `sk` : $`FIELD`
- `dt` : The field value as string
- `value`: The raw value


### EntityVersioned

- `pk` : `NAME`:`ID`
- `sk` : `NAME`#`VERSION`

### Relation

- `pk` : `NAME`:`ID`
- `sk` : `RELATION_NAME`:`RELATION_ID`




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
const { Entity } = require('dynamodb-onetable-orm');

class MyModel extends Entity {
  static get $schema() {
    // Schema definition, see https://awslabs.github.io/dynamodb-data-mapper-js/packages/dynamodb-data-marshaller/
    return {
      foo: {
        type: 'String',

        // Additional settings
        indexed: false, // Index this field,
        searchable: false, // Make searchable
        versioned: false, // Include in version snapshot, see versioning
      },
      bar: {
        type: 'Numeric'
      }
    };
  }
}

```
#### Relations

Of course, DOTO manages the relationships

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
        searchable: false, // Make relation searchable, default false
      },
      blah: {
        type: Bla,
      }
    };
  }
}

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
    return 2; // -1 for unlimited
  }
}
```



### 3. Using model

```js

const m = new MyModel()
m.foo = 'Hello'
await m.save()

const ID = m.id // ID generated if not set

/// Update

const m = await MyModel.get(ID);
m.foo += ' World';
await m.save();


/// Relations

m.foos = [
  new Foo("XXX"),
];
await m.save();


/// Searching

await MyModel.find({
  // Sorting
  revert: false, // Sort revert

  // Pagination
  limit: 10,  // Max limit
  page: 1, // Page
  pageSize: 10, // Max result by page

  // Filter
  data: {}, // Data filter,  DynamodDB Expression
  search: '', // Full text search
  filter: {}, // RAW DynamodDB Expression
  relatedTo: [] // Array of relation
  //
})

```