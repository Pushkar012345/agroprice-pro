// Reciprocal Rank Fusion: merge several ranked lists without having to compare their raw scores
// (cosine similarity and keyword rank are on different scales). A chunk's fused score is
//   sum over lists of 1 / (k + rank)        rank starts at 1, k = 60 is the standard constant.
// A chunk that appears high in BOTH lists beats one that is first in only one.

const keyOf = (h) => `${h.source}#${h.chunkIndex}`;

// lists: { vector: [hit...], keyword: [hit...] }  (each already best-first)
function rrfFuse(lists, { k = 60 } = {}) {
  const merged = new Map();
  for (const [name, list] of Object.entries(lists)) {
    list.forEach((hit, i) => {
      const key = keyOf(hit);
      const e = merged.get(key) || { hit, rrf: 0, ranks: {} };
      e.rrf += 1 / (k + i + 1);
      e.ranks[name] = i + 1;
      merged.set(key, e);
    });
  }
  return [...merged.values()]
    .sort((a, b) => b.rrf - a.rrf || (b.hit.score ?? 0) - (a.hit.score ?? 0))
    .map(({ hit, rrf, ranks }) => ({ ...hit, rrf, ranks }));
}

module.exports = { rrfFuse, keyOf };