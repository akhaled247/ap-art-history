/**
 * Wikipedia-style hover preview for .vocab-link elements.
 */

window.VocabHovercard = (function () {
  'use strict';

  const HOVER_DELAY_MS = 400;
  let _card = null;
  let _termEl = null;
  let _defEl = null;
  let _timer = null;
  let _activeLink = null;

  function truncate(text, max) {
    if (!text || text.length <= max) return text || '';
    return text.substring(0, max).trim() + '…';
  }

  function ensureCard() {
    if (_card) return;
    _card = document.getElementById('vocab-hovercard');
    if (!_card) {
      _card = document.createElement('div');
      _card.id = 'vocab-hovercard';
      _card.className = 'vocab-hovercard';
      _card.setAttribute('role', 'tooltip');
      _card.hidden = true;
      _card.innerHTML =
        '<a class="vocab-hovercard-term" href="#"></a>' +
        '<p class="vocab-hovercard-def"></p>' +
        '<span class="vocab-hovercard-hint">Click for full entry</span>';
      document.body.appendChild(_card);
    }
    _termEl = _card.querySelector('.vocab-hovercard-term');
    _defEl = _card.querySelector('.vocab-hovercard-def');
  }

  function positionCard(link) {
    const rect = link.getBoundingClientRect();
    const cardRect = _card.getBoundingClientRect();
    let top = rect.bottom + 8;
    let left = rect.left;

    if (left + cardRect.width > window.innerWidth - 12) {
      left = window.innerWidth - cardRect.width - 12;
    }
    if (left < 12) left = 12;
    if (top + cardRect.height > window.innerHeight - 12) {
      top = rect.top - cardRect.height - 8;
    }

    _card.style.top = top + 'px';
    _card.style.left = left + 'px';
  }

  function show(link) {
    const id = link.getAttribute('data-vocab-id');
    if (!id || !window.DataLoader) return;
    const entry = window.DataLoader.getVocabularyById(id);
    if (!entry) return;

    ensureCard();
    _termEl.textContent = entry.term;
    _termEl.href = link.href;
    _defEl.textContent = truncate(entry.definition, 220);
    _card.hidden = false;
    _activeLink = link;
    positionCard(link);
  }

  function hide() {
    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
    }
    if (_card) _card.hidden = true;
    _activeLink = null;
  }

  function scheduleShow(link) {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(function () {
      show(link);
    }, HOVER_DELAY_MS);
  }

  function init() {
    ensureCard();
    const hoverCapable = window.matchMedia('(hover: hover)').matches;

    if (hoverCapable) {
      document.addEventListener('mouseover', function (e) {
        const link = e.target.closest('.vocab-link');
        if (!link) return;
        scheduleShow(link);
      });

      document.addEventListener('mouseout', function (e) {
        const link = e.target.closest('.vocab-link');
        if (!link) return;
        const related = e.relatedTarget;
        if (related && (_card.contains(related) || related.closest('.vocab-link') === link)) {
          return;
        }
        hide();
      });
    } else {
      _card.style.pointerEvents = 'auto';
      const hint = _card.querySelector('.vocab-hovercard-hint');
      if (hint) hint.textContent = 'Tap again elsewhere to close';

      document.addEventListener('click', function (e) {
        const link = e.target.closest('.vocab-link');
        if (link) {
          e.preventDefault();
          if (_activeLink === link && _card && !_card.hidden) {
            hide();
          } else {
            if (_timer) clearTimeout(_timer);
            show(link);
          }
          return;
        }
        if (_card && !_card.hidden && !_card.contains(e.target)) {
          hide();
        }
      });
    }

    document.addEventListener('focusin', function (e) {
      const link = e.target.closest('.vocab-link');
      if (link) show(link);
    });

    document.addEventListener('focusout', function (e) {
      const link = e.target.closest('.vocab-link');
      if (link) hide();
    });

    window.addEventListener('scroll', function () {
      if (_activeLink && !_card.hidden) positionCard(_activeLink);
    }, true);
  }

  return { init: init, hide: hide };
})();
