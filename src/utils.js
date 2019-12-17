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


function normalizeStr(str) {
  if (str instanceof Array) {
    str = str.join(' ');
  }
  str = String(str);
  const map = {
    à: 'a',
    á: 'a',
    â: 'a',
    ã: 'a',
    ä: 'a',
    å: 'a',
    ò: 'o',
    ó: 'o',
    ô: 'o',
    õ: 'o',
    ö: 'o',
    ø: 'o',
    è: 'e',
    é: 'e',
    ê: 'e',
    ë: 'e',
    ð: 'e',
    ç: 'c',
    Ð: 'D',
    ì: 'i',
    í: 'i',
    î: 'i',
    ï: 'i',
    ù: 'u',
    ú: 'u',
    û: 'u',
    ü: 'u',
    ñ: 'n',
    š: 's',
    ÿ: 'y',
    ý: 'y',
    ž: 'z',
  };
  // To lower case
  str = str.toLowerCase();
  // Strip accent
  str = str.replace(/[àáâãäåòóôõöøèéêëðçÐìíîïùúûüñšÿýž]/g, c => map[c]);
  // Removing extra whitespaces
  str = str.replace(/\s+/g, ' ');
  // Trim whitespaces
  str = str.trim();
  return str;
}


module.exports = {
  genId,
  iterateAwait,

  normalizeStr,
};
