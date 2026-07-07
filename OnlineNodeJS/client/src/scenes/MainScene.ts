import Phaser from "phaser";
import { Client, Room, getStateCallbacks } from "@colyseus/sdk";

export class MainScene extends Phaser.Scene {
  private room!: Room;
  private mySessionId = "";
  private localPlayer!: Phaser.GameObjects.Rectangle;
  private remotePlayers: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super("MainScene");
  }

  async create() {
    this.add.rectangle(400, 550, 800, 20, 0x888888);
    this.cursors = this.input.keyboard!.createCursorKeys();

    const client = new Client("ws://localhost:2567");
    this.room = await client.joinOrCreate("game_room", { name: "Player" });
    this.mySessionId = this.room.sessionId;

    const $ = getStateCallbacks(this.room);

    $(this.room.state).players.onAdd((player, sessionId) => {
      const color = sessionId === this.mySessionId ? 0x00ff00 : 0x3399ff;
      const rect = this.add.rectangle(player.x, player.y, 40, 60, color);

      if (sessionId === this.mySessionId) {
        this.localPlayer = rect;
      } else {
        this.remotePlayers.set(sessionId, rect);
        $(player).onChange(() => {
          rect.x = player.x;
          rect.y = player.y;
        });
      }
    });

    $(this.room.state).players.onRemove((_player, sessionId) => {
      const rect = this.remotePlayers.get(sessionId);
      rect?.destroy();
      this.remotePlayers.delete(sessionId);
    });
  }

  update() {
    if (!this.room || !this.localPlayer) return;

    const speed = 4;
    let moved = false;

    if (this.cursors.left.isDown) {
      this.localPlayer.x -= speed;
      moved = true;
    } else if (this.cursors.right.isDown) {
      this.localPlayer.x += speed;
      moved = true;
    }

    if (this.cursors.up.isDown) {
      this.localPlayer.y -= speed;
      moved = true;
    } else if (this.cursors.down.isDown) {
      this.localPlayer.y += speed;
      moved = true;
    }

    if (moved) {
      this.room.send("move", { x: this.localPlayer.x, y: this.localPlayer.y });
    }
  }
}