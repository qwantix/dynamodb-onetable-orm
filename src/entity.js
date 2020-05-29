/* eslint-disable no-await-in-loop */
const {
  DynamoDbSchema,
  DynamoDbTable,
} = require('@aws/dynamodb-data-mapper');

const {
  unmarshallItem,
} = require('@aws/dynamodb-data-marshaller');

const Row = require('./row');
const Relation = require('./relation');
const {
  newIndex,
  getIndexCls,
  getIndexParams,
  Index,
} = require('./entity-index');

const State = require('./state');
const Query = require('./query');

const {
  genId,
} = require('./utils');


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
   * Returns object of indexes
   */
  static get $indexes() {
    return {
      // myIndex: {
      //   include: ['fields','names'], // Include fields
      //   data: 'fieldName' or function,
      //   search: Boolean || ['list', 'fields'],
      //   relations: [Relation]
      // },
    };
  }

  /**
   * Return object of relations
   */
  static get $relations() {
    return {};
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
      // Load all items matching the id
      const { Items } = await this.$table.query({
        TableName: this.prototype[DynamoDbTable],
        KeyConditionExpression: '#id = :id',
        ExpressionAttributeNames: {
          '#id': '$id',
        },
        ExpressionAttributeValues: {
          ':id': {
            S: id,
          },
        },
      });

      const indexes = [];
      const relations = [];
      const versions = [];

      for (let i = 0; i < Items.length; i++) {
        const v = Items[i];
        const $kt = v.$kt.S;
        const $ktInfo = this.$table.parseKey($kt);
        // If is the item
        if ($kt === this.$prefix) {
          const sch = this.prototype[DynamoDbSchema];
          item = unmarshallItem(sch, v, this);
        // If is the indexed field
        } else if ($ktInfo.index && !$ktInfo.relation) {
          indexes.push({ name: $ktInfo.index, value: v });
          // Ignore
        // Otherwise, is a relation
        } else if ($ktInfo.relation) {
          const name = $ktInfo.index;
          const rel = this.$relations[name];
          const Cls = rel.type;
          if (Cls.prototype instanceof Relation) {
            const r = unmarshallItem(Cls.prototype[DynamoDbSchema], v, Cls);
            r.$name = name;
            relations.push(
              {
                name, item: r, row: r, $kt,
              },
            );
          } else {
            const row = unmarshallItem(Relation.prototype[DynamoDbSchema], v, Relation);
            const { relation } = this.$table.parseKey(row.$kt);
            const r = new Cls(relation);
            r.$name = name;
            relations.push(
              {
                name, item: r, row, $kt,
              },
            );
          }
        // If version
        } else if ($ktInfo.version && !$ktInfo.index && !$ktInfo.relation) {
          const sch = this.prototype[DynamoDbSchema];
          const versionItem = unmarshallItem(sch, v, this);
          versions.push({
            v: $ktInfo.version,
            item: versionItem,
          });
        }
      }
      if (!item) {
        return null;
      }
      item._state.initEntity(item);

      for (let i = 0; i < indexes.length; i++) {
        const { name, value } = indexes[i];
        const Cls = getIndexCls(item.constructor, name);
        const idxItem = unmarshallItem(Cls.prototype[DynamoDbSchema], value, Cls);
        idxItem.$name = name;
        item._state.set('idx', idxItem.$kt, idxItem, true);
      }
      for (let i = 0; i < relations.length; i++) {
        const rel = relations[i];
        item._state.set('rel', rel.$kt, rel.row, true);
      }
      item._relations = relations;
      // Sort by asc
      item._versions = versions.sort((a, b) =>
        // eslint-disable-next-line no-nested-ternary, implicit-arrow-linebreak
        (a.v === b.v ? 0 : (a.v > b.v ? 1 : -1)))
        .map(v => v.item);
      item._v = versions.reduce((out, { v }) => Math.max(out, v), 0); // Get max version
      item._state.set('rel', 'keys', relations.map(r => r.$kt), true);
      // item._state.print('ON GET');
    } catch (e) {
      if (e.name === 'ItemNotFoundException') {
        return null;
      }
      throw new Error(e);
    }
    return item;
  }

  static async delete(id) {
    this.setup();

    id = this.ensurePrefix(id);
    // Force refetch all key before delete
    const {
      Items,
    } = await this.$table.query({
      TableName: this.prototype[DynamoDbTable],
      KeyConditionExpression: '#id = :id',
      ExpressionAttributeNames: {
        '#id': '$id',
        '#kt': '$kt',
      },
      ExpressionAttributeValues: {
        ':id': {
          S: id,
        },
      },
      ProjectionExpression: '#id,#kt',
    });

    await this.$table.batchDelete(Items.map(itm => Object.assign(new this(), {
      $id: itm.$id.S,
      $kt: itm.$kt.S,
    })));
  }

  /**
   * Create new query
   * @returns Query
   */
  static query() {
    const q = new Query();
    q._entity = this;
    return q;
  }

  static getIndexCls(name) {
    return getIndexCls(this, name);
  }

  static setup() {
    if (!this._setup) {
      // Addding relation properties
      const keys = Object.keys(this.$relations || {});
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
    this.constructor.setup();
    this._$kt = this.$table.formatKey({
      entity: this.$prefix,
    });
    this._$id = null;
    this._state = new State();
    this._state.initEntity(this);
    this._relations = [];
    this._pendingRelationsKeys = [];
    this._versions = [];
    this._v = 0;

    this._writes = [];

    this.setData(data);
    this.resetWrites();
  }

  set $id(value) {
    this._$id = this.constructor.ensurePrefix(value);
  }

  get $id() {
    return this._$id;
  }

  set $kt(value) {
    this._$kt = value;
  }

  get $kt() {
    return this._$kt;
  }

  get id() {
    return this.constructor.removePrefix(this.$id);
  }

  get $data() {
    return this.id;
  }

  set $sk(value) {
    this._$sk = value;
  }

  get $sk() {
    return this._$sk || this.$data;
  }

  setData(data) {
    if (typeof data === 'string') {
      this.$id = data;
    } else if (typeof data === 'object') {
      this.$id = data.$id || data.id;
      Object.keys(this.constructor.$schema)
        .forEach((k) => {
          this[k] = data[k];
        });
      Object.keys(this.constructor.$relations)
        .forEach((k) => {
          if (data[k]) {
            this[k] = data[k];
          }
        });
    }
  }

  async save() {
    if (!this.$id) {
      this.$id = this.constructor.$generateID();
    }
    this.$kt = this.constructor.$prefix;
    this.writeVersion();
    this.writeIndexes();
    this.writeRelations();
    this.writeItem();
    return this.commit();
  }

  _ensureRelation(inst) {
    if (inst instanceof Row) {
      return inst;
    }
    throw new Error('Invalid relation');
  }

  addRelation(name, inst) {
    const rel = this._ensureRelation(inst);
    this._relations = this._relations
      .filter(({ item }) => item.$id !== rel.$id) // Remove relation
      .concat([{ name, item: rel }]); // Add an return new relation
  }

  removeRelation(name, inst) {
    const rel = this._ensureRelation(inst);
    this._relations = this._relations
      .filter(({ item }) => item.$id !== rel.$id); // Remove relation
    this._state.set('rel', rel.$kt, null); // TODO check real $kt value.... may be wrong
  }

  setRelations(name, relations) {
    if (!(relations instanceof Array)) {
      return;
    }
    this._relations = this._relations
      .filter(item => item.name !== name) // Remove all relations of this typs
      .concat(relations.map(r => ({ name, item: this._ensureRelation(r) })));
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
      this.getRelations(name).find(r => r.$id === id);
    }
    return this.getRelations(name)[0] || null;
  }

  resetWrites() {
    this._writes = [];
  }

  writeVersion() {
    if (!this._state.changed('entity')) {
      return;
    }
    this._v = (this._v || 0) + 1;
    const C = this.constructor;
    const maxVersions = C.$maxVersions;
    if (maxVersions === 0) {
      return; // Ignore
    }
    const t = new this.constructor();
    t.$id = this.$id;
    t.$kt = this.$table.formatKey({
      entity: this.$prefix,
      version: this._v,
    });
    const keys = Object.keys(C.$schema);
    let changed = false;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (C.$schema[k].versioned) {
        changed = changed || this._state.changed('entity', k, this[k]);
        t[k] = this[k];
      }
    }

    if (!changed) return; // Not changes detected

    this._writes.push(['put', t]);
    if (maxVersions >= 1) {
      // Remove versions
      while (this._versions.length >= maxVersions) {
        this._writes.push(['delete', this._versions.shift()]);
      }
    }
  }

  writeItem() {
    if (!this._state.changed('entity')) {
      return;
    }
    this._writes.push(['put', this]);
  }

  writeIndexes() {
    const indexes = this.constructor.$indexes;
    const createIndex = (name) => {
      const {
        include,
        data,
        relations,
      } = getIndexParams(this.constructor, name);

      const idx = newIndex(this.constructor, name);
      idx.$id = this.$id;
      // Set data
      if (data instanceof Function) {
        idx.$sk = String(data(this));
      } else if (typeof data === 'string') {
        idx.$sk = this[data];
      } else {
        idx.$sk = new Date().toISOString();
      }

      // Include fields
      //    includes: []
      if (include instanceof Array) {
        include.forEach((f) => {
          idx.$sf[f] = this[f];
        });
      }

      // Include relations
      //   relations: ['name']
      const rels = [];
      if (relations === true) {
        rels.push(...Object.keys(this.constructor.$relations || {}));
      } else if (relations instanceof Array) {
        rels.push(...relations);
      }

      if (rels.length > 0) {
        const sr = new Set(rels);
        idx.$rl = new Set(this._relations
          .filter(r => sr.has(r.name))
          .map(r => this.$table.formatKey({
            entity: this.$prefix,
            index: r.name,
            relation: r.item.$id,
          })));
      }

      // Set $kt
      idx.$kt = this.$table.formatKey({
        entity: this.$prefix,
        index: name,
      });
      return idx;
    };

    Object.keys(indexes).forEach((k) => {
      const idx = createIndex(k);
      if (this._state.changed('idx', idx.$kt, idx)) {
        this._writes.push(['put', idx]);
      }
    });
  }

  writeRelations() {
    const relToDelete = new Set(this._state.get('rel', 'keys'));
    this._pendingRelationsKeys = [];
    for (let i = 0; i < this._relations.length; i++) {
      const { name, item } = this._relations[i];
      const def = this.constructor.$relations[name];
      const $kt = this.$table.formatKey({
        entity: this.$prefix,
        index: name,
        relation: item.$id,
      });
      relToDelete.delete($kt);
      this._pendingRelationsKeys.push($kt);
      // Check if inclued field changed...
      const include = (def.include || []);
      const includeChanged = !!include.find(field => this._state.changed('entity', field));

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

      if (includeChanged || this._state.changed('rel', $kt, rel)) {
        rel.$id = this.$id;
        rel.$kt = $kt;
        rel.$sk = this.$id;
        rel.$name = name;
        include.forEach((field) => {
          rel[field] = this[field];
        });
        this._writes.push(['put', rel]);
      }
    }
    relToDelete.forEach(($kt) => {
      const rel = new Relation();
      rel.$id = this.$id;
      rel.$kt = $kt;
      rel.setup({
        table: this.$table.name,
      });
      this._writes.push(['delete', rel]);
    });
  }

  async commit() {
    const writes = this._writes;
    if (!writes.length) {
      return 0;
    }
    this.resetWrites();
    // console.log('WRITES', writes);
    await this.$table.batchWrite(writes);
    writes.forEach((w) => {
      const [action, item] = w;
      if (action !== 'put') {
        return;
      }
      if (item instanceof Entity) {
        const $ktInfo = this.$table.parseKey(item.$kt);
        if ($ktInfo.version) {
          this._versions.push(item); // Put version
        } else {
          // console.log('#### RESET ENTITY');
          this._state.initEntity(this);
        }
      } else if (item instanceof Relation) {
        // console.log('#### RESET RELATION', item.$kt, item.toJSON());
        this._state.set('rel', item.$kt, item, true);
      } else if (item instanceof Index) {
        // console.log('#### RESET INDEX', item.$kt);
        this._state.set('idx', item.$kt, item, true);
      }
    });
    this._state.set('rel', 'keys', this._pendingRelationsKeys, true);
    return writes.length;
  }

  async delete() {
    return this.constructor.delete(this.$id);
  }

  toJSON() {
    return {
      id: this.id,
      ...super.toJSON(),
      ...Object.keys(this.constructor.$relations)
        .reduce((o, k) => {
          if (!this[k]) {
            o[k] = null;
          } else if (this[k] instanceof Array) {
            o[k] = this[k].map(v => v.toJSON());
          } else {
            o[k] = this[k].toJSON();
          }
          return o;
        }, {}),
    };
  }
}


module.exports = Entity;
