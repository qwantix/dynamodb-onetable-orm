/* eslint-disable no-await-in-loop */
const crypto = require('crypto');

const {
  AttributePath,
} = require('@aws/dynamodb-expressions');
const filters = require('./filters');

/**
 * Returns 32 bytes key
 */
function asValidEncryptionKey(encryptionKey) {
  const b = Buffer.alloc(32, 0);
  Buffer.from(String(encryptionKey) || '').copy(b, 0, 0, 32);
  return b;
}

function encodeContinuationToken(lastKey, encryptionKey) {
  if (!lastKey) {
    return null;
  }
  const key = JSON.stringify([lastKey.$id, lastKey.$kt, lastKey.$sk]);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', asValidEncryptionKey(encryptionKey), iv);
  let encrypted = cipher.update(key);
  encrypted = Buffer.concat([iv, encrypted, cipher.final()]);
  return encrypted.toString('base64');
}

function decodeContinuationToken(token, encryptionKey) {
  if (!token) {
    return null;
  }
  try {
    const buff = Buffer.from(token, 'base64');
    const iv = buff.slice(0, 16);
    const encryptedText = buff.slice(16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', asValidEncryptionKey(encryptionKey), iv);
    let decrypted = decipher.update(encryptedText);

    decrypted = Buffer.concat([decrypted, decipher.final()]);

    const keys = JSON.parse(decrypted.toString());
    return {
      $id: String(keys[0]),
      $kt: String(keys[1]),
      $sk: String(keys[2]),
    };
  } catch (e) {
    return null;
  }
}

function updateFilterWithPrefix(filter, prefix, depth = 10) {
  const out = { ...filter };
  if (!depth) {
    return out;
  }
  if (!filter) {
    return filter;
  }
  if (filter instanceof AttributePath && !filter.elements[0].name.startsWith('$')) {
    const p = new AttributePath(prefix);
    filter.elements.unshift(p.elements[0]);
  } else if (filter.conditions) { // Entering in AND or OR conditions
    filter.conditions = filter.conditions.map(f => updateFilterWithPrefix(f, prefix, depth - 1));
  } else if (filter.condition) { // Entering in NOT condition
    filter.condition = updateFilterWithPrefix(filter.condition, prefix, depth - 1);
  } else if (filter.subject instanceof AttributePath) {
    filter.subject = updateFilterWithPrefix(filter.subject, prefix, depth - 1);
  } else if (filter.args instanceof Array) {
    filter.args = filter.args.map((f) => {
      if (f instanceof AttributePath) {
        return updateFilterWithPrefix(f, prefix, depth - 1);
      }
      return f;
    });
  }
  return out;
}

function replaceSpecialFilters(filter, entity, index, depth = 10) {
  let out = {
    ...filter,
  };
  if (!depth) {
    return out;
  }
  if (!filter) {
    return filter;
  }

  if (filter.conditions) { // Entering in AND or OR conditions
    out.conditions = filter.conditions.map(f => replaceSpecialFilters(f, entity, index, depth - 1));
  } else if (filter.condition) { // Entering in NOT condition
    out.condition = replaceSpecialFilters(filter.condition, entity, index, depth - 1);
  } else {
    switch (filter.type) {
      case '@relatedTo':
        {
          const rel = entity.$relations[filter.relation];
          if (!rel) {
            throw new Error(`relation: Invalid relation '${filter.relation}'`);
          }
          out = filters.contains('$rl', entity.$table.formatKey({
            entity: entity.$prefix,
            index: filter.relation,
            relation: rel.type.ensurePrefix(filter.entityId),
          }));
        }
        break;
      case '@like':
      case '@containsLike':
      case '@beginsLike':
        {
          const subject = new AttributePath('$ss');
          // Slice at 1, to remove '$sf' added by updateFilterWithPrefix
          const elts = filter.subject.elements[0] && filter.subject.elements[0].name === '$sf'
            ? filter.subject.elements.slice(1) : filter.subject.elements;
          subject.elements.push(...elts);
          const map = {
            '@like': filters.equals,
            '@containsLike': filters.contains,
            '@beginsLike': filters.beginsWith,
          };
          const idx = entity.getIndexCls(index);
          out = map[filter.type](subject, idx.$normalize(filter.value));
        }
        break;
      default:
    }
  }
  return out;
}

class Query {
  constructor(fn) {
    this._entity = null;
    this._scanIndexForward = true;
    this._limit = 100;
    this._page = 1;
    this._pageSize = this._limit;
    this._skCondition = null;
    this._search = null;
    this._filters = [];
    this._projection = ['$id', '$kt'];
    this._continuationToken = null;
    this._using = { type: null };

    if (typeof fn === 'function') {
      const customFilters = fn(filters);
      if (customFilters) {
        if (Array.isArray(customFilters)) {
          this._filters = customFilters;
        } else {
          this._filters = [customFilters];
        }
      }
    }
  }

  clone() {
    const q = new Query();
    q._entity = this._entity;
    q._scanIndexForward = this._scanIndexForward;
    q._limit = this._limit;
    q._page = this._page;
    q._pageSize = this._pageSize;
    q._skCondition = this._skCondition;
    q._search = this._search;
    q._filters = [...this._filters];
    q._projection = this._projection;
    q._continuationToken = this._continuationToken;
    q._using = this._using;
    return q;
  }

  /**
   * Use index
   * @returns {Query}
   */
  usingIndex(name) {
    if (name === undefined) {
      return this;
    }

    this._using = {
      type: 'index',
      name,
    };
    return this;
  }

  usingRelation(name, id) {
    this._using = {
      type: 'relation',
      name,
      id,
    };
    return this;
  }

  /**
   * Set ascending sort
   * @returns {Query}
   */
  asc() {
    this._scanIndexForward = true;
    return this;
  }

  /**
   * Set descending sort
   * @returns {Query}
   */
  desc() {
    this._scanIndexForward = false;
    return this;
  }

  /**
   * Set limit
   * @param Int value
   * @returns {Query}
   */
  limit(value) {
    this._limit = value;
    return this;
  }

  page(value) {
    this._page = value;
    return this;
  }

  pageSize(value) {
    this._pageSize = value;
    return this;
  }

  sortKeyEquals(value) {
    this._skCondition = {
      type: 'Equals',
      object: value,
    };
    return this;
  }

  sortKeyNotEquals(value) {
    this._skCondition = {
      type: 'NotEquals',
      object: value,
    };
    return this;
  }

  sortKeyLessThan(value) {
    this._skCondition = {
      type: 'LessThan',
      object: value,
    };
    return this;
  }

  sortKeyLessThanOrEqualTo(value) {
    this._skCondition = {
      type: 'LessThanOrEqualTo',
      object: value,
    };
    return this;
  }

  sortKeyGreaterThan(value) {
    this._skCondition = {
      type: 'GreaterThan',
      object: value,
    };
    return this;
  }

  sortKeyGreaterThanOrEqualTo(value) {
    this._skCondition = {
      type: 'GreaterThanOrEqualTo',
      object: value,
    };
    return this;
  }

  sortKeyBetween(lowerBound, upperBound) {
    this._skCondition = {
      type: 'Between',
      lowerBound,
      upperBound,
    };
    return this;
  }

  sortKeyBeginsWith(prefix) {
    this._skCondition = {
      type: 'Function',
      name: 'begins_with',
      expected: prefix,
    };
    return this;
  }

  /**
   * Add filter
   * @param {string} filter
   */
  addFilter(...filter) {
    this._filters = [...this._filters, ...filter];
    return this;
  }

  /**
   * Set continuation token returned by query
   *
   * @returns {Query}
   */
  continuationToken(token) {
    this._continuationToken = token;
    return this;
  }

  async exec() {
    const {
      _entity: entity,
      _skCondition: skCondition,
      _scanIndexForward: scanIndexForward,
      _using: using,
      _projection: projection,
      _pageSize: pageSize,
      _limit: limit,
      _filters: filtersList,
    } = this;

    entity.setup(); // Ensure entity is setup
    const table = entity.$table;
    // Build key condition
    const keyCondition = {
      $kt: entity.$prefix,
    };
    let useProjectedFields = false;
    let usingIndex = null;
    switch ((using || {}).type) {
      case 'index':
        keyCondition.$kt = table.formatKey({
          entity: entity.$prefix,
          index: using.name,
        });
        useProjectedFields = true;
        usingIndex = using.name;
        break;
      case 'relation':
        {
          const rel = entity.$relations[using.name];
          if (!rel) {
            throw new Error(`relation: Invalid relation '${using.name}'`);
          }
          keyCondition.$kt = table.formatKey({
            entity: entity.$prefix,
            index: using.name,
            relation: rel.type.ensurePrefix(using.id),
          });
          useProjectedFields = true;
        }
        break;
      default:
    }

    if (skCondition) {
      // Sort key condition? add it
      keyCondition.$sk = skCondition;
    }

    let filter = null;
    if (filtersList && filtersList.length) {
      if (filtersList.length > 1) {
        filter = filters.and(...filtersList);
      } else {
        filter = filtersList[0];
      }
    }

    if (useProjectedFields) {
      filter = updateFilterWithPrefix(filter, '$sf.');
    }

    if (usingIndex) {
      filter = replaceSpecialFilters(filter, entity, usingIndex);
    }
    // console.log(JSON.stringify(filter, null, 2));
    // Request on table gsi
    const it = await table.mapper.query(entity, keyCondition, {
      indexName: table.config.indexName,
      pageSize,
      limit,
      projection,
      scanIndexForward,
      startKey:
        decodeContinuationToken(
          this._continuationToken,
          table.config.continuationTokenEncryptionKey,
        ),
      filter,
    });

    return it;
  }

  async find() {
    const {
      _entity: entity,
      _page: page,
      _pageSize: pageSize,
      _limit: limit,
    } = this;

    const it = await this.exec();
    for (let i = 0; i < pageSize * (page - 1); i++) {
      const item = await it.next(); // Pass pages
      if (item.done) break;
    }

    // Fetch keys
    const keys = [];
    for (let i = 0; i < Math.min(pageSize, limit); i++) {
      const item = await it.next();
      if (item.done) break;
      // eslint-disable-next-line new-cap
      keys.push(new entity(item.value.$id));
    }

    // Get Items
    const results = entity.$table.mapper.batchGet(keys);
    const items = [];
    for (let i = 0; ; i++) {
      // eslint-disable-next-line no-await-in-loop
      const r = await results.next();
      if (!r) break;
      const { value, done } = r;
      if (done) {
        break;
      }
      items.push(value);
    }

    // Force re-sort because batchGet seem do not preserve order
    const res = {
      items: items
        // eslint-disable-next-line no-nested-ternary
        .sort((a, b) => (this._scanIndexForward ? 1 : -1)
        // eslint-disable-next-line no-nested-ternary
        * (a.$sk === b.$sk ? 0 : a.$sk > b.$sk ? 1 : -1)),
      continuationToken: encodeContinuationToken(
        it.paginator.lastKey,
        entity.$table.config.continuationTokenEncryptionKey,
      ),
    };

    return res;
  }

  async count(max = 10000) {
    const q = this.clone();
    q.pageSize(1000);
    q.limit(max); // Hard limit :)
    q._projection = ['$id'];
    let count = 0;
    const it = await q.exec();
    for (;;) {
      const item = await it.next();
      if (item.done) break;
      count++;
    }
    return count;
  }
}

module.exports = Query;
