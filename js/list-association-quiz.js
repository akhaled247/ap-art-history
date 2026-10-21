/**
 * List page Connect tab: association quiz + optional attribution mix.
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'listConnectQuizPrefs';
  var _quizScore = { correct: 0, total: 0 };
  var _quizAnswered = false;
  var _dataReady = false;
  var _selectedUnits = 'all';
  var _includeAttribution = false;

  document.addEventListener('DOMContentLoaded', function () {
    var connectPanel = document.getElementById('list-connect-panel');
    if (!connectPanel) return;

    loadPrefs();
    setupUnitControls();
    setupAttributionToggle();

    document.addEventListener('list:dataReady', function () {
      _dataReady = true;
      if (window.ListViewTabs && window.ListViewTabs.getView() === 'connect') {
        startConnectQuestion();
      }
    });

    if (window.ListViewTabs) {
      window.ListViewTabs.onChange(function (view) {
        if (view === 'connect' && _dataReady) {
          startConnectQuestion();
        }
      });
    }

    setupConnectNext();
  });

  function loadPrefs() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var prefs = JSON.parse(raw);
      if (prefs.selectedUnits === 'all' || Array.isArray(prefs.selectedUnits)) {
        _selectedUnits = prefs.selectedUnits;
      }
      if (typeof prefs.includeAttribution === 'boolean') {
        _includeAttribution = prefs.includeAttribution;
      }
    } catch (_) {}
    syncUnitCheckboxes();
    var attrEl = document.getElementById('list-connect-include-attribution');
    if (attrEl) attrEl.checked = _includeAttribution;
  }

  function savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedUnits: _selectedUnits,
        includeAttribution: _includeAttribution
      }));
    } catch (_) {}
  }

  function resetScore() {
    _quizScore = { correct: 0, total: 0 };
    var scoreEl = document.getElementById('list-connect-score');
    if (scoreEl) scoreEl.textContent = 'Score: 0 / 0';
  }

  function setupUnitControls() {
    var allCb = document.getElementById('list-connect-unit-all');
    var grid = document.getElementById('list-connect-units');
    if (!grid) return;

    grid.addEventListener('change', function (e) {
      var target = e.target;
      if (!target || target.type !== 'checkbox') return;

      if (target.id === 'list-connect-unit-all') {
        if (target.checked) {
          _selectedUnits = 'all';
          grid.querySelectorAll('input[data-unit]').forEach(function (cb) {
            cb.checked = false;
          });
        }
      } else {
        var unit = parseInt(target.getAttribute('data-unit'), 10);
        if (!target.checked) {
          if (_selectedUnits !== 'all' && Array.isArray(_selectedUnits)) {
            _selectedUnits = _selectedUnits.filter(function (u) { return u !== unit; });
            if (!_selectedUnits.length) {
              _selectedUnits = 'all';
              if (allCb) allCb.checked = true;
            }
          }
        } else {
          if (allCb) allCb.checked = false;
          if (_selectedUnits === 'all') _selectedUnits = [];
          if (!Array.isArray(_selectedUnits)) _selectedUnits = [];
          if (_selectedUnits.indexOf(unit) === -1) _selectedUnits.push(unit);
          _selectedUnits.sort(function (a, b) { return a - b; });
        }
      }

      savePrefs();
      resetScore();
      if (window.ListViewTabs && window.ListViewTabs.getView() === 'connect' && _dataReady) {
        startConnectQuestion();
      }
    });
  }

  function syncUnitCheckboxes() {
    var allCb = document.getElementById('list-connect-unit-all');
    var grid = document.getElementById('list-connect-units');
    if (!grid) return;

    if (_selectedUnits === 'all') {
      if (allCb) allCb.checked = true;
      grid.querySelectorAll('input[data-unit]').forEach(function (cb) { cb.checked = false; });
      return;
    }

    if (allCb) allCb.checked = false;
    var set = new Set(_selectedUnits);
    grid.querySelectorAll('input[data-unit]').forEach(function (cb) {
      var u = parseInt(cb.getAttribute('data-unit'), 10);
      cb.checked = set.has(u);
    });
  }

  function setupAttributionToggle() {
    var attrEl = document.getElementById('list-connect-include-attribution');
    if (!attrEl) return;
    attrEl.addEventListener('change', function () {
      _includeAttribution = attrEl.checked;
      savePrefs();
      resetScore();
      if (window.ListViewTabs && window.ListViewTabs.getView() === 'connect' && _dataReady) {
        startConnectQuestion();
      }
    });
  }

  function resolveAssetPath(src) {
    if (!src || /^https?:\/\//i.test(src)) return src;
    return '../' + src.replace(/^\//, '');
  }

  function updateConnectQuestionImage(built) {
    var imgEl = document.getElementById('list-connect-image');
    var panel = document.getElementById('list-connect-panel');
    if (!imgEl) return;

    var showImage = built &&
      built.quizType === 'attribution' &&
      built.showImage === true &&
      built.mode === 'imageToField';
    if (panel) {
      panel.classList.toggle('list-quiz-panel--text-only', !showImage);
    }

    if (!showImage || !window.DataLoader) {
      imgEl.hidden = true;
      imgEl.removeAttribute('src');
      return;
    }

    var focal = built.artwork;
    if (!focal || !focal.id) {
      imgEl.hidden = true;
      imgEl.removeAttribute('src');
      return;
    }

    var images = window.DataLoader.getImagesForArtwork(focal.id);
    var thumb = images[0];
    if (thumb && thumb.src) {
      imgEl.src = resolveAssetPath(thumb.src);
      imgEl.alt = thumb.alt || focal.title || 'Artwork image';
      imgEl.hidden = false;
    } else {
      imgEl.hidden = true;
      imgEl.removeAttribute('src');
    }
  }

  function getConnectPool() {
    if (!window.ArtworkFilters || !window.DataLoader) return [];
    return window.ArtworkFilters.computeFilteredArtworksByUnits({
      selectedUnits: _selectedUnits,
      startDate: null,
      endDate: null,
      searchQuery: ''
    });
  }

  function startConnectQuestion() {
    _quizAnswered = false;
    var promptEl = document.getElementById('list-connect-prompt');
    var detailEl = document.getElementById('list-connect-prompt-detail');
    var optionsEl = document.getElementById('list-connect-options');
    var feedbackEl = document.getElementById('list-connect-feedback');
    var nextBtn = document.getElementById('list-connect-next');
    var scoreEl = document.getElementById('list-connect-score');

    if (!promptEl || !optionsEl) return;

    if (!_dataReady) {
      promptEl.textContent = 'Loading artworks...';
      if (detailEl) detailEl.textContent = '';
      optionsEl.innerHTML = '';
      if (feedbackEl) feedbackEl.textContent = '';
      if (nextBtn) nextBtn.hidden = true;
      updateConnectQuestionImage(null);
      return;
    }

    var pool = getConnectPool();
    var built = window.MixedListQuiz
      ? window.MixedListQuiz.buildMixedQuestion(pool, { includeAttribution: _includeAttribution })
      : window.ArtworkAssociationQuiz.buildQuestion(pool);

    if (built && built.error) {
      optionsEl.innerHTML = '';
      if (detailEl) detailEl.textContent = '';
      if (built.error === 'pool_too_small') {
        promptEl.textContent = 'Select more units (need at least 4 works in the pool).';
      } else if (built.error === 'insufficient_concepts') {
        promptEl.textContent = 'Not enough association topics for this unit selection. Try more units or All units.';
      } else if (built.error === 'insufficient_distinct_answers') {
        promptEl.textContent = 'Could not build an attribution question for this pool. Try turning off attribution or widening units.';
      } else {
        promptEl.textContent = 'Unable to build a question for this selection.';
      }
      if (feedbackEl) feedbackEl.textContent = '';
      if (nextBtn) nextBtn.hidden = true;
      updateConnectQuestionImage(null);
      return;
    }

    if (!built) {
      promptEl.textContent = 'Unable to build a question.';
      updateConnectQuestionImage(null);
      return;
    }

    if (!built.quizType && built.mode) {
      built.quizType = 'association';
    }

    updateConnectQuestionImage(built);

    promptEl.textContent = built.prompt;
    if (detailEl) {
      detailEl.textContent = built.promptDetail || '';
    }

    optionsEl.innerHTML = '';
    var labels = ['A', 'B', 'C', 'D'];
    built.choices.forEach(function (choice, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vocab-quiz-option';
      btn.setAttribute('data-correct', choice === built.correctAnswer ? 'true' : 'false');
      btn.setAttribute('data-choice', choice);
      btn.innerHTML = '<span class="vocab-quiz-label">' + labels[idx] + '</span> ' + escapeHtml(choice);
      btn.addEventListener('click', function () {
        onAnswerClick(btn, built, optionsEl, feedbackEl, nextBtn, scoreEl);
      });
      optionsEl.appendChild(btn);
    });

    if (feedbackEl) feedbackEl.textContent = '';
    if (nextBtn) nextBtn.hidden = true;
    if (scoreEl && _quizScore.total === 0) {
      scoreEl.textContent = 'Score: 0 / 0';
    }
  }

  function onAnswerClick(btn, built, optionsEl, feedbackEl, nextBtn, scoreEl) {
    if (_quizAnswered) return;
    _quizAnswered = true;
    _quizScore.total += 1;
    var isCorrect = btn.getAttribute('data-correct') === 'true';
    if (isCorrect) _quizScore.correct += 1;

    optionsEl.querySelectorAll('.vocab-quiz-option').forEach(function (opt) {
      opt.disabled = true;
      if (opt.getAttribute('data-correct') === 'true') {
        opt.classList.add('vocab-quiz-option--correct');
      } else if (opt === btn && !isCorrect) {
        opt.classList.add('vocab-quiz-option--wrong');
      }
    });

    if (feedbackEl) {
      var artwork = built.artwork;
      var linkHtml = '';
      if (artwork && artwork.id) {
        linkHtml = ' <a href="' + escapeAttr(window.ArtworkRender.artworkPageUrl(artwork.id)) + '">View CED #' + artwork.id + '</a>';
      }
      var explain = '';
      if (built.quizType === 'association' && built.explanationLabel) {
        explain = ' Connection: ' + escapeHtml(built.explanationLabel) + '.';
      }
      if (isCorrect) {
        feedbackEl.innerHTML = 'Correct!' + explain + linkHtml;
      } else {
        feedbackEl.innerHTML = 'Incorrect. The right answer is highlighted.' + explain + linkHtml;
      }
    }
    if (scoreEl) {
      scoreEl.textContent = 'Score: ' + _quizScore.correct + ' / ' + _quizScore.total;
    }
    if (nextBtn) nextBtn.hidden = false;
  }

  function setupConnectNext() {
    var nextBtn = document.getElementById('list-connect-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', startConnectQuestion);
    }
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
