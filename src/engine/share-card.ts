// Canvas-based share-card generator. Builds a 1200×630 OG-format PNG
// summarising the player's era: PM name, era years, final scores, top
// trait. Drawn purely with Canvas 2D so there's no new dependency and
// the card stays rasterised-consistent across browsers.
//
// Triggered by the "Stiahnuť obrázok" button on the game-over screen.
// The download path pairs with the existing share-result URL so players
// can post the PNG and tag it back to the same run.

import { getEra, getState } from './state';
import { esc } from './sanitize';

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

function drawMetric(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number,
  label: string, value: string, tint: string,
): void {
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundedRect(ctx, x, y, w, 120, 10);
  ctx.fill();
  ctx.strokeStyle = tint;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 18px "Source Sans 3", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label.toUpperCase(), x + w / 2, y + 34);
  ctx.fillStyle = tint;
  ctx.font = '700 48px "Source Sans 3", sans-serif';
  ctx.fillText(value, x + w / 2, y + 88);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number, maxWidth: number, lineHeight: number,
): number {
  const words = text.split(' ');
  let line = '';
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      ctx.fillText(line, x, y + lines * lineHeight);
      line = words[i] + ' ';
      lines++;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y + lines * lineHeight);
  return lines + 1;
}

export function generateShareCard(title: string): string {
  const G = getState();
  const era = getEra();
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 1200, 630);
  grad.addColorStop(0, '#0b1930');
  grad.addColorStop(1, '#0a0e14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1200, 630);

  // Gold accent bar
  ctx.fillStyle = '#d4a843';
  ctx.fillRect(0, 0, 1200, 6);

  // Header: PM name + era window
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '700 54px "Crimson Pro", serif';
  ctx.fillText(era.meta.headerTitle || era.meta.pmName || 'Slovenský PM', 60, 100);

  ctx.fillStyle = '#7a8c9e';
  ctx.font = '500 22px "Source Sans 3", sans-serif';
  const startYear = era.calendar?.startYear ?? 2020;
  const endYear = startYear + Math.ceil(era.totalMonths / 12);
  ctx.fillText(`${startYear} – ${endYear} · ${G.month} mesiacov odvládnutých`, 60, 138);

  // Ending title
  ctx.fillStyle = '#d4a843';
  ctx.font = '700 38px "Crimson Pro", serif';
  ctx.fillText(title, 60, 210);

  // 4 metric cards
  const colors = {
    podpora:   G.approval   >= 60 ? '#10b981' : G.approval   >= 35 ? '#eab308' : '#ef4444',
    stabilita: G.stability  >= 60 ? '#10b981' : G.stability  >= 35 ? '#eab308' : '#ef4444',
    koalicia:  G.coalition  >= 60 ? '#10b981' : G.coalition  >= 35 ? '#eab308' : '#ef4444',
    gdp:       G.econ.gdpGrowth >= 2 ? '#10b981' : G.econ.gdpGrowth >= 0 ? '#eab308' : '#ef4444',
  };
  const cardW = 260;
  const cardGap = 20;
  const cardStartX = 60;
  const cardY = 260;
  drawMetric(ctx, cardStartX + 0 * (cardW + cardGap), cardY, cardW, 'Podpora',    `${Math.round(G.approval)}%`,  colors.podpora);
  drawMetric(ctx, cardStartX + 1 * (cardW + cardGap), cardY, cardW, 'Stabilita',  `${Math.round(G.stability)}%`, colors.stabilita);
  drawMetric(ctx, cardStartX + 2 * (cardW + cardGap), cardY, cardW, 'Koalícia',   `${Math.round(G.coalition)}%`, colors.koalicia);
  drawMetric(ctx, cardStartX + 3 * (cardW + cardGap), cardY, cardW, 'Rast HDP',   `${G.econ.gdpGrowth.toFixed(1)}%`, colors.gdp);

  // Legacy line (laws passed, schemes used, reshuffles)
  const legacy: string[] = [];
  if (G.laws.length) legacy.push(`${G.laws.length} signátov${G.laws.length === 1 ? 'ý zákon' : 'é zákony'}`);
  const schemeUses = Object.keys(G.flags).filter(k => k.startsWith('scheme_used_') && G.flags[k]).length;
  if (schemeUses > 0) legacy.push(`${schemeUses} tajn${schemeUses === 1 ? 'á akcia' : 'ých akcií'}`);
  if (G.cabinet.reshuffleCount) legacy.push(`${G.cabinet.reshuffleCount} výmen ministrov`);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 22px "Source Sans 3", sans-serif';
  if (legacy.length) wrapText(ctx, `Odkaz: ${legacy.join(' · ')}`, 60, 430, 1080, 32);

  // Footer: brand + URL
  ctx.fillStyle = '#d4a843';
  ctx.font = '700 24px "Source Sans 3", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Slovenský Politický Simulátor', 60, 580);
  ctx.fillStyle = '#7a8c9e';
  ctx.font = '500 18px "Source Sans 3", sans-serif';
  ctx.fillText('saml-cell.github.io/slovak-pm-simulator', 60, 606);

  // Satirical disclaimer (small, right-aligned)
  ctx.fillStyle = '#7a8c9e';
  ctx.font = '400 13px "Source Sans 3", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Satira / civická výchova. Výroky fiktívne.', 1140, 606);

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

export function downloadShareCard(title: string): void {
  const dataUrl = generateShareCard(title);
  if (!dataUrl) return;
  const era = getEra();
  const filename = `spm-${era.meta.id || 'era'}-${Date.now()}.png`;
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Unused but documented: escape helper re-exported in case future share
// payloads need URL-safe text content.
export const _esc = esc;
