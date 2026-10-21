/**
 * Artwork ↔ vocabulary quiz builders (vocab page "Artworks" mode).
 * Ensures only one choice is valid per question: distractors must not share the
 * prompt artwork (artwork→term) or the prompt term's artwork links (term→artwork).
 */

window.VocabArtworkQuiz = (function () {
  'use strict';

  var CHOICE_COUNT = 4;
  var DISTRACTOR_COUNT = CHOICE_COUNT - 1;

  function shuffle(arr, rng) {
    var a = arr.slice();
    var random = rng || Math.random;
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function termLinkedToArtwork(entry, artworkId) {
    if (!entry || artworkId == null) return false;
    return (entry.artworks || []).indexOf(artworkId) !== -1;
  }

  function getArtworkIdsInPool(pool) {
    var ids = [];
    (pool || []).forEach(function (entry) {
      (entry.artworks || []).forEach(function (id) {
        if (ids.indexOf(id) === -1) ids.push(id);
      });
    });
    return ids;
  }

  function pickTermDistractors(pool, correct, artworkId, rng) {
    return shuffle(
      (pool || []).filter(function (e) {
        return e.id !== correct.id && !termLinkedToArtwork(e, artworkId);
      }),
      rng
    ).slice(0, DISTRACTOR_COUNT);
  }

  function pickArtworkDistractors(artworkIds, correctTerm, correctArtworkId, rng) {
    var linked = new Set(correctTerm.artworks || []);
    return shuffle(
      (artworkIds || []).filter(function (id) {
        return id !== correctArtworkId && !linked.has(id);
      }),
      rng
    ).slice(0, DISTRACTOR_COUNT);
  }

  function buildArtworkToTermQuestion(pool, rng) {
    if (!pool || pool.length < CHOICE_COUNT) return null;
    var random = rng || Math.random;
    var terms = shuffle(pool, random);
    var t;
    var a;
    var artworkId;
    var distractors;
    for (t = 0; t < terms.length; t++) {
      var correct = terms[t];
      var artworks = shuffle(correct.artworks || [], random);
      for (a = 0; a < artworks.length; a++) {
        artworkId = artworks[a];
        distractors = pickTermDistractors(pool, correct, artworkId, random);
        if (distractors.length === DISTRACTOR_COUNT) {
          return {
            correct: correct,
            artworkId: artworkId,
            choices: shuffle([correct].concat(distractors), random)
          };
        }
      }
    }
    return null;
  }

  function buildTermToArtworkQuestion(pool, rng) {
    if (!pool || pool.length < CHOICE_COUNT) return null;
    var artworkIds = getArtworkIdsInPool(pool);
    if (artworkIds.length < CHOICE_COUNT) return null;
    var random = rng || Math.random;
    var terms = shuffle(pool, random);
    var t;
    var a;
    var correctArtworkId;
    var distractorIds;
    for (t = 0; t < terms.length; t++) {
      var correct = terms[t];
      var artworks = shuffle(correct.artworks || [], random);
      for (a = 0; a < artworks.length; a++) {
        correctArtworkId = artworks[a];
        distractorIds = pickArtworkDistractors(artworkIds, correct, correctArtworkId, random);
        if (distractorIds.length === DISTRACTOR_COUNT) {
          return {
            correct: correct,
            correctArtworkId: correctArtworkId,
            artworkChoices: shuffle([correctArtworkId].concat(distractorIds), random)
          };
        }
      }
    }
    return null;
  }

  return {
    CHOICE_COUNT: CHOICE_COUNT,
    termLinkedToArtwork: termLinkedToArtwork,
    getArtworkIdsInPool: getArtworkIdsInPool,
    pickTermDistractors: pickTermDistractors,
    pickArtworkDistractors: pickArtworkDistractors,
    buildArtworkToTermQuestion: buildArtworkToTermQuestion,
    buildTermToArtworkQuestion: buildTermToArtworkQuestion
  };
})();
