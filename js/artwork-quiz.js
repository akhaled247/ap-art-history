/**
 * Artwork attribution quiz: field accessors and question builders.
 * Modes: imageToField, titleToField, fieldToTitle.
 *
 * DATA POLICY: Quiz questions may only use attribution values the dataset
 * marks as quiz-eligible. Artist / combined artistCulture are OPT-IN per
 * artwork via quizFields.{artist|artistCulture} === true. Never invent or
 * infer attribution beyond artworks.json (+ explicit quizFields).
 * See docs/QUIZ-DATA-POLICY.md
 */

window.ArtworkQuiz = (function () {
  'use strict';

  var OPT_IN_QUIZ_FIELDS = ['artist', 'artistCulture'];
  var STANDARD_QUIZ_FIELDS = ['culture', 'date', 'medium', 'location', 'title'];

  var IMAGE_FIELD_KEYS = ['title', 'culture', 'date', 'medium'];
  var ASKABLE_KEYS = ['culture', 'date', 'medium', 'location'];
  var MODES = ['imageToField', 'titleToField', 'fieldToTitle'];

  var QUIZ_FIELDS = {
    title: { prompt: 'What is the title of this work?' },
    culture: { prompt: 'What is the culture of this work?' },
    date: { prompt: 'What is the date of this work?' },
    medium: { prompt: 'What is the medium of this work?' },
    location: { prompt: 'What is the location of this work?' }
  };

  var FIELD_META = {
    culture: {
      label: 'culture',
      titleToFieldTemplate: 'What is the culture of {title}?',
      fieldToTitleTemplate: 'Which artwork is associated with {value}?'
    },
    date: {
      label: 'date',
      titleToFieldTemplate: 'What is the date of {title}?',
      fieldToTitleTemplate: 'Which artwork has the date {value}?'
    },
    medium: {
      label: 'medium',
      titleToFieldTemplate: 'What is the medium of {title}?',
      fieldToTitleTemplate: 'Which artwork is made of {value}?'
    },
    location: {
      label: 'location',
      titleToFieldTemplate: 'What is the location of {title}?',
      fieldToTitleTemplate: 'Which artwork is from {value}?'
    },
    title: {
      label: 'title',
      titleToFieldTemplate: 'What is the title of {title}?',
      fieldToTitleTemplate: 'Which artwork is titled {value}?'
    },
    artist: {
      label: 'artist',
      titleToFieldTemplate: 'What is the artist of {title}?',
      fieldToTitleTemplate: 'Which artwork is by {value}?'
    },
    artistCulture: {
      label: 'artist or culture',
      titleToFieldTemplate: 'What is the artist or culture of {title}?',
      fieldToTitleTemplate: 'Which artwork is by or associated with {value}?'
    }
  };

  /**
   * Whether this artwork's value for fieldKey may appear in a quiz question or answer.
   */
  function canQuizField(artwork, fieldKey) {
    if (!artwork || !fieldKey) return false;

    if (OPT_IN_QUIZ_FIELDS.indexOf(fieldKey) !== -1) {
      if (!artwork.quizFields || artwork.quizFields[fieldKey] !== true) {
        return false;
      }
    } else if (STANDARD_QUIZ_FIELDS.indexOf(fieldKey) === -1) {
      return false;
    }

    return artworkHasField(artwork, fieldKey);
  }

  function getQuizAnswer(artwork, fieldKey) {
    if (!artwork) return '';
    switch (fieldKey) {
      case 'title':
        return artwork.title || '';
      case 'artist':
        return artwork.artist || '';
      case 'culture':
        return artwork.culture || '';
      case 'location':
        return artwork.locationDisplay || '';
      case 'artistCulture':
        return window.ArtworkRender
          ? window.ArtworkRender.formatArtistCulture(artwork)
          : [artwork.artist, artwork.culture].filter(Boolean).join(' • ') || '—';
      case 'date':
        return artwork.dateDisplay || '';
      case 'medium':
        return artwork.medium || '—';
      default:
        return '';
    }
  }

  function isEmptyAnswer(fieldKey, value) {
    var v = (value || '').trim();
    if (!v || v === '—') return true;
    return false;
  }

  function artworkHasField(artwork, fieldKey) {
    return !isEmptyAnswer(fieldKey, getQuizAnswer(artwork, fieldKey));
  }

  function getDistinctAnswers(pool, fieldKey) {
    var seen = new Set();
    var distinct = [];
    pool.forEach(function (artwork) {
      if (!canQuizField(artwork, fieldKey)) return;
      var answer = getQuizAnswer(artwork, fieldKey).trim();
      if (isEmptyAnswer(fieldKey, answer) || seen.has(answer)) return;
      seen.add(answer);
      distinct.push(answer);
    });
    return distinct;
  }

  function countArtworksWithValue(pool, fieldKey, value) {
    var target = (value || '').trim();
    var count = 0;
    pool.forEach(function (artwork) {
      if (!canQuizField(artwork, fieldKey)) return;
      if (getQuizAnswer(artwork, fieldKey).trim() === target) count += 1;
    });
    return count;
  }

  function isUniqueClue(pool, fieldKey, value) {
    return countArtworksWithValue(pool, fieldKey, value) === 1;
  }

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

  function pickRandom(arr, rng) {
    if (!arr.length) return null;
    var random = rng || Math.random;
    return arr[Math.floor(random() * arr.length)];
  }

  function orderArtworksForBuild(pool, preferredArtworkId, rng) {
    var ordered = shuffle(pool, rng);
    if (preferredArtworkId == null) return ordered;
    var preferred = [];
    var rest = [];
    ordered.forEach(function (artwork) {
      if (artwork.id === preferredArtworkId) preferred.push(artwork);
      else rest.push(artwork);
    });
    return preferred.concat(rest);
  }

  function orderModesForBuild(preferredMode, rng) {
    if (!preferredMode) return shuffle(MODES.slice(), rng);
    var rest = MODES.filter(function (m) { return m !== preferredMode; });
    return [preferredMode].concat(shuffle(rest, rng));
  }

  function pickFourChoices(correct, distinctValues, rng) {
    if (distinctValues.length < 4) return null;
    var correctTrim = (correct || '').trim();
    var distractors = shuffle(
      distinctValues.filter(function (d) { return d !== correctTrim; }),
      rng
    ).slice(0, 3);
    if (distractors.length < 3) return null;
    return shuffle([correctTrim].concat(distractors), rng);
  }

  function fillTemplate(template, vars) {
    var out = template;
    Object.keys(vars).forEach(function (key) {
      out = out.split('{' + key + '}').join(vars[key]);
    });
    return out;
  }

  function askableKeysForPool(pool) {
    var keys = ASKABLE_KEYS.slice();
    OPT_IN_QUIZ_FIELDS.forEach(function (optKey) {
      var any = pool.some(function (a) { return canQuizField(a, optKey); });
      if (any) keys.push(optKey);
    });
    return keys;
  }

  function imageFieldKeysForPool(pool) {
    var keys = IMAGE_FIELD_KEYS.slice();
    OPT_IN_QUIZ_FIELDS.forEach(function (optKey) {
      var any = pool.some(function (a) { return canQuizField(a, optKey); });
      if (any && keys.indexOf(optKey) === -1) keys.push(optKey);
    });
    return keys;
  }

  function buildFieldValueQuestion(pool, fieldKey, rng, options) {
    if (!pool.some(function (a) { return canQuizField(a, fieldKey); })) {
      return null;
    }

    var distinct = getDistinctAnswers(pool, fieldKey);
    if (distinct.length < 4) return null;

    var random = rng || Math.random;
    var eligible = pool.filter(function (artwork) {
      if (!canQuizField(artwork, fieldKey)) return false;
      var a = getQuizAnswer(artwork, fieldKey).trim();
      return distinct.indexOf(a) !== -1;
    });
    if (!eligible.length) return null;

    var ordered = orderArtworksForBuild(
      eligible,
      options && options.preferredArtworkId,
      random
    );
    var artwork = null;
    var correct = '';
    var choices = null;
    var ai;
    for (ai = 0; ai < ordered.length; ai++) {
      artwork = ordered[ai];
      correct = getQuizAnswer(artwork, fieldKey).trim();
      choices = pickFourChoices(correct, distinct, random);
      if (choices) break;
    }
    if (!choices || !artwork) return null;

    var meta = FIELD_META[fieldKey] || {};
    var prompt;
    if (options.mode === 'titleToField') {
      prompt = fillTemplate(meta.titleToFieldTemplate || 'What is the {label} of {title}?', {
        title: artwork.title,
        label: meta.label || fieldKey
      });
    } else {
      prompt = (QUIZ_FIELDS[fieldKey] && QUIZ_FIELDS[fieldKey].prompt) ||
        'What is the ' + (meta.label || fieldKey) + ' of this work?';
    }

    return {
      mode: options.mode,
      showImage: options.showImage === true,
      artwork: artwork,
      fieldKey: fieldKey,
      prompt: prompt,
      promptTitle: options.mode === 'titleToField' ? artwork.title : null,
      correctAnswer: correct,
      choices: choices
    };
  }

  function buildImageToFieldQuestion(pool, rng, buildOptions) {
    var random = rng || Math.random;
    var fieldOrder = shuffle(imageFieldKeysForPool(pool), random);
    var i;
    for (i = 0; i < fieldOrder.length; i++) {
      var q = buildFieldValueQuestion(pool, fieldOrder[i], random, {
        mode: 'imageToField',
        showImage: true,
        preferredArtworkId: buildOptions && buildOptions.preferredArtworkId
      });
      if (q) return q;
    }
    return null;
  }

  function buildTitleToFieldQuestion(pool, rng, buildOptions) {
    var random = rng || Math.random;
    var fieldOrder = shuffle(askableKeysForPool(pool), random);
    var i;
    for (i = 0; i < fieldOrder.length; i++) {
      var q = buildFieldValueQuestion(pool, fieldOrder[i], random, {
        mode: 'titleToField',
        showImage: false,
        preferredArtworkId: buildOptions && buildOptions.preferredArtworkId
      });
      if (q) return q;
    }
    return null;
  }

  function buildFieldToTitleQuestion(pool, rng, buildOptions) {
    if (getDistinctAnswers(pool, 'title').length < 4) return null;

    var random = rng || Math.random;
    var preferredId = buildOptions && buildOptions.preferredArtworkId;
    var keys = askableKeysForPool(pool);

    if (preferredId != null) {
      var preferredArt = null;
      var pi;
      for (pi = 0; pi < pool.length; pi++) {
        if (pool[pi].id === preferredId) {
          preferredArt = pool[pi];
          break;
        }
      }
      if (preferredArt) {
        var fieldOrder = shuffle(keys, random);
        var fk;
        for (fk = 0; fk < fieldOrder.length; fk++) {
          var fieldKey = fieldOrder[fk];
          if (!canQuizField(preferredArt, fieldKey)) continue;
          var clue = getQuizAnswer(preferredArt, fieldKey).trim();
          if (!isUniqueClue(pool, fieldKey, clue)) continue;
          var correctTitle = preferredArt.title.trim();
          var titleDistinct = getDistinctAnswers(pool, 'title');
          var choiceList = pickFourChoices(correctTitle, titleDistinct, random);
          if (!choiceList) continue;
          var meta = FIELD_META[fieldKey] || {};
          return {
            mode: 'fieldToTitle',
            showImage: false,
            artwork: preferredArt,
            fieldKey: fieldKey,
            prompt: fillTemplate(meta.fieldToTitleTemplate || 'Which artwork matches {value}?', {
              value: clue
            }),
            correctAnswer: correctTitle,
            choices: choiceList
          };
        }
      }
    }

    var maxAttempts = 40;
    var attempt;
    for (attempt = 0; attempt < maxAttempts; attempt++) {
      var fieldKey = pickRandom(keys, random);
      var withField = pool.filter(function (a) { return canQuizField(a, fieldKey); });
      if (!withField.length) continue;

      var artwork = pickRandom(withField, random);
      var clue = getQuizAnswer(artwork, fieldKey).trim();
      if (!isUniqueClue(pool, fieldKey, clue)) continue;

      var correct = artwork.title.trim();
      var titleDistinct = getDistinctAnswers(pool, 'title');
      var choices = pickFourChoices(correct, titleDistinct, random);
      if (!choices) continue;

      var meta = FIELD_META[fieldKey] || {};
      var prompt = fillTemplate(meta.fieldToTitleTemplate || 'Which artwork matches {value}?', {
        value: clue
      });

      return {
        mode: 'fieldToTitle',
        showImage: false,
        artwork: artwork,
        fieldKey: fieldKey,
        prompt: prompt,
        correctAnswer: correct,
        choices: choices
      };
    }
    return null;
  }

  function buildQuestion(pool, rng, buildOptions) {
    if (!pool || pool.length < 4) {
      return { error: 'pool_too_small' };
    }

    var random = rng || Math.random;
    var preferredMode = buildOptions && buildOptions.preferredMode;
    var modeOrder = orderModesForBuild(preferredMode, random);
    var i;
    for (i = 0; i < modeOrder.length; i++) {
      var q = null;
      if (modeOrder[i] === 'imageToField') {
        q = buildImageToFieldQuestion(pool, random, buildOptions);
      } else if (modeOrder[i] === 'titleToField') {
        q = buildTitleToFieldQuestion(pool, random, buildOptions);
      } else if (modeOrder[i] === 'fieldToTitle') {
        q = buildFieldToTitleQuestion(pool, random, buildOptions);
      }
      if (q) return q;
    }

    return { error: 'insufficient_distinct_answers' };
  }

  return {
    MODES: MODES,
    OPT_IN_QUIZ_FIELDS: OPT_IN_QUIZ_FIELDS,
    STANDARD_QUIZ_FIELDS: STANDARD_QUIZ_FIELDS,
    IMAGE_FIELD_KEYS: IMAGE_FIELD_KEYS,
    ASKABLE_KEYS: ASKABLE_KEYS,
    FIELD_KEYS: IMAGE_FIELD_KEYS,
    QUIZ_FIELDS: QUIZ_FIELDS,
    FIELD_META: FIELD_META,
    canQuizField: canQuizField,
    getQuizAnswer: getQuizAnswer,
    getDistinctAnswers: getDistinctAnswers,
    countArtworksWithValue: countArtworksWithValue,
    isUniqueClue: isUniqueClue,
    buildImageToFieldQuestion: buildImageToFieldQuestion,
    buildTitleToFieldQuestion: buildTitleToFieldQuestion,
    buildFieldToTitleQuestion: buildFieldToTitleQuestion,
    buildQuestion: buildQuestion
  };
})();
