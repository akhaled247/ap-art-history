/**
 * Shuffled artwork deck for list-page attribution quizzes (Attribution tab + Connect mix).
 */

window.ListAttributionQuizSession = (function () {
  'use strict';

  var scopes = {};

  function questionKey(q) {
    if (!q || !q.artwork) return '';
    return q.mode + ':' + q.artwork.id + ':' + (q.fieldKey || '');
  }

  function createScope() {
    var _artworkDeck = null;
    var _modeDeck = null;
    var _lastQuestionKey = null;
    var _getPool = null;

    function ensureDecks() {
      if (!window.QuizDeck || !_getPool) return;
      if (!_artworkDeck) {
        _artworkDeck = window.QuizDeck.createQuizDeck({
          getItems: function () {
            return _getPool() || [];
          },
          getKey: function (artwork) {
            return String(artwork.id);
          }
        });
      }
      if (!_modeDeck && window.ArtworkQuiz && window.ArtworkQuiz.MODES) {
        _modeDeck = window.QuizDeck.createModeDeck(window.ArtworkQuiz.MODES);
      }
    }

    function configure(getPool) {
      _getPool = getPool;
      ensureDecks();
    }

    function reset() {
      if (_artworkDeck) _artworkDeck.reset();
      if (_modeDeck) _modeDeck.reset();
      _lastQuestionKey = null;
    }

    function resolveArtworkInPool(artwork) {
      if (!artwork || artwork.id == null || !_getPool) return artwork;
      var pool = _getPool();
      var i;
      for (i = 0; i < pool.length; i++) {
        if (pool[i].id === artwork.id) return pool[i];
      }
      return artwork;
    }

    function buildQuestion() {
      if (!window.ArtworkQuiz) return null;
      ensureDecks();
      var pool = _getPool ? _getPool() : [];
      if (!pool || pool.length < 4) {
        return { error: 'pool_too_small' };
      }

      var poolSize = pool.length;
      var attempts = Math.max(poolSize, 1);
      while (attempts > 0) {
        attempts -= 1;
        var pick = _artworkDeck ? _artworkDeck.next() : null;
        var modePick = _modeDeck ? _modeDeck.next() : null;
        var opts = {};
        if (pick) opts.preferredArtworkId = pick.id;
        if (modePick) opts.preferredMode = modePick;

        var built = window.ArtworkQuiz.buildQuestion(pool, Math.random, opts);
        if (!built || built.error) continue;

        var key = questionKey(built);
        if (_lastQuestionKey && key === _lastQuestionKey && attempts > 0) {
          continue;
        }
        _lastQuestionKey = key;
        return built;
      }

      return window.ArtworkQuiz.buildQuestion(pool);
    }

    function onMissed(built) {
      if (!built || !built.artwork || !_artworkDeck) return;
      _artworkDeck.requeuePartway(resolveArtworkInPool(built.artwork));
    }

    return {
      configure: configure,
      reset: reset,
      buildQuestion: buildQuestion,
      onMissed: onMissed
    };
  }

  return {
    forScope: function (scopeId) {
      if (!scopes[scopeId]) scopes[scopeId] = createScope();
      return scopes[scopeId];
    }
  };
})();