/**
 * Interactive World Map View.
 * Uses Leaflet with an offline physical world relief image overlay (no political borders),
 * custom numbered CED markers, proximity spiderfying/clustering, and unit geographic highlighting.
 */

window.AppMap = (function () {
  'use strict';

  let _map = null;
  let _markerClusterGroup = null;
  let _markersMap = new Map(); // id -> L.marker
  let _unitHighlightLayer = null;

  const WORLD_BOUNDS = [[-85, -180], [85, 180]];

  function init() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    // Initialize Leaflet map
    _map = L.map('map', {
      center: [20, 0],
      zoom: 3,
      minZoom: 2,
      maxZoom: 10,
      maxBounds: [[-85, -190], [85, 190]],
      maxBoundsViscosity: 0.8,
      attributionControl: true
    });

    // Add physical / shaded relief terrain base map with NO political borders
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 8,
      attribution: 'Tiles &copy; Esri &mdash; Source: US National Park Service, USGS'
    }).addTo(_map);

    // Marker cluster group configured for expanding (spiderfying) grouped works on click
    const clusterRadius = window.matchMedia('(max-width: 1024px)').matches ? 50 : 35;
    _markerClusterGroup = L.markerClusterGroup({
      maxClusterRadius: clusterRadius,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      spiderfyDistanceMultiplier: 1.8,
      iconCreateFunction: function (cluster) {
        const count = cluster.getChildCount();
        let sizeClass = 'marker-cluster-small';
        if (count >= 10) sizeClass = 'marker-cluster-medium';
        if (count >= 25) sizeClass = 'marker-cluster-large';

        return L.divIcon({
          html: `<div><span>${count}</span></div>`,
          className: `marker-cluster ${sizeClass}`,
          iconSize: L.point(32, 32)
        });
      }
    });

    // Expand / spiderfy clusters outward on click instead of zooming in
    _markerClusterGroup.on('clusterclick', function (a) {
      a.layer.spiderfy();
    });

    _map.addLayer(_markerClusterGroup);

    // Layer group for unit geographic highlight circles
    _unitHighlightLayer = L.layerGroup().addTo(_map);

    // Handle clicks outside markers to clear preview card
    _map.on('click', function () {
      if (window.AppState) {
        window.AppState.setHoveredArtwork(null);
      }
    });

    // Subscribe to state events
    window.AppState.on('filter:change', updateMarkers);
    window.AppState.on('artwork:select', highlightSelectedMarker);
    window.AppState.on('unit:change', updateUnitHighlight);

    console.log('AppMap initialized.');
  }

  /**
   * Updates map markers to reflect current filtered artworks list.
   * Preserves current viewport without auto-zooming (spec section 22).
   */
  function updateMarkers(filteredArtworks) {
    if (!_map || !_markerClusterGroup) return;

    _markerClusterGroup.clearLayers();
    _markersMap.clear();

    const selectedId = window.AppState.getState().selectedArtworkId;

    filteredArtworks.forEach(art => {
      if (art.latitude === null || art.longitude === null) return;

      const isSelected = art.id === selectedId;
      const markerIcon = createNumberedIcon(art.id, isSelected);

      const marker = L.marker([art.latitude, art.longitude], {
        icon: markerIcon,
        title: `${art.id}. ${art.title}`,
        keyboard: true,
        riseOnHover: true
      });

      const hoverCapable = window.matchMedia('(hover: hover)').matches;

      if (hoverCapable) {
        marker.on('mouseover', function (e) {
          if (window.ArtworkPanel && window.ArtworkPanel.cancelHideHoverCard) {
            window.ArtworkPanel.cancelHideHoverCard();
          }
          showHoverPreview(art, e);
        });

        marker.on('mouseout', function () {
          if (window.ArtworkPanel && window.ArtworkPanel.scheduleHideHoverCard) {
            window.ArtworkPanel.scheduleHideHoverCard();
          } else {
            window.AppState.setHoveredArtwork(null);
          }
        });
      }

      marker.on('focus', function (e) {
        showHoverPreview(art, e);
      });

      marker.on('blur', function (e) {
        const related = e.originalEvent && e.originalEvent.relatedTarget;
        const hoverCard = document.getElementById('hover-preview-card');
        if (related && hoverCard && hoverCard.contains(related)) return;
        window.AppState.setHoveredArtwork(null);
      });

      // Click / enter interaction: Open full detail panel
      marker.on('click', function (e) {
        L.DomEvent.stopPropagation(e);
        window.AppState.selectArtwork(art.id);
      });

      marker.on('keypress', function (e) {
        if (e.originalEvent.key === 'Enter' || e.originalEvent.key === ' ') {
          window.AppState.selectArtwork(art.id);
        }
      });

      _markersMap.set(art.id, marker);
      _markerClusterGroup.addLayer(marker);
    });

    // Update status counter in header
    const counterEl = document.getElementById('status-counter');
    if (counterEl) {
      counterEl.textContent = `Showing ${filteredArtworks.length} of 250 works`;
    }

    updateUnitHighlight();
  }

  function createNumberedIcon(id, isSelected) {
    const selectedClass = isSelected ? ' active-selected' : '';
    return L.divIcon({
      className: 'custom-div-icon',
      html: `<button class="artwork-marker${selectedClass}" aria-label="Artwork #${id}" tabindex="0">${id}</button>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
  }

  function showHoverPreview(artwork, event) {
    if (!event) return;
    const containerPoint = _map.latLngToContainerPoint([artwork.latitude, artwork.longitude]);
    window.AppState.setHoveredArtwork(artwork.id, {
      x: containerPoint.x,
      y: containerPoint.y
    });
  }

  /**
   * Highlights selected marker and gently pans without resetting zoom level.
   */
  function highlightSelectedMarker(id) {
    if (!id || !_markersMap.has(id)) return;

    const marker = _markersMap.get(id);
    const artwork = window.DataLoader.getArtworkById(id);
    if (!artwork || artwork.latitude === null || artwork.longitude === null) return;

    // Pan gently to marker if out of view
    _map.panTo([artwork.latitude, artwork.longitude], {
      animate: true,
      duration: 0.5
    });

    // Refresh marker icons
    _markersMap.forEach((m, mId) => {
      m.setIcon(createNumberedIcon(mId, mId === id));
    });
  }

  /**
   * Subtle geographic area highlight for the active unit preset (spec section 23)
   */
  function updateUnitHighlight() {
    if (!_unitHighlightLayer) return;
    _unitHighlightLayer.clearLayers();

    const state = window.AppState.getState();
    const unitId = state.selectedUnit;
    if (unitId === 'all') return;

    const unit = window.DataLoader.getUnitById(unitId);
    const unitColor = unit ? unit.color : '#802b2b';

    const unitWorks = window.DataLoader.getArtworks().filter(a => a.unit === unitId);
    unitWorks.forEach(w => {
      if (w.latitude === null || w.longitude === null) return;
      const circle = L.circle([w.latitude, w.longitude], {
        radius: 350000, // Subtle geographic beacon radius
        color: unitColor,
        fillColor: unitColor,
        fillOpacity: 0.12,
        weight: 1,
        opacity: 0.35,
        interactive: false
      });
      _unitHighlightLayer.addLayer(circle);
    });
  }

  function invalidateSize() {
    if (_map) {
      _map.invalidateSize();
    }
  }

  return {
    init,
    updateMarkers,
    highlightSelectedMarker,
    invalidateSize
  };
})();
