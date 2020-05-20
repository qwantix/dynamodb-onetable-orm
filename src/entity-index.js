const Row = require('./row');

let classCache = {};

function clearCache() {
  classCache = {};
}

function getNormalizer(normalizers) {
  // eslint-disable-next-line no-shadow
  let normalizer = v => v;
  if (normalizers) {
    if (!(normalizers instanceof Array)) {
      normalizers = [normalizers];
    }

    normalizer = [...normalizers].reverse().reduce((($next, fn) => {
      if (typeof fn === 'function') {
        return v => String(fn.bind(this, $next(v)));
      }
      switch (fn) {
        case 'ci': // case insensitive
        case 'lower':
        case 'lowercase':
          return v => $next(String(v).toLowerCase());
        case 'upper':
        case 'uppercase':
          return v => $next(String(v).toUpperCase());
        case 'trim':
          return v => $next(String(v).trim());
        case 'no-extra-whitespaces':
          return v => $next(String(v).replace(/\s+/g, ' '));
        case 'ascii-only':
          return v => $next(String(v).replace(/\W+/g, ' '));
        case 'no-accent':
        case 'no-accents':
          // https://stackoverflow.com/questions/990904/remove-accents-diacritics-in-a-string-in-javascript
          return v => $next(String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '')); // Strip accenets
        default:
          return v => $next(v); // Do nothing
      }
    }), normalizer);
  }
  return normalizer;
}

function getSearchParams({ search, include }) {
  let fields;
  let normalizer = getNormalizer();
  if (search) {
    if (search === true) {
      // do nothing
    } else if (search instanceof Array) {
      fields.push(search);
    } else if (typeof search === 'object') {
      fields = search.fields;
      normalizer = getNormalizer(search.normalizer);
    }

    if (!fields || fields.length === 0) {
      fields = [...include];
    }
  }

  return {
    fields,
    normalizer,
  };
}

class Index extends Row {
  constructor() {
    super();
    this._$sf = {};
  }

  /**
   * Search string
   */
  get $ss() {
    const {
      fields,
      normalizer,
    } = this.constructor.$params.search;

    const ss = new Map();
    for (let i = 0; i < fields.length; i++) {
      const k = fields[i];
      const v = normalizer(this.$sf[k]);
      ss.set(k, v);
    }
    return ss || undefined;
  }

  set $ss(_value) {
    // this
  }

  get $sf() {
    return this._$sf;
  }

  set $sf(value) {
    this._$sf = value;
  }
}

function getIndexParams(from, name) {
  const indexes = from.$indexes;
  let include = [];
  let data = '';
  let search = '';
  let relations = [];

  if (indexes[name] === true) {
    data = name;
  } else if (typeof indexes[name] === 'object') {
    ({
      include,
      data,
      search,
      relations,
    } = indexes[name]);
  } else {
    throw new Error(`Unknow index '${name}'`);
  }

  return {
    include: include || [],
    data,
    search,
    relations,
  };
}

function getIndexCls(from, name) {
  const prefix = from.$prefix;
  const key = `${prefix}:${name}`;
  if (!classCache[key]) {
    const {
      include,
      search,
      relations,
    } = getIndexParams(from, name);

    const table = from.$table;
    const includeSet = new Set(include);
    const sch = Object.keys(from.$schema)
      .reduce((o, k) => {
        if (includeSet.has(k)) {
          o.$sf.members[k] = from.$schema[k];
        }
        return o;
      }, {
        $sf: {
          type: 'Document',
          members: {},
        },
      });

    if (search) {
      sch.$ss = {
        type: 'Map',
        memberType: { type: 'String' },
      };
    }
    if (relations) {
      sch.$rl = {
        type: 'Set',
        memberType: 'String',
      };
    }

    const searchParams = getSearchParams({ include, search });

    const I = class extends Index {
      static get $params() {
        return {
          include,
          search: searchParams,
          relations,
        };
      }

      static get $table() {
        return table;
      }

      static get $prefix() {
        return prefix;
      }

      static get $schema() {
        return sch;
      }

      static $normalize(value) {
        return searchParams.normalizer(value);
      }
    };
    I.setup();
    classCache[key] = I;
  }
  return classCache[key];
}

function newIndex(from, name) {
  const I = getIndexCls(from, name);
  return new I();
}

module.exports = {
  Index,
  newIndex,
  getIndexCls,
  getIndexParams,
  clearCache,
};
