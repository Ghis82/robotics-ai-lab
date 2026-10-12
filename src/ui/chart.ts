/** Graphique linéaire minimal en canvas : trace uniquement les séries fournies (données de simulation). */
export interface Series { label: string; color: string; data: number[]; dashed?: boolean }
export function drawChart(cv: HTMLCanvasElement, xs: number[], series: Series[], opts: { yLabel: string; cursor?: number }) {
  const dpr = devicePixelRatio || 1; const W = cv.clientWidth, H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr;
  const c = cv.getContext('2d')!; c.scale(dpr, dpr); c.clearRect(0, 0, W, H); c.font = '10px system-ui';
  const all = series.flatMap((s) => s.data).filter(Number.isFinite);
  if (!xs.length || !all.length) { c.fillStyle = '#7b8aa5'; c.fillText('Aucune donnée — lancez une simulation.', 10, H / 2); return; }
  let lo = Math.min(0, ...all), hi = Math.max(...all); if (hi - lo < 1e-9) hi = lo + 1; const pad = { l: 38, r: 8, t: 8, b: 28 };
  const X = (x: number) => pad.l + ((x - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (W - pad.l - pad.r);
  const Y = (y: number) => H - pad.b - ((y - lo) / (hi - lo)) * (H - pad.t - pad.b);
  c.strokeStyle = '#1f2d47'; c.fillStyle = '#7b8aa5';
  for (let k = 0; k <= 4; k++) { const y = lo + (k / 4) * (hi - lo); c.beginPath(); c.moveTo(pad.l, Y(y)); c.lineTo(W - pad.r, Y(y)); c.stroke(); c.fillText(y.toFixed(2), 2, Y(y) + 3); }
  c.fillText(`t (s) — ${opts.yLabel}`, pad.l, H - 4);
  series.forEach((s) => { c.strokeStyle = s.color; c.setLineDash(s.dashed ? [5, 4] : []); c.lineWidth = 1.5; c.beginPath(); s.data.forEach((y, i) => (i ? c.lineTo(X(xs[i]), Y(y)) : c.moveTo(X(xs[i]), Y(y)))); c.stroke(); });
  c.setLineDash([]); let lx = pad.l + 4; series.forEach((s) => { c.fillStyle = s.color; c.fillRect(lx, pad.t, 8, 3); c.fillText(s.label, lx + 11, pad.t + 5); lx += c.measureText(s.label).width + 22; });
  if (opts.cursor != null) { c.strokeStyle = '#fff6'; c.beginPath(); c.moveTo(X(opts.cursor), pad.t); c.lineTo(X(opts.cursor), H - pad.b); c.stroke(); }
}
