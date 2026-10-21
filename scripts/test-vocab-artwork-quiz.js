/**
 * Smoke test for artwork ↔ vocabulary quiz distractor rules.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const vocabulary = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/vocabulary.json'), 'utf8')
);

const quizJs = fs.readFileSync(
  path.join(__dirname, '../js/vocab-artwork-quiz.js'),
  'utf8'
);

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(quizJs, sandbox);
const VocabArtworkQuiz = sandbox.window.VocabArtworkQuiz;

function shouldShowArtworkReferences(entry) {
  if (!entry.artworks || entry.artworks.length === 0) return false;
  if (entry.units && entry.units.indexOf(0) !== -1) return false;
  if (entry.artworks.length > 10) return false;
  return true;
}

function poolForUnit(unit) {
  return vocabulary.filter(function (entry) {
    if (!shouldShowArtworkReferences(entry)) return false;
    if (unit === 'all') return true;
    return entry.units && entry.units.indexOf(unit) !== -1;
  });
}

function assertArtworkToTermValid(pool, built) {
  const linkedOnArtwork = pool.filter(function (e) {
    return VocabArtworkQuiz.termLinkedToArtwork(e, built.artworkId);
  });
  const linkedIds = new Set(linkedOnArtwork.map(function (e) { return e.id; }));
  const choiceIds = built.choices.map(function (e) { return e.id; });
  const otherLinked = choiceIds.filter(function (id) {
    return linkedIds.has(id) && id !== built.correct.id;
  });
  if (otherLinked.length) {
    throw new Error(
      'artwork→term: artwork ' + built.artworkId + ' has extra linked terms in choices: ' +
      otherLinked.join(', ')
    );
  }
  if (built.choices.length !== 4) {
    throw new Error('artwork→term: expected 4 choices');
  }
}

function assertTermToArtworkValid(pool, built) {
  const linked = new Set(built.correct.artworks || []);
  const invalid = built.artworkChoices.filter(function (id) {
    return linked.has(id) && id !== built.correctArtworkId;
  });
  if (invalid.length) {
    throw new Error(
      'term→artwork: term ' + built.correct.id + ' has extra linked artworks in choices: ' +
      invalid.join(', ')
    );
  }
  if (built.artworkChoices.length !== 4) {
    throw new Error('term→artwork: expected 4 artwork choices');
  }
}

let failures = 0;

[3, 'all'].forEach(function (unit) {
  const pool = poolForUnit(unit);
  for (let i = 0; i < 200; i++) {
    const builtA = VocabArtworkQuiz.buildArtworkToTermQuestion(pool, Math.random);
    if (pool.length >= 4 && !builtA) {
      console.error('Failed to build artwork→term for unit', unit);
      failures += 1;
      break;
    }
    if (builtA) assertArtworkToTermValid(pool, builtA);

    const builtB = VocabArtworkQuiz.buildTermToArtworkQuestion(pool, Math.random);
    const artworkIds = VocabArtworkQuiz.getArtworkIdsInPool(pool);
    if (pool.length >= 4 && artworkIds.length >= 4 && !builtB) {
      console.error('Failed to build term→artwork for unit', unit);
      failures += 1;
      break;
    }
    if (builtB) assertTermToArtworkValid(pool, builtB);
  }
});

// Vienna Genesis (50): parchment and vellum must never share a question about that work.
const unit3 = poolForUnit(3);
for (let i = 0; i < 500; i++) {
  const built = VocabArtworkQuiz.buildArtworkToTermQuestion(unit3, Math.random);
  if (!built || built.artworkId !== 50) continue;
  const terms = built.choices.map(function (e) { return e.id; });
  if (terms.indexOf('parchment') !== -1 && terms.indexOf('vellum') !== -1) {
    console.error('Vienna Genesis question included both parchment and vellum');
    failures += 1;
    break;
  }
}

if (failures) {
  process.exit(1);
}
console.log('vocab-artwork-quiz: OK');
