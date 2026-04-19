export function esc(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replace(/'/g, '&#39;');
}

// Slovak-specific text normalization for keyword matching.
// Strips combining diacritics (á→a, č→c, ľ→l, ý→y, etc.), lowercases, and
// collapses underscores + camelCase-boundary spaces so that legacy tokens
// like "plochaDan" or "efsf_nie" match natural input like "plochá daň" or
// "EFSF nie". Applied to BOTH sides of every keyword comparison so players
// typing with or without diacritics both get correct reactions.
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')        // strip combining marks
    .replace(/[_]+/g, ' ')                   // underscore → space
    .replace(/([a-z])([A-Z])/g, '$1 $2')     // camelCase → two words
    .toLowerCase();
}
