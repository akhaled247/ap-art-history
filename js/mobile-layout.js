/**
 * Mobile layout: header nav toggle, measured chrome heights for map, map resize hooks.
 */
(function () {
  'use strict';

  const COMPACT_MAX_PX = 1024;
  const COMPACT_MQ = window.matchMedia('(max-width: ' + COMPACT_MAX_PX + 'px)');

  function isCompactLayout() {
    const header = document.querySelector('.app-header');
    if (header && header.offsetWidth > 0 && header.offsetWidth <= COMPACT_MAX_PX) {
      return true;
    }
    return COMPACT_MQ.matches;
  }

  function invalidateMap() {
    if (window.AppMap && typeof window.AppMap.invalidateSize === 'function') {
      window.AppMap.invalidateSize();
    }
  }

  function setChromeHeights() {
    const header = document.querySelector('.app-header');
    const timeline = document.querySelector('.app-timeline');
    const root = document.documentElement;

    if (header) {
      root.style.setProperty('--measured-header-height', header.offsetHeight + 'px');
    }
    if (timeline && timeline.offsetParent !== null) {
      root.style.setProperty('--measured-timeline-height', timeline.offsetHeight + 'px');
    } else {
      const wrap = document.querySelector('.app-timeline-wrap');
      const summary = wrap && wrap.querySelector('.app-timeline-summary');
      const summaryH = summary ? summary.offsetHeight : 0;
      root.style.setProperty('--measured-timeline-height', summaryH + 'px');
    }
    invalidateMap();
  }

  function initChromeObserver() {
    if (!document.body.classList.contains('map-page')) return;

    const header = document.querySelector('.app-header');
    const timelineWrap = document.querySelector('.app-timeline-wrap');
    if (!header) return;

    const ro = new ResizeObserver(function () {
      setChromeHeights();
    });
    ro.observe(header);
    if (timelineWrap) ro.observe(timelineWrap);

    const timelineDetails = document.getElementById('timeline-wrap');
    if (timelineDetails) {
      timelineDetails.addEventListener('toggle', setChromeHeights);
    }

    setChromeHeights();
    window.addEventListener('resize', setChromeHeights, { passive: true });
  }

  function closeHeaderNav(header) {
    header.classList.remove('header-nav-open');
    const btn = header.querySelector('.header-nav-menu-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function initHeaderNav() {
    const header = document.querySelector('.app-header');
    const controls = header && header.querySelector('.header-controls');
    if (!header || !controls) return;

    if (!controls.id) {
      controls.id = 'header-nav-panel';
    }

    let btn = header.querySelector('.header-nav-menu-btn');
    const top = header.querySelector('.header-top');
    if (!btn && top) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-subtle header-nav-menu-btn';
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', 'header-nav-panel');
      btn.textContent = 'Menu';

      const brand = header.querySelector('.brand-title');
      let row = top.querySelector('.header-top-brand-row');
      if (!row) {
        row = document.createElement('div');
        row.className = 'header-top-brand-row';
        top.insertBefore(row, top.firstChild);
      }
      if (brand && brand.parentElement !== row) {
        row.appendChild(brand);
      }
      row.appendChild(btn);
    }

    if (!btn || btn.dataset.navInit === 'true') return;
    btn.dataset.navInit = 'true';

    btn.addEventListener('click', function () {
      const open = header.classList.toggle('header-nav-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      setChromeHeights();
    });

    document.addEventListener('click', function (e) {
      if (!header.classList.contains('header-nav-open')) return;
      if (e.target.closest('.header-nav-menu-btn') || e.target.closest('#header-nav-panel')) return;
      closeHeaderNav(header);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeHeaderNav(header);
    });

    function syncCompactNav() {
      if (!isCompactLayout()) closeHeaderNav(header);
    }

    COMPACT_MQ.addEventListener('change', syncCompactNav);
    window.addEventListener('resize', syncCompactNav, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(syncCompactNav).observe(header);
    }
  }

  function initTimelineDefault() {
    const details = document.getElementById('timeline-wrap');
    if (!details) return;

    function syncTimelineOpen() {
      if (isCompactLayout()) {
        details.removeAttribute('open');
      } else {
        details.setAttribute('open', '');
      }
      setChromeHeights();
    }

    syncTimelineOpen();
    COMPACT_MQ.addEventListener('change', syncTimelineOpen);
    window.addEventListener('resize', syncTimelineOpen, { passive: true });
    const header = document.querySelector('.app-header');
    if (header && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(syncTimelineOpen).observe(header);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initHeaderNav();
    initChromeObserver();
    initTimelineDefault();
  });
})();
