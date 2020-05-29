function K(ns, key) {
  return `${ns}/${key}`;
}

class State {
  constructor() {
    this._obj = {};
    this._objKeys = [];

    this._values = new Map();
    this._dirty = new Set();
  }

  initEntity(obj) {
    this._obj = obj;
    this._objKeys = Object.keys(obj.constructor.$schema);
    const keys = this._objKeys;
    for (let i = 0; i < keys.length; i++) {
      this.set('entity', keys[i], this._obj[keys[i]], true);
    }
  }

  reset(ns, key) {
    this._values.delete(K(ns, key));
    this._dirty.delete(K(ns, key));
  }

  clear() {
    this._values.clear();
    this._dirty.clear();
  }

  setDirty(ns, key) {
    this._dirty.add(K(ns, key));
  }

  isDirty(ns, key) {
    return this._dirty.has(K(ns, key));
  }

  set(ns, key, value, reset = false) {
    if (reset) {
      this.reset(ns, key);
    }
    if (this._values.has(K(ns, key)) && this.changed(ns, key, value)) {
      this.setDirty(key);
    }
    this._values.set(K(ns, key), JSON.stringify(value));
  }

  get(ns, key) {
    try {
      return JSON.parse(this._values.get(K(ns, key)));
    } catch (e) {
      return undefined;
    }
  }

  changed(ns, key, value = null) {
    if (!key) {
      const keys = this._objKeys;
      for (let i = 0; i < keys.length; i++) {
        if (this._dirty.has(K(ns, keys[i]))
        || JSON.stringify(this._obj[keys[i]]) !== this._values.get(K(ns, keys[i]))) {
          return true;
        }
      }
      return false;
    }
    return this._dirty.has(K(ns, key)) || JSON.stringify(value) !== this._values.get(K(ns, key));
  }

  print(msg) {
    console.log(`\n----- STATE ${msg || ''} -----`);
    console.log('VALUES:');
    this._values.forEach((v, k) => {
      console.log(` - [${k}]: ${v}`);
    });
    console.log('DIRTY:');
    console.log(Array.from(this._dirty));
    console.log('===================\n');
  }
}

module.exports = State;
