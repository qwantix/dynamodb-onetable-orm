const v4 = require('uuid/v4');

function genId() {
  return v4(null, Buffer.from(new Array(16))).toString('base64')
    .replace(/\+/g, 'Aa')
    .replace(/\//g, '00')
    .replace('==', '');
}

async function iterateAwait(it, handler) {
  for (let i = 0; ; i++) {
    // eslint-disable-next-line no-await-in-loop
    const r = await it.next();
    if (!r) break;
    const {
      value,
      done,
    } = r;
    if (done) {
      break;
    }
    if (handler(value, i) === false) {
      break;
    }
  }
}


module.exports = {
  genId,
  iterateAwait,
};
