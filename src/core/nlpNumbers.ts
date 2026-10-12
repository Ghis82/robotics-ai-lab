// Nombres écrits en français → chiffres (0 à 999 999, « virgule », « et demi »). Pur TS.
const U: Record<string, number> = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100, cents: 100, mille: 1000 };
const isNumWord = (w: string) => w in U || w === 'et' || w === 'virgule';
/** Remplace les suites de mots-nombres par leur valeur décimale (texte déjà normalisé sans accents, en minuscules). */
export function wordsToDigits(t: string): string {
  const toks = t.replace(/-/g, ' ').split(/(\s+)/); const out: string[] = []; let i = 0;
  while (i < toks.length) {
    const w = toks[i].trim();
    if (w && w in U && !(w === 'un' || w === 'une') || ((w === 'un' || w === 'une') && /^\s+$/.test(toks[i + 1] ?? '') && (((toks[i + 2] ?? '').trim() in U && (toks[i + 2] ?? '').trim() !== 'un') || (toks[i + 2] ?? '').trim() === 'virgule'))) {
      const seq: string[] = []; let j = i;
      while (j < toks.length) { const x = toks[j].trim(); if (!x) { j++; continue; } if (isNumWord(x) && !(x === 'et' && !(toks.slice(j + 1).find((y) => y.trim()) ?? '').trim().match(/^(un|une|onze|demi|demie)$/))) { seq.push(x); j++; } else if ((x === 'demi' || x === 'demie') && seq[seq.length - 1] === 'et') { seq.push(x); j++; } else break; }
      while (seq.length && (seq[seq.length - 1] === 'et' || seq[seq.length - 1] === 'virgule')) { seq.pop(); }
      out.push(String(evalSeq(seq)) + ' '); i = j; continue;
    }
    out.push(toks[i]); i++;
  }
  return out.join('').replace(/\s+/g, ' ').trim();
}
function evalInt(seq: string[]): number {
  let total = 0, cur = 0;
  for (let k = 0; k < seq.length; k++) { const w = seq[k]; if (w === 'et') continue; const v = U[w];
    if (v === 100) cur = (cur || 1) * 100; else if (v === 1000) { total += (cur || 1) * 1000; cur = 0; }
    else if (v === 20 && cur % 100 === 4) cur = cur - 4 + 80; // quatre-vingt(s)
    else cur += v; }
  return total + cur;
}
function evalSeq(seq: string[]): number {
  const vi = seq.indexOf('virgule'); const di = seq.indexOf('demi') >= 0 ? seq.indexOf('demi') : seq.indexOf('demie');
  if (vi >= 0) { const a = evalInt(seq.slice(0, vi)); const dec = seq.slice(vi + 1); const b = evalInt(dec); return +(`${a}.${dec.length === 1 && dec[0] === 'zero' ? '0' : b}`); }
  if (di >= 0) return evalInt(seq.slice(0, di - 1)) + 0.5;
  return evalInt(seq);
}
