/* eslint-disable no-await-in-loop */
const {
  DynamoDbSchema,
  DynamoDbTable,
} = require('@aws/dynamodb-data-mapper');

const {
  FunctionExpression,
  AttributePath,
} = require('@aws/dynamodb-expressions');

const {
  unmarshallItem,
} = require('@aws/dynamodb-data-marshaller');

const Row = require('./row');
const Relation = require('./relation');
const ChangeWatcher = require('./watcher');

const {
  genId,
  normalizeStr,
  iterateAwait,
} = require('./utils');

const classCache = {};


class Entity extends Row {
  /**
   * Entity name
   *
   * @returns String
   */
  static get $prefix() {
    return this.name;
  }

  /**
   * Returns a new entity ID
   */
  static $generateID() {
    return `${this.$prefix}${this.$table.id}${genId()}`;
  }

  /**
   * Returns the maximum number of versions that will be kept.
   * 0 indicates that the entity will not be versioned
   * -1 indicates that the entity will be versioned unlimitedly
   */
  static get $maxVersions() {
    return 0; // Not versionned by default
  }

  /**
   * Ensure prefix exists
   *
   * @param {string} value
   */
  static ensurePrefix(value) {
    if (!value) return '';
    const prefix = this.$prefix + this.$table.separators.id;
    if (!value.startsWith(prefix)) {
      return prefix + value;
    }
    return value;
  }

  /**
   * Remove prefix from value
   *
   * @param {string} value
   */
  static removePrefix(value) {
    const prefix = this.$prefix + this.$table.separators.id;
    if (value && value.startsWith(prefix)) {
      return value.slice(prefix.length);
    }
    return value;
  }

  /**
   * Get entity by id
   *
   * @param {Entity} id
   */
  static async get(id) {
    if (typeof id !== 'string') {
      throw new Error('Invalid ID');
    }

    this.setup();

    id = this.ensurePrefix(id);

    let item;
    try {
      // Load all items matching pk
      const { Items } = await this.$table.query({
        TableName: this.prototype[DynamoDbTable],
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': {
            S: id,
          },
        },
      });


