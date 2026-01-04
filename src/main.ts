import Phaser from 'phaser';
import { MainScene } from './renderer/MainScene';
import { GameConfig } from './core/GameConfig';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GameConfig.GRID_SIZE * 64 + 250, // Extra space for graphical sidebar
  height: GameConfig.GRID_SIZE * 64,
  parent: 'app',
  scene: [MainScene],
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 } // No gravity for top-down strategy
    }
  }
};

new Phaser.Game(config);
