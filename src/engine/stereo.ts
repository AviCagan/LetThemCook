import type { StereoLabel } from '../content/types';

export function stereoLabelText(s: StereoLabel): string {
  return (
    {
      none: 'No stereochemistry to report',
      single_enantiomer: 'Single enantiomer',
      racemic: 'Racemic',
      meso: 'Meso',
      cis: 'cis',
      trans: 'trans',
      syn: 'syn',
      anti: 'anti',
    } as Record<StereoLabel, string>
  )[s];
}

export const STEREO_HELP: Record<StereoLabel, string> = {
  none: 'no stereocenters or geometry to report',
  single_enantiomer: 'one enantiomer only',
  racemic: 'both enantiomers, 1:1',
  meso: 'achiral despite stereocenters (internal mirror plane)',
  cis: 'same side',
  trans: 'opposite sides',
  syn: 'added to the same face',
  anti: 'added to opposite faces',
};
