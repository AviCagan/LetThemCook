import Phaser from 'phaser';
import { LabScene } from './scenes/Lab';

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    pixelArt: true,
    roundPixels: true,
    transparent: true,
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    input: { activePointers: 1 },
    scene: [LabScene],
    render: { antialias: false },
    audio: { noAudio: true },
  });
}
