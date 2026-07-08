import Phaser from "phaser";
import { MainScene } from "./scenes/MainScene";

new Phaser.Game({
  type: Phaser.AUTO,
  width: 900,
  height: 600,
  parent: "game",
  scene: [MainScene],
});
