/**
 * CED-ordered artwork list page.
 */

(function () {
  'use strict';

  let _allArtworks = [];
  let _selectedUnit = 'all';
  let _searchQuery = '';

  document.addEventListener('DOMContentLoaded', async function () {
    const listContainer = document.getElementById('artwork-list');
    if (!listContainer) return;

    try {
      await window.DataLoader.loadAll();
      _allArtworks = window.DataLoader.getArtworks()
        .slice()
        .sort(function (a, b) { return a.id - b.id; });

      setupUnitTabs(listContainer);
      applyFilters(listContainer);

      document.dispatchEvent(new CustomEvent('list:dataReady'));

      if (window.AppSearch) {
        window.AppSearch.init({
          onQueryChange: function (query) {
            _searchQuery = query || '';
            applyFilters(listContainer);
          },
          onSelect: function (artworkId) {
            window.location.href = window.ArtworkRender.artworkPageUrl(artworkId);
          }
        });
      }
    } catch (err) {
      console.error('List page initialization error:', err);
      listContainer.innerHTML = `
        <div class="list-error">
          <h2>Failed to load artworks</h2>
          <p>${err.message}</p>
        </div>
      `;
    }
  });

  function setupUnitTabs(container) {
    const nav = document.getElementById('list-unit-nav');
    if (!nav) return;

    nav.addEventListener('click', function (e) {
      const btn = e.target.closest('.unit-tab');
      if (!btn) return;

      _selectedUnit = btn.getAttribute('data-unit') || 'all';
      nav.querySelectorAll('.unit-tab').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      applyFilters(container);
    });
  }

  function resolveSelectedUnit() {
    if (_selectedUnit === 'all') return 'all';
    return parseInt(_selectedUnit, 10);
  }

  function applyFilters(container) {
    const filtered = window.ArtworkFilters.computeFilteredArtworks({
      selectedUnit: resolveSelectedUnit(),
      startDate: null,
      endDate: null,
      searchQuery: _searchQuery
    }).slice().sort(function (a, b) { return a.id - b.id; });

    renderList(container, filtered);
    updateStatusCounter(filtered.length);
  }

  function updateStatusCounter(count) {
    const el = document.getElementById('list-status-counter');
    if (el) {
      el.textContent = `Showing ${count} of 250 works`;
    }
  }

  function resolveAssetPath(src) {
    if (!src || /^https?:\/\//i.test(src) || src.startsWith('//')) return src;
    if (window.DataLoader && typeof window.DataLoader.resolveSitePath === 'function') {
      return window.DataLoader.resolveSitePath(src);
    }
    return src;
  }

  function renderList(container, artworks) {
    container.innerHTML = '';

    if (!artworks || artworks.length === 0) {
      container.innerHTML = '<div class="loading-note">No matching artworks found.</div>';
      return;
    }

    artworks.forEach(function (artwork) {
      const paddedId = window.ArtworkRender.padId(artwork.id);
      const images = window.DataLoader.getImagesForArtwork(artwork.id);
      const thumb = images[0];

      const card = document.createElement('article');
      card.className = 'artwork-list-card';
      card.id = `ced-${paddedId}`;

      const link = window.ArtworkRender.artworkPageUrl(artwork.id);

      card.innerHTML = `
        <a class="list-card-thumb" href="${link}" aria-label="View ${artwork.title}">
          <img src="${escapeAttr(resolveAssetPath(thumb.src))}" alt="${escapeAttr(thumb.alt || artwork.title)}" loading="lazy">
        </a>
        <div class="list-card-body">
          <div class="list-card-heading">
            <span class="list-card-ced">${paddedId}</span>
            <h2 class="list-card-title">
              <a href="${link}">${escapeHtml(artwork.title)}</a>
            </h2>
          </div>
          <dl class="list-card-attribution">
            <div><dt>Artist / Culture</dt><dd>${escapeHtml(window.ArtworkRender.formatArtistCulture(artwork))}</dd></div>
            <div><dt>Date</dt><dd>${escapeHtml(artwork.dateDisplay)}</dd></div>
            <div><dt>Medium</dt><dd>${escapeHtml(artwork.medium || '—')}</dd></div>
            <div><dt>Location</dt><dd>${escapeHtml(artwork.locationDisplay || '—')}</dd></div>
          </dl>
        </div>
      `;

      container.appendChild(card);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, '&#39;');
  }
})();
