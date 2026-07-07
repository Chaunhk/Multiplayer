import Phaser from "phaser";
import { Client, Room, getStateCallbacks } from "@colyseus/sdk";

const TILE_SIZE = 40;
const GRID_WIDTH = 20;
const ROW_Y = 300;
const WALKWAY_Y = 380;
const DUMP_ZONE_MIN_X = 700;
const DUMP_ZONE_MAX_X = 780;

export class MainScene extends Phaser.Scene {
  private room!: Room;
  private mySessionId = "";
  private localPlayer!: Phaser.GameObjects.Rectangle;
  private remotePlayers: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private tileRects: Phaser.GameObjects.Rectangle[] = [];
  private ship!: Phaser.GameObjects.Triangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private statusText!: Phaser.GameObjects.Text;
  private carryingText!: Phaser.GameObjects.Text;
  private crashed = false;
  private isCarrying = false;

  constructor() {
    super("MainScene");
  }

  async create() {
    this.add.rectangle(400, 300, 800, 600, 0x1a1a2e);

    this.cursors = this.input.keyboard!.createCursorKeys();
    const spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.statusText = this.add.text(10, 10, "", { fontSize: "20px", color: "#ffffff" });
    this.carryingText = this.add.text(10, 35, "", { fontSize: "16px", color: "#ffcc00" });

    this.add.rectangle(
      (DUMP_ZONE_MIN_X + DUMP_ZONE_MAX_X) / 2,
      WALKWAY_Y,
      DUMP_ZONE_MAX_X - DUMP_ZONE_MIN_X,
      40,
      0x555555,
      0.5
    ).setStrokeStyle(2, 0xffffff);
    this.add.text(DUMP_ZONE_MIN_X + 5, WALKWAY_Y - 30, "DUMP", { fontSize: "14px", color: "#ffffff" });

    const client = new Client("ws://localhost:2567");
    this.room = await client.joinOrCreate("game_room", { name: "Player" });
    this.mySessionId = this.room.sessionId;

    const $ = getStateCallbacks(this.room);

    for (let i = 0; i < GRID_WIDTH; i++) {
      const rect = this.add.rectangle(
        i * TILE_SIZE + TILE_SIZE / 2,
        ROW_Y,
        TILE_SIZE - 2,
        TILE_SIZE - 2,
        0x8b5a2b
      ).setStrokeStyle(1, 0x000000);
      this.tileRects.push(rect);
    }

    this.ship = this.add.triangle(TILE_SIZE / 2, ROW_Y, 0, 20, 20, -20, -20, -20, 0x00ffff);

    $(this.room.state).tiles.onAdd((tile, index) => {
      this.updateTileVisual(index, tile.dug);
      $(tile).onChange(() => this.updateTileVisual(index, tile.dug));
    });

    $(this.room.state).listen("shipPosition", (value: number) => {
      this.ship.x = value * TILE_SIZE + TILE_SIZE / 2;
    });

    $(this.room.state).listen("crashed", (value: boolean) => {
      this.crashed = value;
      this.statusText.setText(value ? "💥 SHIP CRASHED! Game Over." : "Dig ahead, dump at DUMP zone!");
      if (value) this.ship.setFillStyle(0xff0000);
    });

    $(this.room.state).listen("dirtDelivered", (value: number) => {});

    $(this.room.state).players.onAdd((player, sessionId) => {
      const color = sessionId === this.mySessionId ? 0x00ff00 : 0xffff00;
      const rect = this.add.rectangle(player.x, player.y, 24, 24, color);

      if (sessionId === this.mySessionId) {
        this.localPlayer = rect;
        $(player).listen("carryingDirt", (value: boolean) => {
          this.isCarrying = value;
          this.carryingText.setText(value ? "🟫 Carrying dirt — go dump it!" : "");
          rect.setFillStyle(value ? 0x8b5a2b : 0x00ff00);
        });
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

    spaceKey.on("down", () => {
      if (this.crashed || !this.localPlayer) return;

      if (this.isCarrying) {
        this.room.send("dump");
      } else {
        const tileIndex = Math.floor(this.localPlayer.x / TILE_SIZE);
        this.room.send("dig", { tileIndex });
      }
    });
  }

  private updateTileVisual(index: number, dug: boolean) {
    const rect = this.tileRects[index];
    if (rect) {
      rect.setFillStyle(dug ? 0x3399ff : 0x8b5a2b);
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
      const newX = this.localPlayer.x + dx;
      const newY = this.localPlayer.y + dy;
      const clampedY = Phaser.Math.Clamp(newY, ROW_Y + 25, WALKWAY_Y + 100);
      this.localPlayer.x = newX;
      this.localPlayer.y = clampedY;
      this.room.send("move", { x: this.localPlayer.x, y: this.localPlayer.y });
    }
  }
}