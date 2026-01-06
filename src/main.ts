import Phaser from 'phaser';
import { MainScene } from './renderer/MainScene';
import { MenuScene } from './renderer/MenuScene';


const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: '100%',
  height: '100%',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  parent: 'app',
  dom: {
    createContainer: true
  },
  scene: [MenuScene, MainScene],
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 } // No gravity for top-down strategy
    }
  }
};

new Phaser.Game(config);
