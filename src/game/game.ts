import Phaser from 'phaser';
import { LabScene } from './scenes/Lab';
import { LightScene, PourScene, StirScene, TemperatureScene, WorkupScene } from './scenes/minigames';

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#f6e7d8',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    input: { activePointers: 2 },
    scene: [LabScene, PourScene, TemperatureScene, WorkupScene, StirScene, LightScene],
    render: { antialias: false },
    audio: { noAudio: true },
  });
}
