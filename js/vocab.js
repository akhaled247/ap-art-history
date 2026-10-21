/**
 * Vocabulary page: glossary list, unit filter, search, quiz.
 */

(function () {
  'use strict';

  let _allTerms = [];
  let _filteredTerms = [];
  let _selectedUnit = 'all';
  let _activeView = 'glossary';
  let _quizScore = { correct: 0, total: 0 };
  let _quizAnswered = false;
  let _quizCategory = 'definitions';
  let _currentArtworkQuestionMode = 'artwork-to-term';
  let _vocabImageCarousel = null;

  document.addEventListener('DOMContentLoaded', async function () {
    const listEl = document.getElementById('vocab-list');
    if (!listEl) return;

    try {
      await Promise.all([
        window.DataLoader.loadVocabulary(),
        window.DataLoader.loadImages(),
        window.DataLoader.loadArtworks()
      ]);
      _allTerms = window.DataLoader.getVocabulary().slice().sort(function (a, b) {
        return a.term.localeCompare(b.term, undefined, { sensitivity: 'base' });
      });

      setupViewTabs();
      setupQuizModeTabs();
      setupVocabQuizCarousel();
      setupUnitTabs();
      setupSearch();
      setupQuizNext();
      applyFilters();
      handleHashScroll();

      window.addEventListener('hashchange', handleHashScroll);
    } catch (err) {
      console.error('Vocabulary page error:', err);
      listEl.innerHTML = '<div class="list-error"><h2>Failed to load vocabulary</h2><p>' + escapeHtml(err.message) + '</p></div>';
    }
  });

  function setupViewTabs() {
    const glossaryBtn = document.getElementById('vocab-view-glossary');
    const quizBtn = document.getElementById('vocab-view-quiz');
    const glossaryPanel = document.getElementById('vocab-glossary-panel');
    const quizPanel = document.getElementById('vocab-quiz-panel');

    if (glossaryBtn) {
      glossaryBtn.addEventListener('click', function () {
        _activeView = 'glossary';
        glossaryBtn.classList.add('active');
        glossaryBtn.setAttribute('aria-selected', 'true');
        if (quizBtn) {
          quizBtn.classList.remove('active');
          quizBtn.setAttribute('aria-selected', 'false');
        }
        if (glossaryPanel) glossaryPanel.hidden = false;
        if (quizPanel) quizPanel.hidden = true;
      });
    }

    if (quizBtn) {
      quizBtn.addEventListener('click', function () {
        _activeView = 'quiz';
        quizBtn.classList.add('active');
        quizBtn.setAttribute('aria-selected', 'true');
        if (glossaryBtn) {
          glossaryBtn.classList.remove('active');
          glossaryBtn.setAttribute('aria-selected', 'false');
        }
        if (glossaryPanel) glossaryPanel.hidden = true;
        if (quizPanel) quizPanel.hidden = false;
        startQuizQuestion();
      });
    }
  }

  function setupUnitTabs() {
    const nav = document.getElementById('vocab-unit-nav');
    if (!nav) return;

    nav.addEventListener('click', function (e) {
      const btn = e.target.closest('.unit-tab');
      if (!btn) return;
      _selectedUnit = btn.getAttribute('data-unit') || 'all';
      nav.querySelectorAll('.unit-tab').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      applyFilters();
      if (_activeView === 'quiz') startQuizQuestion();
    });
  }

  function setupSearch() {
    const input = document.getElementById('vocab-search-input');
    const clearBtn = document.getElementById('vocab-search-clear');
    if (!input) return;

    input.addEventListener('input', function () {
      if (clearBtn) clearBtn.classList.toggle('active', input.value.length > 0);
      applyFilters();
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        input.value = '';
        clearBtn.classList.remove('active');
        applyFilters();
        input.focus();
      });
    }
  }

  function getQuizPool() {
    if (_selectedUnit === 'all') return _allTerms;
    return window.DataLoader.filterVocabularyByUnit(_selectedUnit);
  }

  function getArtworkQuizPool() {
    return getQuizPool().filter(shouldShowArtworkReferences);
  }

  function setupQuizModeTabs() {
    const categoryTabs = document.querySelectorAll('.vocab-quiz-category-tab');
    if (!categoryTabs.length) return;

    categoryTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        const category = tab.getAttribute('data-quiz-category') || 'definitions';
        if (category === _quizCategory) return;
        _quizCategory = category;
        categoryTabs.forEach(function (t) {
          const active = t === tab;
          t.classList.toggle('active', active);
          t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        if (_activeView === 'quiz') startQuizQuestion();
      });
    });
    updateQuizPanelLayout();
  }

  function updateQuizPanelLayout() {
    const panel = document.getElementById('vocab-quiz-panel');
    if (!panel) return;
    const mode = _quizCategory === 'definitions' ? 'definitions' : _currentArtworkQuestionMode;
    panel.classList.toggle('vocab-quiz-panel--definitions', mode === 'definitions');
    panel.classList.toggle('vocab-quiz-panel--term-to-artwork', mode === 'term-to-artwork');
  }

  function setupVocabQuizCarousel() {
    if (!window.ArtworkRender || !window.ArtworkRender.bindImageCarousel) return;
    const imgEl = document.getElementById('vocab-quiz-image');
    if (!imgEl) return;
    _vocabImageCarousel = window.ArtworkRender.bindImageCarousel({
      imgEl: imgEl,
      captionEl: document.getElementById('vocab-quiz-image-caption'),
      controlsEl: document.getElementById('vocab-quiz-image-controls'),
      prevBtn: document.getElementById('vocab-quiz-img-prev'),
      nextBtn: document.getElementById('vocab-quiz-img-next')
    });
  }

  function getArtworkTitle(artworkId) {
    const artwork = window.DataLoader.getArtworkById(artworkId);
    if (artwork && artwork.title) return artwork.title;
    return 'CED #' + String(artworkId).padStart(3, '0');
  }

  function formatArtworkTitleForQuiz(artworkId, promptEntry) {
    return censorQuizChoiceText(getArtworkTitle(artworkId), promptEntry);
  }

  function formatArtworkChoiceLabel(artworkId, promptEntry) {
    const padded = String(artworkId).padStart(3, '0');
    return padded + ' — ' + formatArtworkTitleForQuiz(artworkId, promptEntry);
  }

  function formatArtworkChoiceLabelPlain(artworkId) {
    const padded = String(artworkId).padStart(3, '0');
    return padded + ' — ' + getArtworkTitle(artworkId);
  }

  function setQuizOptionButton(btn, labelLetter, displayHtml, plainText) {
    btn.innerHTML = '<span class="vocab-quiz-label">' + labelLetter + '</span> ' + displayHtml;
    btn.setAttribute('data-choice-label', labelLetter);
    btn._quizChoicePlain = plainText;
  }

  function revealQuizChoices(optionsEl) {
    if (!optionsEl) return;
    optionsEl.querySelectorAll('.vocab-quiz-option').forEach(function (opt) {
      const label = opt.getAttribute('data-choice-label');
      const text = opt._quizChoicePlain;
      if (!label || text == null) return;
      opt.innerHTML = '<span class="vocab-quiz-label">' + label + '</span> ' + escapeHtml(text);
    });
  }

  function mapImagesForQuiz(artworkId, promptEntry) {
    return window.DataLoader.getImagesForArtwork(artworkId).map(function (img) {
      const alt = img.alt
        ? censorQuizChoiceText(img.alt, promptEntry)
        : formatArtworkTitleForQuiz(artworkId, promptEntry);
      return {
        src: resolveAssetPath(img.src),
        alt: alt,
        source: img.source,
        local: img.local
      };
    });
  }

  function resolveAssetPath(src) {
    if (!src || /^https?:\/\//i.test(src)) return src;
    return '../' + src.replace(/^\//, '');
  }

  function censorQuizChoiceText(text, promptEntry) {
    if (!text || !window.VocabLinker || !window.VocabLinker.censorVocabularyInText) {
      return text;
    }
    return window.VocabLinker.censorVocabularyInText(text, _allTerms, {
      promptEntry: promptEntry
    });
  }

  function formatDefinitionChoice(definition, promptEntry) {
    return escapeHtml(censorQuizChoiceText(definition, promptEntry));
  }

  function applyFilters() {
    const query = (document.getElementById('vocab-search-input') || {}).value || '';
    const q = query.trim().toLowerCase();

    if (_selectedUnit === 'all') {
      _filteredTerms = _allTerms.slice();
    } else {
      _filteredTerms = window.DataLoader.filterVocabularyByUnit(_selectedUnit);
      _filteredTerms.sort(function (a, b) {
        return a.term.localeCompare(b.term, undefined, { sensitivity: 'base' });
      });
    }

    if (q) {
      _filteredTerms = _filteredTerms.filter(function (e) {
        return e.term.toLowerCase().indexOf(q) !== -1 ||
               e.definition.toLowerCase().indexOf(q) !== -1;
      });
    }

    renderGlossary();
    updateCount();
  }

  function updateCount() {
    const el = document.getElementById('vocab-count');
    if (el) {
      el.textContent = 'Showing ' + _filteredTerms.length + ' of ' + _allTerms.length + ' terms';
    }
  }

  /** Unit 0 intro terms and overly broad AFFCC matches are not useful as artwork link lists. */
  function shouldShowArtworkReferences(entry) {
    if (!entry.artworks || entry.artworks.length === 0) return false;
    if (entry.units && entry.units.indexOf(0) !== -1) return false;
    if (entry.artworks.length > 10) return false;
    return true;
  }

  function renderGlossary() {
    const listEl = document.getElementById('vocab-list');
    if (!listEl) return;

    if (_filteredTerms.length === 0) {
      listEl.innerHTML = '<div class="loading-note">No matching terms found.</div>';
      return;
    }

    listEl.innerHTML = '';
    _filteredTerms.forEach(function (entry) {
      const article = document.createElement('article');
      article.className = 'vocab-entry';
      article.id = 'vocab-' + entry.id;
      article.setAttribute('tabindex', '-1');

      const h2 = document.createElement('h2');
      h2.className = 'vocab-entry-term';
      h2.textContent = entry.term;
      article.appendChild(h2);

      if (entry.units && entry.units.length > 0) {
        const units = document.createElement('div');
        units.className = 'vocab-entry-units';
        units.textContent = 'Units: ' + entry.units.join(', ');
        article.appendChild(units);
      }

      const def = document.createElement('div');
      def.className = 'vocab-entry-definition';
      def.textContent = entry.definition;
      article.appendChild(def);

      if (shouldShowArtworkReferences(entry)) {
        const refs = document.createElement('div');
        refs.className = 'vocab-entry-references';

        const label = document.createElement('span');
        label.className = 'vocab-entry-references-label';
        label.textContent = 'References: ';
        refs.appendChild(label);

        entry.artworks.forEach(function (artworkId, idx) {
          if (idx > 0) {
            refs.appendChild(document.createTextNode(', '));
          }
          const paddedId = String(artworkId).padStart(3, '0');
          const link = document.createElement('a');
          link.href = '../list/' + paddedId + '/';
          link.textContent = paddedId;
          refs.appendChild(link);
        });

        article.appendChild(refs);
      }

      listEl.appendChild(article);
    });
  }

  function handleHashScroll() {
    const hash = window.location.hash;
    if (!hash || hash.indexOf('#vocab-') !== 0) return;

    const glossaryBtn = document.getElementById('vocab-view-glossary');
    if (glossaryBtn) glossaryBtn.click();

    const el = document.querySelector(hash);
    if (!el) return;

    requestAnimationFrame(function () {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('vocab-entry--highlight');
      setTimeout(function () {
        el.classList.remove('vocab-entry--highlight');
      }, 2000);
    });
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function startQuizQuestion() {
    if (_quizCategory === 'artworks') {
      _currentArtworkQuestionMode = Math.random() < 0.5 ? 'artwork-to-term' : 'term-to-artwork';
      updateQuizPanelLayout();
      if (_currentArtworkQuestionMode === 'artwork-to-term') {
        startArtworkToTermQuizQuestion();
      } else {
        startTermToArtworkQuizQuestion();
      }
      return;
    }
    _currentArtworkQuestionMode = 'artwork-to-term';
    updateQuizPanelLayout();
    startDefinitionQuizQuestion();
  }

  function clearQuizImage() {
    const wrap = document.getElementById('vocab-quiz-image-wrap');
    const imgEl = document.getElementById('vocab-quiz-image');
    if (_vocabImageCarousel) {
      _vocabImageCarousel.setImages([]);
    } else if (imgEl) {
      imgEl.removeAttribute('src');
      imgEl.alt = '';
    }
    const captionEl = document.getElementById('vocab-quiz-image-caption');
    if (captionEl) captionEl.textContent = '';
    if (wrap) wrap.hidden = true;
  }

  function showQuizCarouselForArtwork(artworkId, promptEntry) {
    const wrap = document.getElementById('vocab-quiz-image-wrap');
    if (!wrap) return;

    const images = mapImagesForQuiz(artworkId, promptEntry);
    if (!images.length) {
      wrap.hidden = true;
      return;
    }
    if (_vocabImageCarousel) {
      _vocabImageCarousel.setImages(images);
    } else {
      const imgEl = document.getElementById('vocab-quiz-image');
      if (imgEl) {
        imgEl.src = images[0].src;
        imgEl.alt = images[0].alt || 'Artwork image';
      }
    }
    wrap.hidden = false;
  }

  function startDefinitionQuizQuestion() {
    _quizAnswered = false;
    clearQuizImage();
    const pool = getQuizPool();
    const promptEl = document.getElementById('vocab-quiz-prompt');
    const optionsEl = document.getElementById('vocab-quiz-options');
    const feedbackEl = document.getElementById('vocab-quiz-feedback');
    const nextBtn = document.getElementById('vocab-quiz-next');
    const scoreEl = document.getElementById('vocab-quiz-score');

    if (!promptEl || !optionsEl) return;

    if (pool.length < 4) {
      promptEl.textContent = 'Need at least 4 terms in this unit to quiz. Try "All" or tag more terms with units.';
      optionsEl.innerHTML = '';
      if (feedbackEl) feedbackEl.textContent = '';
      if (nextBtn) nextBtn.hidden = true;
      return;
    }

    const correct = pool[Math.floor(Math.random() * pool.length)];
    const distractors = shuffle(pool.filter(function (e) { return e.id !== correct.id; }))
      .slice(0, 3);
    const choices = shuffle([correct].concat(distractors));
    const labels = ['A', 'B', 'C', 'D'];

    promptEl.innerHTML = 'What is the definition of <strong>' + escapeHtml(correct.term) + '</strong>?';
    optionsEl.innerHTML = '';

    choices.forEach(function (choice, idx) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vocab-quiz-option';
      btn.setAttribute('data-correct', choice.id === correct.id ? 'true' : 'false');
      btn.setAttribute('data-id', choice.id);
      setQuizOptionButton(btn, labels[idx], formatDefinitionChoice(choice.definition, correct), choice.definition);
      btn.addEventListener('click', function () {
        onDefinitionQuizAnswer(btn, correct, choice, optionsEl, feedbackEl, nextBtn, scoreEl);
      });
      optionsEl.appendChild(btn);
    });

    resetQuizChrome(feedbackEl, nextBtn, scoreEl);
  }

  function startArtworkToTermQuizQuestion() {
    _quizAnswered = false;
    const pool = getArtworkQuizPool();
    const promptEl = document.getElementById('vocab-quiz-prompt');
    const optionsEl = document.getElementById('vocab-quiz-options');
    const feedbackEl = document.getElementById('vocab-quiz-feedback');
    const nextBtn = document.getElementById('vocab-quiz-next');
    const scoreEl = document.getElementById('vocab-quiz-score');

    if (!promptEl || !optionsEl) return;

    if (pool.length < 4) {
      clearQuizImage();
      promptEl.textContent = 'Need at least 4 terms with linked artworks in this unit. Try "All" or another unit.';
      optionsEl.innerHTML = '';
      if (feedbackEl) feedbackEl.textContent = '';
      if (nextBtn) nextBtn.hidden = true;
      return;
    }

    const builder = window.VocabArtworkQuiz;
    const built = builder ? builder.buildArtworkToTermQuestion(pool) : null;
    if (!built) {
      clearQuizImage();
      promptEl.textContent =
        'Not enough distinct terms for a fair artwork quiz in this unit. Try "All" or another unit.';
      optionsEl.innerHTML = '';
      if (feedbackEl) feedbackEl.textContent = '';
      if (nextBtn) nextBtn.hidden = true;
      return;
    }
    const correct = built.correct;
    const artworkId = built.artworkId;
    const choices = built.choices;
    showQuizCarouselForArtwork(artworkId, correct);

    const labels = ['A', 'B', 'C', 'D'];
    const paddedId = String(artworkId).padStart(3, '0');
    const workTitle = formatArtworkTitleForQuiz(artworkId, correct);

    promptEl.innerHTML = 'Which vocabulary term is associated with <strong>' + escapeHtml(workTitle) + '</strong>?';
    optionsEl.innerHTML = '';

    choices.forEach(function (choice, idx) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vocab-quiz-option';
      btn.setAttribute('data-correct', choice.id === correct.id ? 'true' : 'false');
      btn.setAttribute('data-id', choice.id);
      setQuizOptionButton(btn, labels[idx], escapeHtml(choice.term), choice.term);
      btn.addEventListener('click', function () {
        onWorkToTermQuizAnswer(btn, correct, choice, paddedId, optionsEl, feedbackEl, nextBtn, scoreEl);
      });
      optionsEl.appendChild(btn);
    });

    resetQuizChrome(feedbackEl, nextBtn, scoreEl);
  }

  function startTermToArtworkQuizQuestion() {
    _quizAnswered = false;
    clearQuizImage();
    const pool = getArtworkQuizPool();
    const promptEl = document.getElementById('vocab-quiz-prompt');
    const optionsEl = document.getElementById('vocab-quiz-options');
    const feedbackEl = document.getElementById('vocab-quiz-feedback');
    const nextBtn = document.getElementById('vocab-quiz-next');
    const scoreEl = document.getElementById('vocab-quiz-score');

    if (!promptEl || !optionsEl) return;

    const builder = window.VocabArtworkQuiz;
    const built = builder ? builder.buildTermToArtworkQuestion(pool) : null;
    if (!built) {
      promptEl.textContent =
        'Not enough distinct artworks for a fair vocabulary quiz in this unit. Try "All" or another unit.';
      optionsEl.innerHTML = '';
      if (feedbackEl) feedbackEl.textContent = '';
      if (nextBtn) nextBtn.hidden = true;
      return;
    }

    const correct = built.correct;
    const correctArtworkId = built.correctArtworkId;
    const artworkChoices = built.artworkChoices;
    const labels = ['A', 'B', 'C', 'D'];
    const paddedId = String(correctArtworkId).padStart(3, '0');

    promptEl.innerHTML = 'What artwork is associated with the vocabulary term <strong>' +
      escapeHtml(correct.term) + '</strong>?';
    optionsEl.innerHTML = '';

    artworkChoices.forEach(function (artworkId, idx) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vocab-quiz-option';
      btn.setAttribute('data-correct', artworkId === correctArtworkId ? 'true' : 'false');
      btn.setAttribute('data-artwork-id', String(artworkId));
      setQuizOptionButton(
        btn,
        labels[idx],
        escapeHtml(formatArtworkChoiceLabel(artworkId, correct)),
        formatArtworkChoiceLabelPlain(artworkId)
      );
      btn.addEventListener('click', function () {
        onTermToArtworkQuizAnswer(btn, correct, correctArtworkId, paddedId, optionsEl, feedbackEl, nextBtn, scoreEl);
      });
      optionsEl.appendChild(btn);
    });

    resetQuizChrome(feedbackEl, nextBtn, scoreEl);
  }

  function resetQuizChrome(feedbackEl, nextBtn, scoreEl) {
    if (feedbackEl) feedbackEl.textContent = '';
    if (nextBtn) nextBtn.hidden = true;
    if (scoreEl && _quizScore.total === 0) {
      scoreEl.textContent = 'Score: 0 / 0';
    }
  }

  function onDefinitionQuizAnswer(btn, correct, choice, optionsEl, feedbackEl, nextBtn, scoreEl) {
    if (_quizAnswered) return;
    _quizAnswered = true;
    _quizScore.total += 1;
    const isCorrect = choice.id === correct.id;
    if (isCorrect) _quizScore.correct += 1;

    optionsEl.querySelectorAll('.vocab-quiz-option').forEach(function (opt) {
      opt.disabled = true;
      if (opt.getAttribute('data-id') === correct.id) {
        opt.classList.add('vocab-quiz-option--correct');
      } else if (opt === btn && !isCorrect) {
        opt.classList.add('vocab-quiz-option--wrong');
      }
    });
    revealQuizChoices(optionsEl);

    if (feedbackEl) {
      feedbackEl.textContent = isCorrect ? 'Correct!' : 'Incorrect. The right answer is highlighted.';
    }
    if (scoreEl) {
      scoreEl.textContent = 'Score: ' + _quizScore.correct + ' / ' + _quizScore.total;
    }
    if (nextBtn) nextBtn.hidden = false;
  }

  function onWorkToTermQuizAnswer(btn, correct, choice, paddedId, optionsEl, feedbackEl, nextBtn, scoreEl) {
    if (_quizAnswered) return;
    _quizAnswered = true;
    _quizScore.total += 1;
    const isCorrect = choice.id === correct.id;
    if (isCorrect) _quizScore.correct += 1;

    optionsEl.querySelectorAll('.vocab-quiz-option').forEach(function (opt) {
      opt.disabled = true;
      if (opt.getAttribute('data-id') === correct.id) {
        opt.classList.add('vocab-quiz-option--correct');
      } else if (opt === btn && !isCorrect) {
        opt.classList.add('vocab-quiz-option--wrong');
      }
    });
    revealQuizChoices(optionsEl);

    if (feedbackEl) {
      const detailUrl = '../list/' + paddedId + '/';
      if (isCorrect) {
        feedbackEl.innerHTML = 'Correct! <a href="' + escapeAttr(detailUrl) + '">View ' + escapeHtml(getArtworkTitle(parseInt(paddedId, 10))) + '</a>';
      } else {
        feedbackEl.innerHTML = 'Incorrect. The right answer is highlighted. <a href="' + escapeAttr(detailUrl) + '">View ' + escapeHtml(getArtworkTitle(parseInt(paddedId, 10))) + '</a>';
      }
    }
    if (scoreEl) {
      scoreEl.textContent = 'Score: ' + _quizScore.correct + ' / ' + _quizScore.total;
    }
    if (nextBtn) nextBtn.hidden = false;
  }

  function onTermToArtworkQuizAnswer(btn, correctTerm, correctArtworkId, paddedId, optionsEl, feedbackEl, nextBtn, scoreEl) {
    if (_quizAnswered) return;
    _quizAnswered = true;
    _quizScore.total += 1;
    const isCorrect = btn.getAttribute('data-correct') === 'true';
    if (isCorrect) _quizScore.correct += 1;

    optionsEl.querySelectorAll('.vocab-quiz-option').forEach(function (opt) {
      opt.disabled = true;
      if (opt.getAttribute('data-correct') === 'true') {
        opt.classList.add('vocab-quiz-option--correct');
      } else if (opt === btn && !isCorrect) {
        opt.classList.add('vocab-quiz-option--wrong');
      }
    });
    revealQuizChoices(optionsEl);

    if (feedbackEl) {
      const detailUrl = '../list/' + paddedId + '/';
      const workLabel = escapeHtml(formatArtworkChoiceLabelPlain(correctArtworkId));
      if (isCorrect) {
        feedbackEl.innerHTML = 'Correct! <a href="' + escapeAttr(detailUrl) + '">' + workLabel + '</a>';
      } else {
        feedbackEl.innerHTML = 'Incorrect. The right answer is highlighted. <a href="' + escapeAttr(detailUrl) + '">' + workLabel + '</a>';
      }
    }
    if (scoreEl) {
      scoreEl.textContent = 'Score: ' + _quizScore.correct + ' / ' + _quizScore.total;
    }
    if (nextBtn) nextBtn.hidden = false;
  }

  function setupQuizNext() {
    const nextBtn = document.getElementById('vocab-quiz-next');
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
