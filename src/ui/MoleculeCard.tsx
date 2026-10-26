import { useEffect, useState } from 'preact/hooks';
import { drawMolecule } from '../chem/rdkit';

export interface MoleculeCardProps {
  smiles: string;
  label?: string;
  sublabel?: string;
  highlight?: number[];
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  badge?: string;
}

export function MoleculeCard({ smiles, label, sublabel, highlight, size = 'md', selected, dimmed, onClick, badge }: MoleculeCardProps) {
  const [svg, setSvg] = useState<string>('');
  useEffect(() => {
    let alive = true;
    const dims = size === 'sm' ? [220, 150] : size === 'lg' ? [360, 240] : [300, 200];
    drawMolecule(smiles, { width: dims[0], height: dims[1], highlight }).then((s) => {
      if (alive) setSvg(s);
    });
    return () => {
      alive = false;
    };
  }, [smiles, highlight?.join(','), size]);
  const cls = ['molcard', `molcard-${size}`, selected ? 'is-selected' : '', dimmed ? 'is-dimmed' : '', onClick ? 'is-button' : ''].join(' ');
  return (
    <div class={cls} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}>
      {badge && <span class="molcard-badge">{badge}</span>}
      <div class="molcard-paper" dangerouslySetInnerHTML={{ __html: svg || '<svg viewBox="0 0 10 10"></svg>' }} />
      {label && <div class="molcard-label">{label}</div>}
      {sublabel && <div class="molcard-sub">{sublabel}</div>}
    </div>
  );
}
