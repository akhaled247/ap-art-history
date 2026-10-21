/**
 * Pseudo-random quiz selection: shuffled deck per pool, no immediate repeat.
 * Similar in feel to playlist shuffle — full variety before repeats, no back-to-back duplicates.
 */

window.QuizDeck = (function () {
  'use strict';

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

  /**
   * @param {object} options
   * @param {function(): Array} options.getItems - current pool (called each refill)
   * @param {function(*): string} options.getKey - stable id for repeat avoidance
   * @param {function} [options.rng]
   * @param {boolean} [options.noImmediateRepeat=true]
   */
  function createQuizDeck(options) {
    var getItems = options.getItems;
    var getKey = options.getKey;
    var rng = options.rng || Math.random;
    var noImmediateRepeat = options.noImmediateRepeat !== false;
    var retryMinAhead = options.retryMinAhead != null ? options.retryMinAhead : 2;
    var retryQueueFraction = options.retryQueueFraction != null ? options.retryQueueFraction : 0.45;

    var queue = [];
    var lastKey = null;
    var poolSignature = null;

    function computeSignature() {
      var items = getItems() || [];
      return items.length + ':' + items.map(getKey).sort().join('\u0001');
    }

    function avoidLeadingRepeat(shuffled) {
      if (!noImmediateRepeat || !lastKey || shuffled.length < 2) return shuffled;
      if (getKey(shuffled[0]) !== lastKey) return shuffled;
      for (var i = 1; i < shuffled.length; i++) {
        if (getKey(shuffled[i]) !== lastKey) {
          var tmp = shuffled[0];
          shuffled[0] = shuffled[i];
          shuffled[i] = tmp;
          break;
        }
      }
      return shuffled;
    }

    function refill() {
      var items = getItems() || [];
      if (!items.length) {
        queue = [];
        return;
      }
      queue = avoidLeadingRepeat(shuffle(items, rng));
    }

    function syncPool() {
      var sig = computeSignature();
      if (sig !== poolSignature) {
        poolSignature = sig;
        lastKey = null;
        queue = [];
      }
    }

    function next() {
      syncPool();
      if (!queue.length) refill();
      if (!queue.length) return null;

      var item = queue.shift();
      var key = getKey(item);

      if (noImmediateRepeat && lastKey && key === lastKey && queue.length) {
        queue.push(item);
        item = queue.shift();
        key = getKey(item);
      }

      lastKey = key;
      return item;
    }

    function reset() {
      poolSignature = null;
      queue = [];
      lastKey = null;
    }

    /**
     * Put a missed item back in the queue soon (not next), without waiting for a full reshuffle.
     * Drops other queued copies of the same key so the retry replaces a later natural slot.
     */
    function requeuePartway(item) {
      if (item == null) return;
      syncPool();
      var key = getKey(item);
      queue = queue.filter(function (queued) {
        return getKey(queued) !== key;
      });

      if (!queue.length) {
        queue.push(item);
        return;
      }

      var minAhead = Math.max(1, retryMinAhead);
      var cap = Math.max(minAhead, Math.floor(queue.length * retryQueueFraction));
      var ahead = minAhead;
      if (cap > minAhead) {
        ahead = minAhead + Math.floor(rng() * (cap - minAhead + 1));
      }
      ahead = Math.min(ahead, queue.length);
      queue.splice(ahead, 0, item);
    }

    return {
      next: next,
      reset: reset,
      refill: refill,
      requeuePartway: requeuePartway
    };
  }

  /**
   * Cycles through a fixed list of modes (e.g. artwork-to-term / term-to-artwork).
   */
  function createModeDeck(modes, rng) {
    return createQuizDeck({
      getItems: function () {
        return modes.slice();
      },
      getKey: function (mode) {
        return String(mode);
      },
      rng: rng,
      noImmediateRepeat: true
    });
  }

  return {
    shuffle: shuffle,
    createQuizDeck: createQuizDeck,
    createModeDeck: createModeDeck
  };
})();
