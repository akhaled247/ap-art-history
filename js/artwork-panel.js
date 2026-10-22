/**
 * Artwork Information Side Panel & Hover Preview Card.
 * Manages image carousels, metadata rendering, and AFFCC study notes.
 */

window.ArtworkPanel = (function () {
  'use strict';

  // Hover Card DOM
  let _hoverCard = null;
  let _hoverImg = null;
  let _hoverPrevBtn = null;
  let _hoverNextBtn = null;
  let _hoverImages = [];
  let _hoverImageIndex = 0;
  let _activeHoverArtworkId = null;
  let _hoverHideTimer = null;

  // Panel DOM
  let _panel = null;
  let _panelCedTag = null;
  let _panelTitle = null;
  let _panelCloseBtn = null;
  let _panelImage = null;
  let _panelImagePrev = null;
  let _panelImageNext = null;
  let _panelImageCaption = null;
  let _panelImageControls = null;
  let _metaCulture = null;
  let _metaDate = null;
  let _metaMedium = null;
  let _metaLocation = null;
  let _metaUnit = null;
  let _affccContainer = null;
  let _panelImageLink = null;
  let _panelCarousel = null;

  function init() {
    // Hover elements
    _hoverCard = document.getElementById('hover-preview-card');
    _hoverImg = document.getElementById('hover-img');
    _hoverPrevBtn = document.getElementById('hover-prev-btn');
    _hoverNextBtn = document.getElementById('hover-next-btn');

    // Panel elements
    _panel = document.getElementById('artwork-panel');
    _panelCedTag = document.getElementById('panel-ced-tag');
    _panelTitle = document.getElementById('panel-title');
    _panelCloseBtn = document.getElementById('panel-close-btn');
    _panelImage = document.getElementById('panel-image');
    _panelImageLink = document.getElementById('panel-image-link');
    _panelImagePrev = document.getElementById('panel-img-prev');
    _panelImageNext = document.getElementById('panel-img-next');
    _panelImageCaption = document.getElementById('panel-image-caption');
    _panelImageControls = document.getElementById('panel-image-controls');
    _metaCulture = document.getElementById('panel-meta-culture');
    _metaDate = document.getElementById('panel-meta-date');
    _metaMedium = document.getElementById('panel-meta-medium');
    _metaLocation = document.getElementById('panel-meta-location');
    _metaUnit = document.getElementById('panel-meta-unit');
    _affccContainer = document.getElementById('panel-affcc-container');

    setupHoverCardEvents();
    setupPanelEvents();

    // Subscribe to state changes
    window.AppState.on('artwork:hover', function (data) {
      if (data.id) {
        showHoverCard(data.id, data.coordinates);
      } else {
        hideHoverCard();
      }
    });

    window.AppState.on('artwork:select', function (id) {
      if (id) {
        openPanel(id);
      } else {
        closePanel();
      }
    });

    console.log('ArtworkPanel initialized.');
  }

  /* ========================================================================
     Hover Preview Card (Spec Section 11 & 12)
     ======================================================================== */

  function setupHoverCardEvents() {
    if (!_hoverCard) return;

    _hoverCard.addEventListener('click', function () {
      if (_activeHoverArtworkId) {
        window.AppState.selectArtwork(_activeHoverArtworkId);
        hideHoverCard();
      }
    });

    if (_hoverPrevBtn) {
      _hoverPrevBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        cycleHoverImage(-1);
      });
    }

    if (_hoverNextBtn) {
      _hoverNextBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        cycleHoverImage(1);
      });
    }

    _hoverCard.addEventListener('mouseenter', cancelHideHoverCard);
    _hoverCard.addEventListener('mouseleave', function () {
      window.AppState.setHoveredArtwork(null);
    });
  }

  function scheduleHideHoverCard() {
    clearTimeout(_hoverHideTimer);
    _hoverHideTimer = setTimeout(function () {
      window.AppState.setHoveredArtwork(null);
    }, 150);
  }

  function cancelHideHoverCard() {
    clearTimeout(_hoverHideTimer);
  }

  function showHoverCard(artworkId, point) {
    if (!_hoverCard || !window.DataLoader) return;
    const artwork = window.DataLoader.getArtworkById(artworkId);
    if (!artwork) return;

    cancelHideHoverCard();
    _activeHoverArtworkId = artwork.id;
    _hoverImages = window.DataLoader.getImagesForArtwork(artwork.id);
    _hoverImageIndex = 0;

    updateHoverImageDisplay();

    // Show or hide carousel arrows depending on image count
    if (_hoverImages.length > 1) {
      _hoverPrevBtn.style.display = 'flex';
      _hoverNextBtn.style.display = 'flex';
    } else {
      _hoverPrevBtn.style.display = 'none';
      _hoverNextBtn.style.display = 'none';
    }

    const mapContainer = document.querySelector('.map-container');
    if (!mapContainer) return;
    const mapBox = mapContainer.getBoundingClientRect();
    const cardW = Math.min(250, mapBox.width - 20);
    const cardH = 195;
    const narrow = mapBox.width < 480;

    let left;
    let top;
    if (narrow) {
      left = (mapBox.width - cardW) / 2;
      top = Math.min(point.y + 12, mapBox.height - cardH - 12);
    } else {
      left = point.x + 15;
      top = point.y - 85;
      if (left + cardW + 10 > mapBox.width) left = point.x - cardW - 15;
      if (top + cardH > mapBox.height) top = mapBox.height - cardH - 10;
    }
    if (top < 10) top = 10;
    if (left < 10) left = 10;
    if (left + cardW > mapBox.width - 10) left = mapBox.width - cardW - 10;

    _hoverCard.style.width = cardW + 'px';

    _hoverCard.style.left = `${left}px`;
    _hoverCard.style.top = `${top}px`;
    _hoverCard.classList.add('visible');
    _hoverCard.setAttribute('aria-hidden', 'false');
  }

  function hideHoverCard() {
    if (!_hoverCard) return;
    cancelHideHoverCard();
    _hoverCard.classList.remove('visible');
    _hoverCard.setAttribute('aria-hidden', 'true');
    _activeHoverArtworkId = null;
  }

  function cycleHoverImage(delta) {
    if (_hoverImages.length <= 1) return;
    _hoverImageIndex = (_hoverImageIndex + delta + _hoverImages.length) % _hoverImages.length;
    updateHoverImageDisplay();
  }

  function updateHoverImageDisplay() {
    if (_hoverImages.length === 0) return;
    const imgObj = _hoverImages[_hoverImageIndex];
    _hoverImg.src = imgObj.src;
    _hoverImg.alt = imgObj.alt || 'Artwork image';
  }

  /* ========================================================================
     Full Artwork Side Panel (Spec Section 13, 14, 18)
     ======================================================================== */

  function setupPanelEvents() {
    if (_panelCloseBtn) {
      _panelCloseBtn.addEventListener('click', function () {
        window.AppState.selectArtwork(null);
      });
    }

    _panelCarousel = window.ArtworkRender.bindImageCarousel({
      imgEl: _panelImage,
      captionEl: _panelImageCaption,
      controlsEl: _panelImageControls,
      prevBtn: _panelImagePrev,
      nextBtn: _panelImageNext
    });

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        hideHoverCard();
        if (_panel && _panel.classList.contains('open')) {
          window.AppState.selectArtwork(null);
        }
      }
    });
  }

  async function openPanel(artworkId) {
    if (!_panel || !window.DataLoader) return;
    const artwork = window.DataLoader.getArtworkById(artworkId);
    if (!artwork) return;

    hideHoverCard();

    const pageUrl = window.ArtworkRender.artworkPageUrl(artwork.id);

    _panelCedTag.href = pageUrl;
    _panelCedTag.textContent = `CED #${artwork.id}`;
    _panelTitle.href = pageUrl;
    _panelTitle.textContent = artwork.title;
    if (_panelImageLink) _panelImageLink.href = pageUrl;
    if (_panelImageCaption) _panelImageCaption.href = pageUrl;

    window.ArtworkRender.populateMetadata(artwork, {
      culture: _metaCulture,
      date: _metaDate,
      medium: _metaMedium,
      location: _metaLocation,
      unit: _metaUnit
    });

    if (_panelCarousel) {
      _panelCarousel.setImages(window.DataLoader.getImagesForArtwork(artwork.id));
    }

    _affccContainer.innerHTML = '<div style="padding:12px; color:#777;">Loading study analysis...</div>';
    const affcc = await window.DataLoader.loadAffccContent(artwork.id);
    await window.DataLoader.loadVocabulary();
    const linkOptions = {
      wordMap: window.VocabLinker
        ? window.VocabLinker.getWordMap(window.DataLoader.getVocabulary())
        : null,
      basePath: 'vocab/'
    };
    window.ArtworkRender.renderAffccContent(_affccContainer, affcc, artwork, linkOptions);

    _panel.classList.add('open');
    _panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('artwork-panel-open');
    if (window.AppMap && typeof window.AppMap.invalidateSize === 'function') {
      window.requestAnimationFrame(function () {
        window.AppMap.invalidateSize();
      });
    }
  }

  function closePanel() {
    if (!_panel) return;
    _panel.classList.remove('open');
    _panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('artwork-panel-open');
    if (window.AppMap && typeof window.AppMap.invalidateSize === 'function') {
      window.requestAnimationFrame(function () {
        window.AppMap.invalidateSize();
      });
    }
  }

  return {
    init,
    openPanel,
    closePanel,
    showHoverCard,
    hideHoverCard,
    scheduleHideHoverCard,
    cancelHideHoverCard
  };
})();
