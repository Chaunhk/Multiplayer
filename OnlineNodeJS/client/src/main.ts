import Phaser from "phaser";
import { MainScene } from "./scenes/MainScene";
import { LobbyScene } from "./scenes/LobbyScene";

new Phaser.Game({
  type: Phaser.AUTO,
  width: 900,
  height: 600,
  parent: "game",
  scene: [LobbyScene, MainScene],
});
