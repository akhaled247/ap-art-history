/**
 * Resolve a thumbnail/full image URL from English Wikipedia (pageimages API).
 */
const https = require('https');

function fetchJson(url, attempt = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'APAH-Interactive-Map/1.0 (educational; contact: github.com/apah-map)' } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode === 429 && attempt < 4) {
          const wait = 2000 * (attempt + 1);
          return setTimeout(() => fetchJson(url, attempt + 1).then(resolve).catch(reject), wait);
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Wikipedia API non-JSON (${res.statusCode}): ${data.slice(0, 80)}`));
        }
      });
    }).on('error', reject);
  });
}

async function fetchWikipediaImage(articleTitle) {
  if (!articleTitle) return null;
  const titles = Array.isArray(articleTitle) ? articleTitle : [articleTitle];
  for (const title of titles) {
    try {
      const api =
        'https://en.wikipedia.org/w/api.php?action=query&titles=' +
        encodeURIComponent(title) +
        '&prop=pageimages&format=json&pithumbsize=1920';
      const json = await fetchJson(api);
      const page = json.query && json.query.pages ? Object.values(json.query.pages)[0] : null;
      if (!page || page.missing || !page.thumbnail) continue;
      return page.thumbnail.source;
    } catch (err) {
      console.warn(`Wikipedia lookup failed for "${title}":`, err.message);
    }
  }
  return null;
}

/** CED ID → English Wikipedia article title (fallback when Flickr album has no photo). */
const WIKIPEDIA_BY_CED = {
  58: ['Abbey Church of Saint Foy', 'Sainte-Foy Abbey', 'Conques'],
  59: 'Bayeux Tapestry',
  60: 'Chartres Cathedral',
  61: 'Bible moralisée',
  62: ['Rottgen Pieta', 'Röttgen Pietà'],
  64: 'Golden Haggadah',
  65: 'Alhambra',
  66: 'Mérode Altarpiece',
  68: 'Arnolfini Portrait',
  70: 'Palazzo Rucellai',
  71: 'Madonna and Child (Lippi)',
  72: 'The Birth of Venus',
  74: 'Adam and Eve (Dürer)',
  75: 'Sistine Chapel ceiling',
  79: 'Law and Gospel (Cranach)',
  80: 'Venus of Urbino',
  81: 'Codex Mendoza',
  82: 'Church of the Gesù',
  83: 'Hunters in the Snow',
  84: 'Selimiye Mosque',
  85: 'The Calling of Saint Matthew (Caravaggio)',
  86: 'The Presentation of the Portrait of Marie de\' Medici',
  87: 'Self-Portrait with Saskia',
  89: 'Ecstasy of Saint Teresa',
  90: 'Angel with Arquebus, Asiel Timor Dei',
  91: 'Las Meninas',
  92: 'Woman Holding a Balance',
  93: 'Palace of Versailles',
  95: 'Our Lady of Guadalupe',
  96: 'Fruit and Insects (Rachel Ruysch)',
  97: ['Casta (painting)', 'De español y india produce mestizo'],
  98: 'Marriage A-la-Mode: 2. The Tête à Tête'
};

/** Direct Commons filenames when Wikipedia pageimages is unavailable. */
const COMMONS_FILE_BY_CED = {
  62: 'Pietà Roettgen.jpg',
  83: 'Pieter Bruegel the Elder - Hunters in the Snow (Winter) - Google Art Project.jpg',
  84: 'Selimiye Mosque, Edirne, Turkey.jpg',
  85: 'Calling-of-st-matthew.jpg',
  87: 'Rembrandt - Self-Portrait with Saskia - WGA19077.jpg',
  90: 'Anónimo - Asiel Timor Dei. Arcángel arcabucero, c. 1680.jpg',
  96: 'Rachel Ruysch - Still-Life with Fruit and Insects - WGA20557.jpg',
  97: 'Spaniard and Indian Produce a Mestizo.jpg',
  250: 'Saint Luke Drawing the Virgin MFA Boston.jpg'
};

function commonsFilePathUrl(filename) {
  if (!filename) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename.replace(/ /g, '_'))}`;
}

module.exports = {
  fetchWikipediaImage,
  WIKIPEDIA_BY_CED,
  COMMONS_FILE_BY_CED,
  commonsFilePathUrl
};
