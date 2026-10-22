# AP Art History: Interactive Map & Timeline

A static, educational web visualization of the 98/250 required works in the AP Art History curriculum. Designed for classroom exploration, study, and reference, allowing students and educators to explore artworks chronologically and geographically.

> **Note on Progress Count (`X/250 Required Works`):** Wherever "X/250 Required Works" appears (such as in `index.html` and documentation), `X` represents the count of artworks that have been updated with complete notes/analyses out of the total 250 required works.

---

## 1. Project Overview

This website is a fully static client-side web application deployable directly through **GitHub Pages**. It operates completely from static files (`HTML`, `CSS`, `JavaScript`, `JSON`, `Markdown`, `SVG`) with:
* **No runtime backend or database server**
* **No runtime AI API dependencies or secrets**
* **No authentication or server-side execution**
* **No heavy frontend framework overhead** (pure vanilla JavaScript and Leaflet for mapping)

---

## 2. Disclaimer

*This project is an independent educational tool developed for instructional and study purposes. It is not affiliated with, endorsed by, or sponsored by the College Board. "AP" and "Advanced Placement" are registered trademarks of the College Board.*

---

## 3. Repository Architecture

```text
/
├── index.html                  # Browse list (home)
├── map/index.html              # Interactive map & timeline
├── package.json                # Project metadata and validation scripts
├── LICENSE                     # MIT License
├── README.md                   # Project documentation
│
├── css/
│   ├── styles.css              # Main academic/minimalist stylesheet
│   └── vendor/                 # Vendored CSS (Leaflet, MarkerCluster)
│       ├── leaflet.css
│       └── MarkerCluster.css
│
├── js/
│   ├── app.js                  # Application initialization & bootstrap
│   ├── state.js                # Centralized state management & event bus
│   ├── data.js                 # Static JSON & markdown loader layer
│   ├── dateUtils.js            # Universal date normalization & timeline math
│   ├── filters.js              # Chronological overlap, unit & search filtering
│   ├── map.js                  # Leaflet map, physical overlay & marker clusters
│   ├── timeline.js             # Dual-handle draggable timeline & tick system
│   ├── search.js               # Client-side instant typeahead search
│   ├── artwork-panel.js        # Hover preview card & detailed slide-in panel
│   ├── random.js               # Random artwork discovery control
│   └── vendor/                 # Vendored scripts (Leaflet, MarkerCluster)
│       ├── leaflet.js
│       └── leaflet.markercluster.js
│
├── data/
│   ├── artworks.json           # Canonical dataset for all 250 works
│   ├── units.json              # 10 official AP Art History units
│   ├── images.json             # Image manifest & source attributions
│   └── source/
│       ├── notes.md            # Data authority hierarchy documentation
│       ├── needs-review.md     # Audit notes & items flagged for review
│       └── unit-01-global-prehistory.md # Archived Unit 1 owner notes
│
├── content/
│   └── affcc/                  # Markdown files for each artwork (001.md – 250.md)
│       ├── 001.md
│       ├── 002.md
│       └── ...
│
├── images/
│   ├── map/                    # Physical relief world map (no political borders)
│   │   └── world-physical.svg
│   └── placeholder/            # Default artwork placeholder SVG
│       └── artwork-placeholder.svg
│
├── scripts/
│   ├── build-dataset.js        # Compiles canonical JSON dataset
│   ├── generate-affcc.js       # Parses owner notes into structured AFFCC markdown
│   ├── generate-world-svg.js   # Generates physical world map vector asset
│   └── validate-data.js        # Comprehensive validation suite (Section 28)
│
└── .github/
    └── workflows/
        └── pages.yml           # GitHub Actions static Pages deployment workflow
```

---

## 4. Artwork Data Model

Every artwork in `data/artworks.json` follows this schema:

```json
{
  "id": 5,
  "title": "Beaker with ibex motifs",
  "artist": null,
  "culture": "Susa (Ancient Near East / Elamite)",
  "dateDisplay": "4200–3500 BCE",
  "dateStart": -4200,
  "dateEnd": -3500,
  "dateMidpoint": -3850,
  "medium": "Painted terra cotta",
  "locationDisplay": "Susa, Iran",
  "latitude": 32.189,
  "longitude": 48.257,
  "locationPrecision": "site",
  "unit": 1,
  "dataConfidence": "owner_notes",
  "affccStatus": "complete",
  "sourceUrl": "https://smarthistory.org/bushel-with-ibex-motifs/"
}
```

