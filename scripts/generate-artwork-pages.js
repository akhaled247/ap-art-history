/**
 * Generates standalone artwork detail pages at list/NNN/index.html (001–250).
 * Run: node scripts/generate-artwork-pages.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIST_DIR = path.join(ROOT, 'list');
const ARTWORKS_PATH = path.join(ROOT, 'data', 'artworks.json');

function padId(id) {
  return String(id).padStart(3, '0');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPageHtml(artwork) {
  const paddedId = padId(artwork.id);
  const title = escapeHtml(`${paddedId} - ${artwork.title}`);

  return `<!DOCTYPE html>
<html lang="en" class="standalone-artwork-page-html">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="../../">
  <title>${title}</title>
  <link rel="icon" href="images/favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="images/favicon.png">
  <link rel="stylesheet" href="css/styles.css">
</head>
<body class="standalone-artwork-page" data-artwork-id="${artwork.id}">

  <header class="app-header app-header--page" role="banner">
    <div class="header-top">
      <div class="brand-title">
        <h1>AP Art History</h1>
        <span class="badge">CED #${artwork.id}</span>
      </div>
      <div class="header-controls">
        <a href="map/" class="btn btn-subtle header-nav-link">Map</a>
        <a href="./" class="btn btn-subtle header-nav-link active" aria-current="page">Browse List</a>
        <a href="vocab/" class="btn btn-subtle header-nav-link">Vocabulary</a>
        <a href="network/" class="btn btn-subtle header-nav-link">Network</a>
      </div>
    </div>

    <div class="header-bottom">
      <nav class="artwork-page-nav" aria-label="Artwork navigation">
        <a id="nav-prev" href="#" class="artwork-nav-link">← Previous</a>
        <a href="./" class="artwork-nav-link artwork-nav-list">All Works</a>
        <a id="nav-next" href="#" class="artwork-nav-link">Next →</a>
      </nav>
    </div>
  </header>

  <main class="artwork-page-main" role="main">
    <article class="artwork-detail">
      <header class="artwork-detail-header">
        <span id="page-ced-tag" class="panel-ced-tag">CED #${artwork.id}</span>
        <h1 id="page-title" class="artwork-detail-title">${escapeHtml(artwork.title)}</h1>
      </header>

      <div class="panel-image-section">
        <div class="panel-image-display">
          <img id="page-image" src="images/placeholder/artwork-placeholder.svg" alt="Artwork Detail">
        </div>
        <div class="panel-image-controls" id="page-image-controls">
          <button id="page-img-prev" class="panel-image-btn" aria-label="Previous image">&lt;</button>
          <button id="page-img-next" class="panel-image-btn" aria-label="Next image">&gt;</button>
        </div>
        <div id="page-image-caption" class="panel-image-caption">Image source &amp; attribution</div>
      </div>

      <table class="panel-meta-table">
        <tbody>
          <tr>
            <th>Artist/Culture</th>
            <td id="page-meta-culture">—</td>
          </tr>
          <tr>
            <th>Date</th>
            <td id="page-meta-date">—</td>
          </tr>
          <tr>
            <th>Medium</th>
            <td id="page-meta-medium">—</td>
          </tr>
          <tr>
            <th>Location</th>
            <td id="page-meta-location">—</td>
          </tr>
          <tr>
            <th>Unit</th>
            <td id="page-meta-unit">—</td>
          </tr>
        </tbody>
      </table>

      <div id="page-affcc-container">
        <div class="loading-note">Loading study analysis...</div>
      </div>
    </article>
  </main>

  <script src="js/sticky-header.js"></script>
  <script src="js/data.js"></script>
  <script src="js/vocab-linker.js"></script>
  <script src="js/vocab-hovercard.js"></script>
  <script src="js/artwork-render.js"></script>
  <script src="js/artwork-page.js"></script>
</body>
</html>
`;
}

function removeLegacyRootPages() {
  for (let id = 1; id <= 250; id++) {
    const legacyDir = path.join(ROOT, padId(id));
    const legacyFile = path.join(legacyDir, 'index.html');
    if (fs.existsSync(legacyFile)) {
      fs.rmSync(legacyDir, { recursive: true, force: true });
    }
  }
}

function main() {
  const artworks = JSON.parse(fs.readFileSync(ARTWORKS_PATH, 'utf8'));

  if (artworks.length !== 250) {
    console.error(`Expected 250 artworks, found ${artworks.length}`);
    process.exit(1);
  }

  fs.mkdirSync(LIST_DIR, { recursive: true });
  removeLegacyRootPages();

  let generated = 0;

  for (const artwork of artworks) {
    if (typeof artwork.id !== 'number' || artwork.id < 1 || artwork.id > 250) {
      console.error(`Invalid artwork id: ${artwork.id}`);
      process.exit(1);
    }

    const dirName = padId(artwork.id);
    const dirPath = path.join(LIST_DIR, dirName);
    const filePath = path.join(dirPath, 'index.html');

    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(filePath, buildPageHtml(artwork), 'utf8');
    generated++;
  }

  console.log(`Generated ${generated} artwork pages (list/001/index.html – list/250/index.html).`);
}

main();