      const relations = [];
      const relationsSk = [];
      const versions = [];
      for (let i = 0; i < Items.length; i++) {
        const v = Items[i];
        const sk = v.sk.S;
        const skInfo = this.$table.parseKey(sk);
        // If is the item
        if (sk === this.$prefix) {
          const sch = this.prototype[DynamoDbSchema];
          item = unmarshallItem(sch, v, this);
          item._changes.set('item', item, true);
          // eslint-disable-next-line no-loop-func
          Object.keys(sch).forEach((k) => {
            if (sch[k].indexed) {
              item._changes.set(`$${k}`, item[k], true);
            }
          });
        // If is the indexed field
        } else if (skInfo.index && !skInfo.relation) {
          // Ignore
        // Otherwise, is a relation
        } else if (skInfo.relation) {
          const name = skInfo.index;
          const rel = this.$relations[name];
          const Cls = rel.type;
          relationsSk.push(sk);
          if (Cls.prototype instanceof Relation) {
            relations.push(
              { name, item: unmarshallItem(Cls.prototype[DynamoDbSchema], v, Cls) },
            );
          } else {
            const row = unmarshallItem(Relation.prototype[DynamoDbSchema], v, Relation);
            const { relation } = this.$table.parseKey(row.sk);
            relations.push(
              {
                name,
                item: new Cls(relation),
              },
            );
          }
        } else if (skInfo.version && !skInfo.index && !skInfo.relation) {
          const sch = this.prototype[DynamoDbSchema];
          const versionItem = unmarshallItem(sch, v, this);
          versions.push(versionItem);
        }
      }
      if (!item) {
        return null;
      }
      item._invalidateRl();
      for (let i = 0; i < relations.length; i++) {
        const rel = relations[i];
        item._changes.set(`:${rel.name}:${rel.item.pk}`, rel.item, true);
      }
      item._relations = relations;
      // eslint-disable-next-line no-nested-ternary
      item._versions = versions.sort((a, b) => (a.v === b.v ? 0 : (a.v > b.v ? 1 : -1)));
      item._changes.set('relationsSk', relationsSk, true);
    } catch (e) {
      if (e.name === 'ItemNotFoundException') {
        return null;
      }
      throw new Error(e);
    }
    return item;
  }

  //
  static async find(opts) {
    opts = opts || {};
    const revert = (!!opts.revert) || false;
    const relatedTo = opts.relatedTo || [];
    const search = opts.search;
    const limit = opts.limit || 100;
    const page = opts.page || 1;
    const pageSize = opts.pageSize || limit;
    const dataCondition = opts.dataCondition;
    // Build filter
    let filter = opts.filter;

    if (!filter) {
      const conditions = [];
      if (relatedTo.length) {
        conditions.push(...relatedTo.map(r => new FunctionExpression('contains', new AttributePath('rl'), r)));
      }
      if (typeof search === 'string') {
        // Search on all fields
        normalizeStr(search).split(/\s+/).forEach((s) => {
          conditions.push(new FunctionExpression('contains', new AttributePath('ss'), `╠${s}`));
        });
      }
      filter = conditions.length ? {
        type: 'And',
        conditions,
      } : null;
    }

    const keyCondition = opts.keyCondition || {
      sk: this.$name,
    };

    if (dataCondition) {
      keyCondition.dt = dataCondition;
    }

    // Request on gsi
    const it = await this.$table.query(this, keyCondition, {
      indexName: 'gsi-search',
      pageSize,
      // limit,
      projection: ['pk', 'sk'],
      scanIndexForward: !revert,
      filter,
      ...(opts.opts || {}),
    });

    for (let i = 0; i < pageSize * (page - 1); i++) {
      const item = await it.next(); // Pass pages
      if (item.done) break;
    }

    // Fetch keys
    const keys = [];
    for (let i = 0; i < Math.min(pageSize, limit); i++) {
      const item = await it.next();
      if (item.done) break;
      keys.push(new this(item.value.pk));
    }

    // Get Items
    const results = this.$table.batchGet(keys);
    const items = [];
    await iterateAwait(results, (item) => {
      items.push(item);
    });
    // Force re-sort because batchGet do not preserve order
    // eslint-disable-next-line no-nested-ternary
    return items.sort((a, b) => (revert ? -1 : 1) * (a.dt === b.dt ? 0 : a.dt > b.dt ? 1 : -1));
  }

  static setup() {
    if (!this._setup) {
      // Addding relation properties
      const keys = Object.keys(this.$relations);
      for (let i = 0; i < keys.length; i++) {
        const name = keys[i];
        const def = { ...this.$relations[name] };

        Object.defineProperties(this.prototype, {
          [name]: {
            enumerable: true,
            get() {
              if (def.multiple) {
                return this.getRelations(name);
              }
              return this.getRelation(name);
            },
            set(value) {
              if (def.multiple) {
                return this.setRelations(name, value);
              }
              return this.setRelations(name, [value]);
            },
          },
        });
      }
    }

    return super.setup();
  }

  /**
   * Table
   *
   * @returns Table
   */
  get $table() {
    return this.constructor.$table;
  }

  /**
   * ID prefix
   *
   * @returns string
   */
  get $prefix() {
    return this.constructor.$prefix;
  }

  constructor(data) {
    super();
    this._sk = this.$table.formatKey({
      entity: this.$prefix,
    });
    this._pk = null;
    this._searchable = true;
    this._changes = new ChangeWatcher();
    this._relations = [];
    this.setData(data);
    this._changes.set('item', this);
    this.resetWrites();
  }

  set pk(value) {
    this._pk = this.constructor.ensurePrefix(value);
  }

  get pk() {
    return this._pk;
  }

  set sk(value) {
    this._sk = value;
  }

  get sk() {
    return this._sk;
  }

  get id() {
    return this.constructor.removePrefix(this.pk);
  }

  get $data() {
    return this.id;
  }

  set dt(value) {
    this._dt = value;
  }

  get dt() {
    return this._dt || this.$data;
  }

  set ss(_value) {
    // this
  }

  get rl() {
    if (!this._rl) {
      const rl = new Set();
      const t = this.$table;
      for (let i = 0; i < this._relations.length; i++) {
        const r = this._relations[i];
        rl.add(t.formatKey({
          index: r.name,
          relation: r.item.pk,
        }));
      }
      this._rl = rl;
    }
    return this._rl;
  }

  set rl(value) {
    this._rl = null;
  }

  /**
   * Search string
   */
  get ss() {
    if (!this._searchable) return undefined;
    const C = this.constructor;
    const {
      ssFieldStart, ssValueStart, ssValueEnd,
    } = C.$table.separators;
    const keys = Object.keys(C.$schema);
    let ss = '';
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (C.$schema[k].searchable) {
        const ser = typeof C.$schema[k].searchable === 'function'
          ? C.$schema[k].searchable
          : v => normalizeStr(v);
        ss += ssFieldStart + k + ssValueStart + ser(this[k], k) + ssValueEnd;
      }
    }
    return ss || undefined;
  }

  setData(data) {
    if (typeof data === 'string') {
      this.pk = data;
    } else if (data) {
      this.pk = data.pk || data.id;
      Object.keys(this.constructor.$schema)
        .forEach((k) => {
          this[k] = data[k];
        });
    }
  }

  async save() {
    this.constructor.setup();
    if (!this.pk) {
      this.pk = this.constructor.$generateID();
    }
    this.sk = this.constructor.$prefix;
    this.writeVersion();
    this.writeIndexes();
    this.writeRelations();
    this.writeItem();
    await this.commit();
    return this;
  }

  _ensureRelation(inst) {
    if (inst instanceof Row) {
      return inst;
    }
    throw new Error('Invalid relation');
  }

  _invalidateRl() {
    this._rl = null;
  }

  addRelation(name, inst) {
    const rel = this._ensureRelation(inst);
    this._relations = this._relations
      .filter(({ item }) => item.pk !== rel.pk) // Remove relation
      .concat([{ name, item: rel }]); // Add an return new relation
    this._invalidateRl();
  }

  removeRelation(name, inst) {
    const rel = this._ensureRelation(inst);
    this._relations = this._relations
      .filter(({ item }) => item.pk !== rel.pk); // Remove relation
    this._changes.set(`:${name}:${rel.pk}`, null);
    this._invalidateRl();
  }

  setRelations(name, relations) {
    if (!(relations instanceof Array)) {
      return;
    }
    this._relations = this._relations
      .filter(({
        item,
      }) => item.name === name) // Remove all relations
      .concat(relations.map(r => ({ name, item: this._ensureRelation(r) })));
    this._invalidateRl();
  }

  getRelations(name) {
    if (!name) return [];
    const out = [];
    for (let i = 0; i < this._relations.length; i++) {
      if (this._relations[i].name === name) {
        out.push(this._relations[i].item);
      }
    }
    return out;
  }

  getRelation(name, id) {
    if (id) {
      this.getRelations(name).find(r => r.pk === id);
    }
    return this.getRelations(name)[0] || null;
  }

  resetWrites() {
    this._writes = [];
  }

  writeVersion() {
    if (!this._changes.changed('item', this)) {
      return;
    }
    this.v = (this.v || 0) + 1;
    const C = this.constructor;
    const maxVersions = C.$maxVersions;
    if (maxVersions === 0) {
      return; // Ignore
    }
    const t = new this.constructor();
    t.pk = this.pk;
    t.sk = this.$table.formatKey({
      entity: this.$prefix,
      version: this.v,
    });

    t.v = this.v;
    t._searchable = false; // Disable search index
    t._rl = this.rl; // Add relation map
    const keys = Object.keys(C.$schema);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (C.$schema[k].versioned) {
        t[k] = this[k];
      }
    }
    this._writes.push(['put', t]);
    if (maxVersions >= 1) {
      // Remove versions
      while (this._versions.length > maxVersions) {
        this._writes.push(['delete', this._versions.shift()]);
      }
    }
  }

  writeItem() {
    if (!this._changes.changed('item', this)) {
      return;
    }
    this._writes.push(['put', this]);
  }

  writeIndexes() {
    const sch = this.constructor.$schema;
    const createIndex = (name, value) => {
      const idx = this._newIndex(name);
      idx.pk = this.pk;
      idx.dt = value;
      return idx;
    };

    Object.keys(sch).forEach((k) => {
      if (sch[k].indexed && this._changes.changed(`$${k}`, this[k])) {
        this._changes.setDirty(`$${k}`);
        this._writes.push(['put', createIndex(k, this[k])]);
      }
    });
  }

  writeRelations() {
    const relToDelete = new Set(this._changes.get('relationsSk'));
    for (let i = 0; i < this._relations.length; i++) {
      const { name, item } = this._relations[i];
      const def = this.constructor.$relations[name];
      const sk = this.$table.formatKey({
        entity: this.$prefix,
        index: name,
        relation: item.pk,
      });
      relToDelete.delete(sk);
      // Check if inclued field changed...
      // XXX Try to find a more elegant solution because isDirty depends on writeIndex
      const include = (def.include || [])
        .concat(def.searchable ? ['ss'] : []); // Append search field if needed

      const includeChanged = !!include.find(field => this._changes.isDirty(`$${field}`));

      if (includeChanged || this._changes.changed(`:${name}:${item.pk}`, item)) {
        let rel = item;
        if (!(rel instanceof Relation)) {
          rel = new Relation();
          rel.setup({
            table: this.$table.name,
            schema: (def.include || []).reduce((sch, field) => {
              sch[field] = this.constructor.$schema[field];
              return sch;
            }, {}),
          });
        }
        // rel.dt = rel.constructor.$prefix;
        rel.pk = this.pk;
        rel.sk = sk;
        rel.dt = this.pk;
        include.forEach((field) => {
          rel[field] = this[field];
        });
        rel.label = this.label;
        this._changes.setDirty('item');
        this._writes.push(['put', rel]);
      }
    }
    relToDelete.forEach((sk) => {
      const rel = new Relation();
      rel.pk = this.pk;
      rel.sk = sk;
      rel.setup({
        table: this.$table.name,
      });
      this._changes.setDirty('item');
      this._writes.push(['delete', rel]);
    });
  }

  async commit() {
    const writes = this._writes;
    if (!writes.length) {
      console.log('Nothing to save');
      return;
    }
    this.resetWrites();
    this._changes.clear();
    console.log('WRITES', writes);
    await this.$table.batchWrite(writes);
  }

  async delete() {
    this.constructor.setup();
    return this.$table.delete(this);
  }

  toJSON() {
    return {
      id: this.id,
      ...super.toJSON(),
    };
  }


  _newIndex(name) {
    const from = this;
    const prefix = from.constructor.$prefix;
    if (!classCache[prefix]) {
      const table = from.constructor.$table;
      const I = class extends Row {
        static get $table() {
          return table;
        }

        static get $prefix() {
          return prefix;
        }

        set sk(value) {
          //
        }

        get sk() {
          return from.$table.formatKey({
            entity: prefix,
            index: name,
          });
        }
      };
      I.setup();
      classCache[prefix] = I;
    }
    const Index = classCache[prefix];
    return new Index();
  }
}


module.exports = Entity;
