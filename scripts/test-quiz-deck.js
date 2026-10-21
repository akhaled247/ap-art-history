/**
 * Smoke test for QuizDeck pseudo-random selection.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const deckJs = fs.readFileSync(path.join(__dirname, '../js/quiz-deck.js'), 'utf8');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(deckJs, sandbox);
const QuizDeck = sandbox.window.QuizDeck;

function seededRng(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

let failures = 0;

function assert(name, ok, detail) {
  if (!ok) {
    console.error('FAIL:', name, detail || '');
    failures += 1;
  }
}

const items = [
  { id: 'a' },
  { id: 'b' },
  { id: 'c' },
  { id: 'd' },
  { id: 'e' }
];

const deck = QuizDeck.createQuizDeck({
  getItems: function () {
    return items;
  },
  getKey: function (entry) {
    return entry.id;
  },
  rng: seededRng(42)
});

const seen = new Set();
let lastKey = null;
for (let i = 0; i < items.length; i++) {
  const next = deck.next();
  assert('next returns item', next && next.id, next);
  if (next) {
    assert('no duplicate within round', !seen.has(next.id), next.id);
    seen.add(next.id);
    assert('no immediate repeat', next.id !== lastKey, next.id + ' after ' + lastKey);
    lastKey = next.id;
  }
}

const secondRound = [];
for (let i = 0; i < 3; i++) {
  const next = deck.next();
  if (next) secondRound.push(next.id);
}
assert('second round starts', secondRound.length === 3, secondRound.join(','));
if (secondRound.length >= 2) {
  assert('no repeat across round boundary', secondRound[0] !== lastKey, secondRound[0]);
}

const modeDeck = QuizDeck.createModeDeck(['artwork-to-term', 'term-to-artwork'], seededRng(7));
const modes = [modeDeck.next(), modeDeck.next(), modeDeck.next(), modeDeck.next()];
assert('mode deck alternates modes', modes[0] !== modes[1], modes.join(','));
assert('mode deck cycles', modes[0] === modes[2], modes.join(','));

const retryDeck = QuizDeck.createQuizDeck({
  getItems: function () {
    return items;
  },
  getKey: function (entry) {
    return entry.id;
  },
  rng: seededRng(99),
  retryMinAhead: 2,
  retryQueueFraction: 0.5
});
retryDeck.next();
const missed = { id: 'a' };
retryDeck.requeuePartway(missed);
const positions = [];
for (let i = 0; i < 8; i++) {
  const n = retryDeck.next();
  if (n) positions.push(n.id);
}
const retryIndex = positions.indexOf('a');
assert('retry appears before end of queue', retryIndex !== -1 && retryIndex < positions.length - 1, positions.join(','));
assert('retry not immediate', retryIndex >= 2, 'index ' + retryIndex);

if (failures) {
  process.exit(1);
}
console.log('quiz-deck: OK');
