import Phaser from "phaser";
import { Client, Room, getStateCallbacks } from "@colyseus/sdk";

const TILE_SIZE = 24;
const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 600;

// Must match server's START_ZONE (in tile units)
const START_ZONE = { x: 12, y: 8, width: 6, height: 4 };

type Direction = "up" | "down" | "left" | "right";

export class LobbyScene extends Phaser.Scene {
  private room!: Room;
  private mySessionId = "";
  private localPlayer!: Phaser.GameObjects.Rectangle;
  private myTileX = 0;
  private myTileY = 0;
  private remotePlayers: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wKey!: Phaser.Input.Keyboard.Key;
  private aKey!: Phaser.Input.Keyboard.Key;
  private sKey!: Phaser.Input.Keyboard.Key;
  private dKey!: Phaser.Input.Keyboard.Key;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super("LobbyScene");
  }

  async create() {
    console.log("LobbyScene create() called");
    this.add.rectangle(
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      0x1a1a2e,
    );

    // Start zone rectangle
    this.add
      .rectangle(
        (START_ZONE.x + START_ZONE.width / 2) * TILE_SIZE,
        (START_ZONE.y + START_ZONE.height / 2) * TILE_SIZE,
        START_ZONE.width * TILE_SIZE,
        START_ZONE.height * TILE_SIZE,
        0x00ff88,
        0.25,
      )
      .setStrokeStyle(2, 0x00ff88);
    this.add
      .text(
        (START_ZONE.x + START_ZONE.width / 2) * TILE_SIZE,
        START_ZONE.y * TILE_SIZE - 16,
        "STAND HERE TO START",
        { fontSize: "14px", color: "#00ff88" },
      )
      .setOrigin(0.5);

    this.statusText = this.add
      .text(CANVAS_WIDTH / 2, 30, "Waiting for players...", {
        fontSize: "20px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.aKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.sKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.dKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    const client = new Client("ws://192.168.1.229:2567");
    this.room = await client.joinOrCreate("game_room", { name: "Player" });
    this.mySessionId = this.room.sessionId;

    const $ = getStateCallbacks(this.room);

    $(this.room.state).players.onAdd((player, sessionId) => {
      const color = sessionId === this.mySessionId ? 0xffc400 : 0xffff00;
      const rect = this.add.rectangle(
        player.x * TILE_SIZE,
        player.y * TILE_SIZE,
        TILE_SIZE - 4,
        TILE_SIZE - 4,
        color,
      );

      if (sessionId === this.mySessionId) {
        this.localPlayer = rect;
        this.myTileX = player.x;
        this.myTileY = player.y;
      } else {
        this.remotePlayers.set(sessionId, rect);
        $(player).onChange(() => {
          rect.x = player.x * TILE_SIZE;
          rect.y = player.y * TILE_SIZE;
        });
      }
    });

    $(this.room.state).players.onRemove((_player, sessionId) => {
      this.remotePlayers.get(sessionId)?.destroy();
      this.remotePlayers.delete(sessionId);
    });

    $(this.room.state).listen("phase", (phase: string) => {
      if (phase === "lobby")
        this.statusText.setText("Stand in the zone together!");
      if (phase === "countdown") this.statusText.setText("Starting...");
      if (phase === "playing") {
        // Clean up lobby visuals before handing off to MainScene, so old
        // rectangles don't linger alongside MainScene's freshly-created ones
        this.localPlayer?.destroy();
        for (const rect of this.remotePlayers.values()) {
          rect.destroy();
        }
        this.remotePlayers.clear();

        this.scene.start("MainScene", { room: this.room });
      }
    });

    $(this.room.state).listen("countdown", (v: number) => {
      this.statusText.setText(`Starting in ${v}...`);
    });
  }

  update() {
    if (!this.room || !this.localPlayer) return;

    const speed = 0.08;
    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown || this.aKey.isDown) dx = -speed;
    else if (this.cursors.right.isDown || this.dKey.isDown) dx = speed;

    if (this.cursors.up.isDown || this.wKey.isDown) dy = -speed;
    else if (this.cursors.down.isDown || this.sKey.isDown) dy = speed;

    if (dx !== 0 || dy !== 0) {
      this.myTileX += dx;
      this.myTileY += dy;
      this.localPlayer.x = this.myTileX * TILE_SIZE;
      this.localPlayer.y = this.myTileY * TILE_SIZE;
      this.room.send("move", {
        x: this.myTileX,
        y: this.myTileY,
        facing: "down",
      });
    }
  }
}
