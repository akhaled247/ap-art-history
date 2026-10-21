/**
 * List page artwork attribution quiz UI.
 * Eligibility rules: docs/QUIZ-DATA-POLICY.md and ArtworkQuiz.canQuizField.
 */

(function () {
  'use strict';

  var _quizScore = { correct: 0, total: 0 };
  var _quizAnswered = false;
  var _selectedUnit = 'all';
  var _dataReady = false;

  document.addEventListener('DOMContentLoaded', function () {
    var quizPanel = document.getElementById('list-quiz-panel');
    if (!quizPanel) return;

    if (window.ListViewTabs) {
      window.ListViewTabs.init();
      window.ListViewTabs.onChange(function (view) {
        if (view === 'quiz' && _dataReady) {
          startQuizQuestion();
        }
      });
    }

    document.addEventListener('list:dataReady', function () {
      _dataReady = true;
      if (window.ListViewTabs && window.ListViewTabs.getView() === 'quiz') {
        startQuizQuestion();
      }
    });

    setupUnitSync();
    setupQuizNext();
  });

  function setupUnitSync() {
    var nav = document.getElementById('list-unit-nav');
    if (!nav) return;

    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('.unit-tab');
      if (!btn) return;
      _selectedUnit = btn.getAttribute('data-unit') || 'all';
      if (window.ListViewTabs && window.ListViewTabs.getView() === 'quiz' && _dataReady) {
        startQuizQuestion();
      }
    });
  }

  function resolveSelectedUnit() {
    if (_selectedUnit === 'all') return 'all';
    return parseInt(_selectedUnit, 10);
  }

  function getQuizPool() {
    if (!window.ArtworkFilters || !window.DataLoader) return [];
    return window.ArtworkFilters.computeFilteredArtworks({
      selectedUnit: resolveSelectedUnit(),
      startDate: null,
      endDate: null,
      searchQuery: ''
    });
  }

  function resolveAssetPath(src) {
    if (!src || /^https?:\/\//i.test(src)) return src;
    return '../' + src.replace(/^\//, '');
  }

  function startQuizQuestion() {
    _quizAnswered = false;
    var promptEl = document.getElementById('list-quiz-prompt');
    var optionsEl = document.getElementById('list-quiz-options');
    var feedbackEl = document.getElementById('list-quiz-feedback');
    var nextBtn = document.getElementById('list-quiz-next');
    var scoreEl = document.getElementById('list-quiz-score');
    var imgEl = document.getElementById('list-quiz-image');

    if (!promptEl || !optionsEl || !window.ArtworkQuiz) return;

    if (!_dataReady) {
      promptEl.textContent = 'Loading artworks...';
      optionsEl.innerHTML = '';
      if (imgEl) imgEl.hidden = true;
      if (feedbackEl) feedbackEl.textContent = '';
      if (nextBtn) nextBtn.hidden = true;
      return;
    }

    var pool = getQuizPool();
    var built = window.ArtworkQuiz.buildQuestion(pool);

    if (built && built.error) {
      if (imgEl) imgEl.hidden = true;
      setQuizPanelTextOnly(false);
      optionsEl.innerHTML = '';
      if (built.error === 'pool_too_small') {
        promptEl.textContent = 'Need at least 4 works in this unit to quiz. Try "All Works" or another unit.';
      } else {
        promptEl.textContent = 'Not enough unique answers for a 4-choice quiz in this unit. Try All Works or another unit.';
      }
      if (feedbackEl) feedbackEl.textContent = '';
      if (nextBtn) nextBtn.hidden = true;
      return;
    }

    if (!built || !built.artwork) {
      promptEl.textContent = 'Unable to build a question. Try another unit.';
      optionsEl.innerHTML = '';
      if (imgEl) imgEl.hidden = true;
      return;
    }

    var artwork = built.artwork;
    var showImage = built.showImage === true;
    setQuizPanelTextOnly(!showImage);

    if (imgEl) {
      if (showImage) {
        var images = window.DataLoader.getImagesForArtwork(artwork.id);
        var thumb = images[0];
        if (thumb) {
          imgEl.src = resolveAssetPath(thumb.src);
          imgEl.alt = thumb.alt || artwork.title || 'Artwork image';
          imgEl.hidden = false;
        } else {
          imgEl.hidden = true;
        }
      } else {
        imgEl.hidden = true;
        imgEl.removeAttribute('src');
      }
    }

    if (built.mode === 'titleToField' && built.promptTitle) {
      promptEl.innerHTML = formatTitleToFieldPrompt(built.prompt, built.promptTitle);
    } else {
      promptEl.textContent = built.prompt;
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
      var detailUrl = window.ArtworkRender.artworkPageUrl(built.artwork.id);
      if (isCorrect) {
        feedbackEl.innerHTML = 'Correct! <a href="' + escapeAttr(detailUrl) + '">View CED #' + built.artwork.id + '</a>';
      } else {
        feedbackEl.innerHTML = 'Incorrect. The right answer is highlighted. <a href="' + escapeAttr(detailUrl) + '">View CED #' + built.artwork.id + '</a>';
      }
    }
    if (scoreEl) {
      scoreEl.textContent = 'Score: ' + _quizScore.correct + ' / ' + _quizScore.total;
    }
    if (nextBtn) nextBtn.hidden = false;
  }

  function setQuizPanelTextOnly(textOnly) {
    var panel = document.getElementById('list-quiz-panel');
    if (panel) panel.classList.toggle('list-quiz-panel--text-only', textOnly);
  }

  function formatTitleToFieldPrompt(promptText, title) {
    var escapedTitle = escapeHtml(title);
    var idx = promptText.indexOf(title);
    if (idx !== -1) {
      return escapeHtml(promptText.slice(0, idx)) +
        '<strong>' + escapedTitle + '</strong>' +
        escapeHtml(promptText.slice(idx + title.length));
    }
    return escapeHtml(promptText);
  }

  function setupQuizNext() {
    var nextBtn = document.getElementById('list-quiz-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', startQuizQuestion);
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
