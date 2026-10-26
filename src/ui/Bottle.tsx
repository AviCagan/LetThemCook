import { spriteDataUrl } from '../art/textures';
import type { Reagent } from '../content/types';

const BOTTLE_SHAPES = ['bottle_tall', 'bottle_round', 'bottle_flask'];

export function bottleShape(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BOTTLE_SHAPES[h % BOTTLE_SHAPES.length];
}

export function Bottle({ reagent, onClick, onInfo, small, wobble }: { reagent: Reagent; onClick?: () => void; onInfo?: () => void; small?: boolean; wobble?: boolean }) {
  const src = spriteDataUrl(bottleShape(reagent.id), wobble ? 1 : 0, 4);
  return (
    <div class={`bottle ${small ? 'bottle-sm' : ''} ${wobble ? 'is-wobble' : ''}`} onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      aria-label={reagent.name}>
      <img src={src} alt="" draggable={false} />
      <span class="bottle-label">{reagent.label}</span>
      {onInfo && (
        <button class="bottle-info" type="button" aria-label={`About ${reagent.name}`} onClick={(e) => { e.stopPropagation(); onInfo(); }}>?</button>
      )}
    </div>
  );
}
