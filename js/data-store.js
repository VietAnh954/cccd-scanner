'use strict';

const store = (() => {
  let records = [];
  let nextId = 1;

  return {
    add(record) {
      records.push({ ...record, _id: nextId++ });
    },

    remove(cccd) {
      records = records.filter(r => r.cccd !== cccd);
    },

    clear() {
      records = [];
      nextId = 1;
    },

    has(cccd) {
      return records.some(r => r.cccd === cccd);
    },

    count() {
      return records.length;
    },

    getAll() {
      return records.map((r, i) => ({ ...r, stt: i + 1 }));
    },
  };
})();

window.store = store;