### Key Principles:
* **Stable CED Identifiers**: The official CED item number (`1..250`) is the primary key.
* **Normalized Numerical Dates**: BCE is negative; CE is positive. Full ranges are preserved for overlap-based filtering.
* **Geographic Accuracy**: Coordinates represent original historical/archaeological sites or regions of origin, not modern museum repositories.

---

## 5. Adding and Managing Images

Images are managed declaratively through `data/images.json` (the image manifest):

```json
{
  "id": 5,
  "title": "Beaker with ibex motifs",
  "images": [
    {
      "src": "images/placeholder/artwork-placeholder.svg",
      "alt": "Beaker with ibex motifs (4200–3500 BCE)",
      "source": "Smarthistory guide: https://smarthistory.org/bushel-with-ibex-motifs/",
      "local": true
    }
  ]
}
```

* **External URLs**: You can replace `"src"` with any direct CDN or image URL.
* **Local Files**: Store images under `images/005/photo.jpg` and set `"src": "images/005/photo.jpg"`.
* **Multiple Images**: Add multiple objects to the `"images"` array to activate the carousel.

### Flickr album pipeline (Units 2–3)

Steven Zucker’s [AP Art History Flickr album](https://www.flickr.com/photos/profzucker/albums/72157648851606647/) is the primary source for multi-image carousels (Unit 2: CED 12–47; Unit 3: CED 48–98).

```bash
# Unit 3: scrape album → map photo IDs → resolve URLs (Flickr + Wikimedia fallbacks)
npm run update-images:unit3

# Re-map / re-resolve only (skip re-scrape)
node scripts/update-unit3-images.js --skip-scrape

# Fix remaining placeholders after a partial run
node scripts/patch-unit3-missing-images.js
```

Data files: `data/flickr-album-scraped.json`, `data/flickr-unit3-ids.json`, optional overrides in `data/flickr-unit3-manual.json`.

---

## 6. How to Add Source Notes & Generate AFFCC Content

The application uses a 3-level authority model:
1. **Level 1 (CED Metadata)**: Official Course & Exam Description metadata.
2. **Level 2 (Owner Notes)**: Raw notes provided in Markdown or Word.
3. **Level 3 (AI Organization)**: Build-time formatting into clean educational prose without inventing unsupported details.

### Workflow:
1. Place the new notes file in the project (e.g., `data/source/unit-02-ancient-mediterranean.md`).
2. Run the parser script:
   ```bash
   node scripts/generate-affcc.js
   ```
3. The script matches artworks by their CED number (`1..250`) and updates the corresponding `content/affcc/0XX.md` files while keeping all other files intact.
4. Run validation:
   ```bash
   npm run validate
   ```

---

## 7. Validating the Dataset

To ensure dataset integrity before committing or deploying:

```bash
npm run validate
```

The validation suite verifies:
* Exactly 250 artworks are present (IDs 1 through 250).
* No duplicate or missing IDs.
* Every artwork has valid titles, units (1–10), and normalized dates.
* Every artwork has geographic coordinates within valid latitude/longitude bounds.
* Every artwork has an image manifest entry.
* Every artwork has an existing AFFCC markdown content file.

---

## 8. Running Locally

Because the application fetches static JSON and Markdown files via `fetch()`, run it with a local HTTP server:

```bash
# Using Python
python -m http.server 8000

# Or using Node (npx)
npx serve .
```

Then open `http://localhost:8000` for the browse list, or `http://localhost:8000/map/` for the interactive map.

---

## 9. Deploying to GitHub Pages

1. Push the repository to GitHub:
   ```bash
   git push origin main
   ```
2. In your GitHub repository settings:
   - Navigate to **Settings** &rarr; **Pages**.
   - Under **Build and deployment** &rarr; **Source**, select **GitHub Actions**.
3. The included workflow `.github/workflows/pages.yml` automatically validates the dataset and deploys the site on every push to `main`.

---

## 10. Updating the CED Dataset in Future Academic Years

If College Board updates the 250 required works in a future academic year:
1. Update the entries in `scripts/build-dataset.js` with the new CED numbers, titles, and units.
2. Run:
   ```bash
   node scripts/build-dataset.js
   node scripts/generate-affcc.js
   npm run validate
   ```
3. Commit and push the updated repository.
