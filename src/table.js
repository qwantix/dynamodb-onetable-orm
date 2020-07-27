
const aws = require('aws-sdk');

const {
  DataMapper,
} = require('@aws/dynamodb-data-mapper');

const {
  marshallItem,
} = require('@aws/dynamodb-data-marshaller');

const {
  DynamoDbSchema,
} = require('@aws/dynamodb-data-mapper');

const {
  iterateAwait,
} = require('./utils');

const defaultSeparators = {
  id: ':',
  version: '#',
  index: '$',
  relation: '@',
  // composite: '+',
};

const defaultConfig = {
  versionSize: 6,
  indexName: 'gsi-index',
  continuationTokenEncryptionKey: '',
};

const capitalize = (s) => {
  if (typeof s !== 'string') return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

class Table {
  static setDefault(name, opts) {
    if (name instanceof Table) {
      this._default = name;
    }
    this._default = new Table(name, opts);
  }

  static get default() {
    return this._default;
  }

  constructor(name, opts) {
    const {
      dataMapper, dynamodb, separators, config,
    } = opts || {};

    const client = new aws.DynamoDB({
      ...dynamodb || {},
    });

    this.name = name;
    this.client = client;
    this.mapper = new DataMapper({
      client,
      ...dataMapper || {},
    });

    this.separators = Object.freeze({
      ...defaultSeparators,
      ...separators || {},
    });

    this.config = Object.freeze({
      ...defaultConfig,
      ...config || {},
    });

    const s = this.separators;
    let rxStr = '(\\w+)'; // Name
    // rxStr += `(?:[${s.id}](\\w+))?`; // ID
    rxStr += '(?:';
    rxStr += `(?:[${s.index}](\\w+))?`; // Index
    rxStr += `(?:[${s.relation}](\\w+[:]\\w+))?`; // Relation
    rxStr += ')?';
    rxStr += `(?:[${s.version}](\\d+))?`; // Version
    this.rxKey = new RegExp(`^${rxStr}$`);
  }

  async put(item, option) {
    return this.mapper.put(item, option);
  }

  async transactWriteItems(writes) {
    return this.client.transactWriteItems({
      TransactItems: writes.map(([action, entity]) => {
        const payload = action === 'delete'
          ? {
            Key: {
              $id: { S: entity.$id },
              $kt: { S: entity.$kt },
            },
          }
          : {
            Item: {
              $id: { S: entity.$id },
              $kt: { S: entity.$kt },
              $sk: { S: entity.$sk },
              ...marshallItem(entity[DynamoDbSchema], entity),
            },
          };

        const content = {
          TableName: this.name,
          ...payload,
        };

        return {
          [capitalize(action)]: content,
        };
      }),
    }).promise();
  }

  async batchWrite(writes) {
    const it = this.mapper.batchWrite(writes);
    await iterateAwait(it, () => {});
  }

  async batchDelete(deletion) {
    const it = this.mapper.batchDelete(deletion);
    await iterateAwait(it, () => {});
  }

  async delete(item, option) {
    return this.mapper.delete(item, option);
  }

  async query(query) {
    return this.client.query({
      TableName: this.name,
      ...query,
    }).promise();
  }

  parseKey(key) {
    const m = this.rxKey.exec(key) || [];
    const obj = {
      valid: m.length > 0,
      entity: m[1],
      index: m[2],
      relation: m[3],
      version: m[4] ? +m[4] : null,
    };
    return obj;
  }

  formatKey(data) {
    const tok = this.separators;
    let key = '';
    if (data.entity) {
      key += data.entity;
    }
    if (data.index) {
      key += tok.index + data.index;
    }
    if (data.relation) {
      key += tok.relation + data.relation;
    }
    if (data.version) {
      key += tok.version + String(data.version).padStart(this.config.versionSize, '0');
    }
    return key;
  }
}

module.exports = Table;
