/**
 * Auto-link vocabulary terms in plain text (AFFCC study notes).
 */

window.VocabLinker = (function () {
  'use strict';

  const WORD_SPLIT = /([a-zA-Z][a-zA-Z0-9'-]*)/g;

  let _wordMap = null;
  let _cachedLength = 0;

  function normalizeWord(word) {
    return word.toLowerCase().replace(/[''`]/g, '');
  }

  function registerWord(map, word, entry) {
    const key = normalizeWord(word);
    if (!key || map.has(key)) return;
    map.set(key, { id: entry.id, term: entry.term });
  }

  function buildWordMap(vocabulary) {
    const map = new Map();
    (vocabulary || []).forEach(function (entry) {
      registerWord(map, entry.term, entry);
      (entry.aliases || []).forEach(function (alias) {
        registerWord(map, alias, entry);
      });
    });
    return map;
  }

  function lookupWord(word, wordMap) {
    const key = normalizeWord(word);
    if (!key) return null;

    if (wordMap.has(key)) return wordMap.get(key);

    if (key.length > 3 && key.endsWith('es')) {
      const stem = key.slice(0, -2);
      if (wordMap.has(stem)) return wordMap.get(stem);
    }
    if (key.length > 2 && key.endsWith('s')) {
      const stem = key.slice(0, -1);
      if (wordMap.has(stem)) return wordMap.get(stem);
    }

    return null;
  }

  function buildPatterns(vocabulary) {
    return buildWordMap(vocabulary);
  }

  function getWordMap(vocabulary) {
    if (!vocabulary || !vocabulary.length) return new Map();
    if (!_wordMap || _cachedLength !== vocabulary.length) {
      _wordMap = buildWordMap(vocabulary);
      _cachedLength = vocabulary.length;
    }
    return _wordMap;
  }

  function getPatterns(vocabulary) {
    const map = getWordMap(vocabulary);
    return map.size > 0 ? [{ _wordMap: map }] : [];
  }

  function resetCache() {
    _wordMap = null;
    _cachedLength = 0;
  }

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function termToRegExp(term) {
    const parts = String(term).trim().split(/\s+/).map(escapeRegExp);
    if (parts.length === 0) return null;
    if (parts.length === 1) {
      return new RegExp('\\b' + parts[0] + '\\b', 'gi');
    }
    return new RegExp('\\b' + parts.join('\\s+') + '\\b', 'gi');
  }

  function maskMatch(match) {
    return '\u2588'.repeat(Math.max(1, match.length));
  }

  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const row = new Array(n + 1);
    for (let j = 0; j <= n; j++) row[j] = j;
    for (let i = 1; i <= m; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = row[j];
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        row[j] = Math.min(
          row[j] + 1,
          row[j - 1] + 1,
          prev + cost
        );
        prev = tmp;
      }
    }
    return row[n];
  }

  function tokenizeTermParts(term) {
    return String(term || '')
      .split(/[\s\-/]+/)
      .map(function (part) { return part.trim(); })
      .filter(Boolean);
  }

  function addPromptTarget(targets, seen, phrase) {
    const raw = String(phrase || '').trim();
    if (!raw || raw.length < 3) return;
    const key = normalizeWord(raw);
    if (!key || seen.has(key)) return;
    seen.add(key);
    targets.push(raw);
    const lower = key;
    if (lower.length > 3 && lower.endsWith('es')) {
      addPromptTarget(targets, seen, lower.slice(0, -2));
    } else if (lower.length > 2 && lower.endsWith('s')) {
      addPromptTarget(targets, seen, lower.slice(0, -1));
    }
  }

  function extractSpellingVariants(definition) {
    const variants = [];
    if (!definition) return variants;
    const text = String(definition);
    const patterns = [
      /([A-Za-z][A-Za-z0-9'-]*)\s*,\s*also spelled\s+([A-Za-z][A-Za-z0-9'-]*)/gi,
      /also spelled\s+([A-Za-z][A-Za-z0-9'-]*)/gi,
      /also known as\s+([A-Za-z][A-Za-z0-9'-]*)/gi,
      /\baka\s+([A-Za-z][A-Za-z0-9'-]*)/gi
    ];
    patterns.forEach(function (re) {
      let match;
      while ((match = re.exec(text)) !== null) {
        for (let i = 1; i < match.length; i++) {
          if (match[i]) variants.push(match[i]);
        }
      }
    });
    return variants;
  }

  function collectPromptCensorTargets(promptEntry) {
    const targets = [];
    const seen = new Set();
    if (!promptEntry) return targets;

    addPromptTarget(targets, seen, promptEntry.term);
    (promptEntry.aliases || []).forEach(function (alias) {
      addPromptTarget(targets, seen, alias);
    });
    tokenizeTermParts(promptEntry.term).forEach(function (part) {
      addPromptTarget(targets, seen, part);
    });
    extractSpellingVariants(promptEntry.definition).forEach(function (variant) {
      addPromptTarget(targets, seen, variant);
    });

    return targets;
  }

  function isSimilarToPromptWord(word, promptTargets) {
    const w = normalizeWord(word);
    if (!w || w.length < 3) return false;

    for (let i = 0; i < promptTargets.length; i++) {
      const p = normalizeWord(promptTargets[i]);
      if (!p) continue;
      if (w === p) return true;

      const minLen = 4;
      if (w.length >= minLen && p.length >= minLen) {
        if (w.indexOf(p) !== -1 || p.indexOf(w) !== -1) return true;
      }
      if (w.length >= 5 && p.length >= 5 && levenshtein(w, p) <= 2) return true;
    }
    return false;
  }

  function applyPhraseCensoring(result, phrases) {
    phrases.sort(function (a, b) { return b.length - a.length; });
    phrases.forEach(function (phrase) {
      if (!phrase || phrase.length < 2) return;
      const re = termToRegExp(phrase);
      if (!re) return;
      result = result.replace(re, maskMatch);
    });
    return result;
  }

  /**
   * Replace vocabulary terms (and inflected single-word forms) with block characters.
   * options.promptEntry — also masks words similar to the term being quizzed.
   */
  function censorVocabularyInText(text, vocabulary, options) {
    if (!text) return '';
    options = options || {};
    let result = String(text);
    const phrases = [];
    (vocabulary || []).forEach(function (entry) {
      if (entry.term) phrases.push(entry.term);
      (entry.aliases || []).forEach(function (alias) {
        if (alias) phrases.push(alias);
      });
    });
    result = applyPhraseCensoring(result, phrases);

    const promptTargets = collectPromptCensorTargets(options.promptEntry);
    result = applyPhraseCensoring(result, promptTargets);

    const wordMap = getWordMap(vocabulary);
    const parts = result.split(WORD_SPLIT);
    result = parts.map(function (part) {
      if (!part) return part;
      if (/^[a-zA-Z][a-zA-Z0-9'-]*$/.test(part)) {
        if (lookupWord(part, wordMap)) return maskMatch(part);
        if (promptTargets.length && isSimilarToPromptWord(part, promptTargets)) {
          return maskMatch(part);
        }
      }
      return part;
    }).join('');

    return result;
  }

  function appendLinkedText(parentEl, text, options) {
    if (!parentEl || !text) return;
    options = options || {};

    let wordMap = options.wordMap;
    if (!wordMap && options.patterns && options.patterns[0] && options.patterns[0]._wordMap) {
      wordMap = options.patterns[0]._wordMap;
    }
    if (!wordMap || wordMap.size === 0) {
      parentEl.textContent = text;
      return;
    }

    const basePath = options.basePath || 'vocab/';
    const parts = text.split(WORD_SPLIT);
    const fragment = document.createDocumentFragment();

    parts.forEach(function (part) {
      if (!part) return;

      if (/^[a-zA-Z][a-zA-Z0-9'-]*$/.test(part)) {
        const match = lookupWord(part, wordMap);
        if (match) {
          const a = document.createElement('a');
          a.className = 'vocab-link';
          a.href = basePath + '#vocab-' + match.id;
          a.textContent = part;
          a.setAttribute('data-vocab-id', match.id);
          fragment.appendChild(a);
          return;
        }
      }

      fragment.appendChild(document.createTextNode(part));
    });

    parentEl.appendChild(fragment);
  }

  return {
    buildPatterns: buildPatterns,
    buildWordMap: buildWordMap,
    getWordMap: getWordMap,
    appendLinkedText: appendLinkedText,
    getPatterns: getPatterns,
    resetCache: resetCache,
    censorVocabularyInText: censorVocabularyInText
  };
})();
