const {
  DynamoDbSchema,
  DynamoDbTable,
} = require('@aws/dynamodb-data-mapper');

const Table = require('./table');

class Row {
  /**
     * Table
     *
     * @returns Table
     */
  static get $table() {
    return Table.default;
  }

  static get $schema() {
    return {
      pk: {
        type: 'String',
        keyType: 'HASH',
      },
      sk: {
        type: 'String',
        keyType: 'RANGE',
        indexKeyConfigurations: {
          'gsi-index': 'HASH',
        },
      },
      dt: {
        type: 'String',
        indexKeyConfigurations: {
          'gsi-index': 'RANGE',
        },
      },
      ss: { // Search string
        type: 'String',
      },
      rl: { // Relation
        type: 'Set',
        memberType: 'String',
      },
      v: { // Version
        type: 'Number',
      },
    };
  }

  static setup() {
    if (this._setup) return this;
    this._setup = true;
    Object.defineProperties(this.prototype, {
      [DynamoDbTable]: {
        value: this.$table ? this.$table.name : null,
      },
      [DynamoDbSchema]: {
        value: {
          ...this.$schema,
          ...Row.$schema, // Force set default field
        },
      },
    });
    return this;
  }

  setup(opts) {
    this.constructor.setup();
    if (!opts) {
      return this;
    }
    Object.defineProperties(this, {
      [DynamoDbTable]: {
        value: opts.table || this[DynamoDbTable],
      },
      [DynamoDbSchema]: {
        value: {
          ...opts.schema || {},
          ...this[DynamoDbSchema],
        },
      },
    });
    return this;
  }

  toJSON() {
    // https://github.com/awslabs/dynamodb-data-mapper-js/tree/master/packages/dynamodb-data-marshaller
    const ignoredKeys = new Set(Object.keys(Row.$schema));
    const asJSON = (val, scheme, level = 0) => {
      if (scheme.onEmpty === 'nullify' && (val === null || val === undefined)) {
        return null;
      }

      switch (scheme.type) {
        case 'Document': {
          const out = {};
          const keys = Object.keys(scheme.members);
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const sch = scheme.members[k];
            const v = val[k];
            const exists = k in val;
            if (level === 0 && ignoredKeys.has(k)) {
              continue; // Ignore
            }

            if (sch.onEmpty === 'nullify' && (v === null || v === undefined)) {
              out[k] = null;
              continue;
            }
            if (!exists) {
              continue;
            }
            out[k] = asJSON(v, sch, level + 1);
          }
          return out;
        }
        case 'String':
          return val === undefined ? undefined : String(val);
        case 'Number':
          return +(val);
        case 'Boolean':
          return !!(val);
        case 'Map':
          if (val instanceof Map) {
            const obj = {};
            val.forEach((v, k) => {
              obj[k] = asJSON(v, scheme.memberType, level + 1);
            });
            return obj;
          }
          return undefined;
        case 'Set':
          if (val instanceof Set) {
            return Array.from(val)
              .map(v => asJSON(v, scheme.memberType, level + 1));
          }
          return undefined;
        case 'List':
          return Array.from(val)
            .map(v => asJSON(v, scheme.memberType, level + 1));
          // TODO:
          // case 'Binary':
          // case 'Collection':
          // case 'Custom':
          // case 'Hash':
          // case 'List':
          // case 'Tuple':
        case 'Date':
        case 'Hash':
        default:
          return val;
      }
    };
    return asJSON(this, {
      type: 'Document',
      members: this.constructor.$schema,
    });
  }

  isEquals(value) {
    return JSON.stringify(this) === JSON.stringify(value);
  }
}

module.exports = Row;
