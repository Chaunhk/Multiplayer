import Phaser from "phaser";
import { Client, Room, getStateCallbacks } from "@colyseus/sdk";

const TILE_SIZE = 40;
const GRID_WIDTH = 20;
const ROW_Y = 300;

export class MainScene extends Phaser.Scene {
  private room!: Room;
  private mySessionId = "";
  private localPlayer!: Phaser.GameObjects.Rectangle;
  private remotePlayers: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private tileRects: Phaser.GameObjects.Rectangle[] = [];
  private ship!: Phaser.GameObjects.Triangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private statusText!: Phaser.GameObjects.Text;
  private crashed = false;

  constructor() {
    super("MainScene");
  }

  async create() {
    this.add.rectangle(400, 300, 800, 600, 0x1a1a2e);

    this.cursors = this.input.keyboard!.createCursorKeys();
    const spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.statusText = this.add.text(10, 10, "", { fontSize: "20px", color: "#ffffff" });

    const client = new Client("ws://localhost:2567");
    this.room = await client.joinOrCreate("game_room", { name: "Player" });
    this.mySessionId = this.room.sessionId;

    const $ = getStateCallbacks(this.room);

    // Draw tile grid — one rectangle per tile
    for (let i = 0; i < GRID_WIDTH; i++) {
      const rect = this.add.rectangle(
        i * TILE_SIZE + TILE_SIZE / 2,
        ROW_Y,
        TILE_SIZE - 2,
        TILE_SIZE - 2,
        0x8b5a2b // brown = undug land
      ).setStrokeStyle(1, 0x000000);
      this.tileRects.push(rect);
    }

    // Ship — a simple triangle
    this.ship = this.add.triangle(TILE_SIZE / 2, ROW_Y, 0, 20, 20, -20, -20, -20, 0x00ffff);

    // Sync tile colors from server state
    $(this.room.state).tiles.onAdd((tile, index) => {
      this.updateTileVisual(index, tile.dug);
      $(tile).onChange(() => this.updateTileVisual(index, tile.dug));
    });

    // Ship position
    $(this.room.state).listen("shipPosition", (value: number) => {
      this.ship.x = value * TILE_SIZE + TILE_SIZE / 2;
    });

    // Crash state
    $(this.room.state).listen("crashed", (value: boolean) => {
      this.crashed = value;
      this.statusText.setText(value ? "💥 SHIP CRASHED! Game Over." : "Dig ahead of the ship!");
      if (value) this.ship.setFillStyle(0xff0000);
    });

    // Players
    $(this.room.state).players.onAdd((player, sessionId) => {
      const color = sessionId === this.mySessionId ? 0x00ff00 : 0xffff00;
      const rect = this.add.rectangle(player.x, player.y, 24, 24, color);

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
      this.remotePlayers.get(sessionId)?.destroy();
      this.remotePlayers.delete(sessionId);
    });

    // Spacebar: dig the tile the player is currently standing near
    spaceKey.on("down", () => {
      if (this.crashed || !this.localPlayer) return;
      const tileIndex = Math.floor(this.localPlayer.x / TILE_SIZE);
      this.room.send("dig", { tileIndex });
    });
  }

  private updateTileVisual(index: number, dug: boolean) {
    const rect = this.tileRects[index];
    if (rect) {
      rect.setFillStyle(dug ? 0x3399ff : 0x8b5a2b); // blue = river, brown = land
    }
  }

  update() {
    if (!this.room || !this.localPlayer) return;

    const speed = 3;
    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown) dx = -speed;
    else if (this.cursors.right.isDown) dx = speed;

    if (this.cursors.up.isDown) dy = -speed;
    else if (this.cursors.down.isDown) dy = speed;

    if (dx !== 0 || dy !== 0) {
      this.localPlayer.x += dx;
      this.localPlayer.y += dy;
      this.room.send("move", { x: this.localPlayer.x, y: this.localPlayer.y });
    }
  }
}