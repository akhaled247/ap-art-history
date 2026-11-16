/**
 * Routes between attribution (ArtworkQuiz) and association (ArtworkAssociationQuiz) builders.
 */

window.MixedListQuiz = (function () {
  'use strict';

  var DEFAULT_WEIGHT = 0.45;

  function buildMixedQuestion(pool, options, rng) {
    var random = rng || Math.random;
    var includeAttribution = options && options.includeAttribution === true;
    var weight = (options && typeof options.attributionWeight === 'number')
      ? options.attributionWeight
      : DEFAULT_WEIGHT;

    var tryAttributionFirst = includeAttribution && random() < weight;
    var first = tryAttributionFirst ? 'attribution' : 'association';
    var second = tryAttributionFirst ? 'association' : 'attribution';

    function buildAttribution() {
      if (!window.ArtworkQuiz) return null;
      var q = null;
      if (options && typeof options.buildAttribution === 'function') {
        q = options.buildAttribution(pool);
      } else {
        q = window.ArtworkQuiz.buildQuestion(pool, random);
      }
      if (q && !q.error) return Object.assign({ quizType: 'attribution' }, q);
      return null;
    }

    function buildAssociation() {
      if (!window.ArtworkAssociationQuiz) return null;
      var q = window.ArtworkAssociationQuiz.buildQuestion(pool, random, options);
      if (q && !q.error) return Object.assign({ quizType: 'association' }, q);
      return null;
    }

    function attempt(kind) {
      if (kind === 'attribution') {
        if (!includeAttribution) return null;
        return buildAttribution();
      }
      return buildAssociation();
    }

    var result = attempt(first);
    if (result) return result;
    result = attempt(second);
    if (result) return result;

    if (!includeAttribution) {
      return window.ArtworkAssociationQuiz
        ? window.ArtworkAssociationQuiz.buildQuestion(pool, random, options)
        : { error: 'insufficient_concepts' };
    }

    var attr = null;
    if (options && typeof options.buildAttribution === 'function') {
      attr = options.buildAttribution(pool);
    } else if (window.ArtworkQuiz) {
      attr = window.ArtworkQuiz.buildQuestion(pool, random);
    } else {
      attr = { error: 'pool_too_small' };
    }
    if (attr && !attr.error) return Object.assign({ quizType: 'attribution' }, attr);
    return window.ArtworkAssociationQuiz
      ? window.ArtworkAssociationQuiz.buildQuestion(pool, random, options)
      : attr;
  }

  return {
    buildMixedQuestion: buildMixedQuestion,
    DEFAULT_WEIGHT: DEFAULT_WEIGHT
  };
})();
