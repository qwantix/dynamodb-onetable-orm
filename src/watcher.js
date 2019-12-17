class ChangeWatcher {
  constructor() {
    this._values = new Map();
    this._dirty = new Set();
  }

  reset(key) {
    this._values.delete(key);
    this._dirty.delete(key);
  }

  clear() {
    this._values.clear();
    this._dirty.clear();
  }

  setDirty(key) {
    this._dirty.add(key);
  }

  isDirty(key) {
    return this._dirty.has(key);
  }

  set(key, value, reset = false) {
    if (reset) {
      this.reset(key);
    }
    if (this._values.has(key) && this.changed(key, value)) {
      this.setDirty(key);
    }
    this._values.set(key, JSON.stringify(value));
  }

  get(key) {
    try {
      return JSON.parse(this._values.get(key));
    } catch (e) {
      return undefined;
    }
  }

  changed(key, value = null) {
    return this._dirty.has(key) || JSON.stringify(value) !== this._values.get(key);
  }
}

module.exports = ChangeWatcher;
