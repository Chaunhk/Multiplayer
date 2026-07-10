import Phaser from "phaser";
import { Client, Room, getStateCallbacks } from "@colyseus/sdk";

// ─── Config (mirrors server) ────────────────────────────
const TILE_SIZE = 24; // pixels per tile — smaller since grid is now 30x20
const GRID_WIDTH = 30;
const GRID_HEIGHT = 20;

type Direction = "up" | "down" | "left" | "right";
const DELTA: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export class MainScene extends Phaser.Scene {
  private room!: Room;
  private mySessionId = "";

  private localPlayer!: Phaser.GameObjects.Rectangle;
  private myFacing: Direction = "down";
  private myCarrying = false;
  private myTileX = 0;
  private myTileY = 0;
  private remotePlayers: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private tileRects: Phaser.GameObjects.Rectangle[] = []; // index = y * GRID_WIDTH + x
  private dirtPileMarkers: Phaser.GameObjects.Arc[] = [];
  private ship!: Phaser.GameObjects.Text;
  private dockMarker!: Phaser.GameObjects.Star;
  private gridContainer!: Phaser.GameObjects.Container;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wKey!: Phaser.Input.Keyboard.Key;
  private aKey!: Phaser.Input.Keyboard.Key;
  private sKey!: Phaser.Input.Keyboard.Key;
  private dKey!: Phaser.Input.Keyboard.Key;
  private digKey!: Phaser.Input.Keyboard.Key; // Space: dig / dump (context-sensitive)
  private pickupKey!: Phaser.Input.Keyboard.Key; // E: pick up a dirt pile
  private flagKey!: Phaser.Input.Keyboard.Key; // Ctrl: hold to enter signal mode

  private statusText!: Phaser.GameObjects.Text;
  private carryingText!: Phaser.GameObjects.Text;

  constructor() {
    super("MainScene");
  }

  async create() {
    // Background
    // this.add.rectangle(
    //   (GRID_WIDTH * TILE_SIZE) / 2,
    //   (GRID_HEIGHT * TILE_SIZE) / 2,
    //   GRID_WIDTH * TILE_SIZE,
    //   GRID_HEIGHT * TILE_SIZE,
    //   0x1a1a2e,
    // );
    const CANVAS_WIDTH = 900;
    const CANVAS_HEIGHT = 600;
    const offsetX = (CANVAS_WIDTH - GRID_WIDTH * TILE_SIZE) / 2;
    const offsetY = (CANVAS_HEIGHT - GRID_HEIGHT * TILE_SIZE) / 2;
    this.add.rectangle(
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      0x1a1a2e,
    );
    this.gridContainer = this.add.container(offsetX, offsetY);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.aKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.sKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.dKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.digKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );
    this.pickupKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.E,
    );
    this.flagKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.CTRL,
    );

    this.statusText = this.add.text(10, 10, "", {
      fontSize: "18px",
      color: "#ffffff",
    });
    this.carryingText = this.add.text(10, 30, "", {
      fontSize: "14px",
      color: "#ffcc00",
    });

    // Draw the tile grid once (visuals get updated as state changes)
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const rect = this.add.rectangle(
          x * TILE_SIZE + TILE_SIZE / 2,
          y * TILE_SIZE + TILE_SIZE / 2,
          TILE_SIZE - 1,
          TILE_SIZE - 1,
          0x096e1a,
        );
        this.gridContainer.add(rect);
        this.tileRects.push(rect);

        const pile = this.add
          .circle(rect.x, rect.y, TILE_SIZE / 4, 0x4a3418)
          .setVisible(false);
        this.gridContainer.add(pile);
        this.dirtPileMarkers.push(pile);
      }
    }

    const client = new Client("ws://localhost:2567");
    this.room = await client.joinOrCreate("game_room", { name: "Player" });
    this.mySessionId = this.room.sessionId;

    const $ = getStateCallbacks(this.room);

    // Tiles
    $(this.room.state).tiles.onAdd((tile, index) => {
      this.updateTileVisual(index, tile.terrain, tile.hasDirtPile);
      $(tile).onChange(() =>
        this.updateTileVisual(index, tile.terrain, tile.hasDirtPile),
      );
    });

    // Ship — a triangle pointing in its facing direction
    this.ship = this.add
      .text(0, 0, "🚢", { fontSize: `${TILE_SIZE}px` })
      .setOrigin(0.5);
    this.gridContainer.add(this.ship);
    $(this.room.state).listen(
      "shipX",
      (v: number) => (this.ship.x = v * TILE_SIZE + TILE_SIZE / 2),
    );
    $(this.room.state).listen(
      "shipY",
      (v: number) => (this.ship.y = v * TILE_SIZE + TILE_SIZE / 2),
    );
    $(this.room.state).listen("shipFacing", (v: string) =>
      this.rotateShip(v as Direction),
    );

    // Dock marker
    // Dock marker
    this.dockMarker = this.add.star(0, 0, 5, 6, 12, 0xffcc00);
    this.gridContainer.add(this.dockMarker);

    $(this.room.state).listen("dockX", (v: number) => {
      this.dockMarker.x = v * TILE_SIZE + TILE_SIZE / 2;
      console.log("dockX received:", v);
    });
    $(this.room.state).listen("dockY", (v: number) => {
      this.dockMarker.y = v * TILE_SIZE + TILE_SIZE / 2;
      console.log("dockY received:", v);
    });

    $(this.room.state).listen("crashed", (v: boolean) => {
      if (v) {
        this.statusText.setText("💥 SHIP CRASHED! Game Over.");
        this.ship.setText("💥");
      }
    });
    $(this.room.state).listen("won", (v: boolean) => {
      if (v) this.statusText.setText("🎉 Ship reached the dock — you win!");
    });

    // Players
    $(this.room.state).players.onAdd((player, sessionId) => {
      const color = sessionId === this.mySessionId ? 0xffc400 : 0xffff00;
      const rect = this.add.rectangle(
        player.x * TILE_SIZE + TILE_SIZE / 2,
        player.y * TILE_SIZE + TILE_SIZE / 2,
        TILE_SIZE - 4,
        TILE_SIZE - 4,
        color,
      );
      this.gridContainer.add(rect);

      if (sessionId === this.mySessionId) {
        this.localPlayer = rect;
        this.myTileX = player.x;
        this.myTileY = player.y;
        $(player).listen("carrying", (v: boolean) => {
          this.myCarrying = v;
          this.carryingText.setText(v ? "Carrying dirt" : "");
          rect.setFillStyle(v ? 0xd101c0 : 0xffc400);
        });
      } else {
        this.remotePlayers.set(sessionId, rect);
        $(player).onChange(() => {
          rect.x = player.x * TILE_SIZE + TILE_SIZE / 2;
          rect.y = player.y * TILE_SIZE + TILE_SIZE / 2;
        });
      }
    });

    $(this.room.state).players.onRemove((_player, sessionId) => {
      this.remotePlayers.get(sessionId)?.destroy();
      this.remotePlayers.delete(sessionId);
    });

    // ─── Action keys (dig/dump/pickup context-sensitive) ───
    this.digKey.on("down", () => {
      if (!this.localPlayer) return;
      this.room.send(this.myCarrying ? "dump" : "dig");
    });

    this.pickupKey.on("down", () => {
      if (!this.localPlayer || this.myCarrying) return;
      this.room.send("pickup");
    });

    // ─── Signal mode: hold Ctrl + press a direction ────────
    const sendSignal = (direction: Direction) => {
      if (this.flagKey.isDown) {
        this.room.send("signal", { direction });
      }
    };
    this.cursors.up.on("down", () => sendSignal("up"));
    this.cursors.down.on("down", () => sendSignal("down"));
    this.cursors.left.on("down", () => sendSignal("left"));
    this.cursors.right.on("down", () => sendSignal("right"));
  }

  private rotateShip(facing: Direction) {
    // The 🚢 emoji visually faces left by default, so we flip/rotate
    // differently per direction rather than just rotating 0-360,
    // which would render the boat upside-down for some directions.
    switch (facing) {
      case "left":
        this.ship.setAngle(0);
        this.ship.setFlipX(false);
        break;
      case "right":
        this.ship.setAngle(0);
        this.ship.setFlipX(true);
        break;
      case "up":
        this.ship.setAngle(-90);
        this.ship.setFlipX(true);
        break;
      case "down":
        this.ship.setAngle(90);
        this.ship.setFlipX(true);
        break;
    }
  }

  private updateTileVisual(
    index: number,
    terrain: string,
    hasDirtPile: boolean,
  ) {
    const rect = this.tileRects[index];
    const pile = this.dirtPileMarkers[index];
    if (rect) rect.setFillStyle(terrain === "river" ? 0x3399ff : 0x8b5a2b);
    if (pile) pile.setVisible(hasDirtPile);
  }

  update() {
    if (!this.room || !this.localPlayer) return;

    // While holding the flag key, movement keys are reserved for signaling —
    // don't also move the player during that (per design: flag mode is a
    // distinct mode, not simultaneous movement).
    if (this.flagKey.isDown) return;

    const speed = 0.04; // tiles per frame-ish, tuned for feel
    let dx = 0;
    let dy = 0;
    let newFacing: Direction | null = null;

    if (this.cursors.left.isDown || this.aKey.isDown) {
      dx = -speed;
      newFacing = "left";
    } else if (this.cursors.right.isDown || this.dKey.isDown) {
      dx = speed;
      newFacing = "right";
    }

    if (this.cursors.up.isDown || this.wKey.isDown) {
      dy = -speed;
      newFacing = "up";
    } else if (this.cursors.down.isDown || this.sKey.isDown) {
      dy = speed;
      newFacing = "down";
    }

    if (dx !== 0 || dy !== 0) {
      this.myTileX += dx;
      this.myTileY += dy;

      this.localPlayer.x = this.myTileX * TILE_SIZE + TILE_SIZE / 2;
      this.localPlayer.y = this.myTileY * TILE_SIZE + TILE_SIZE / 2;
      if (newFacing) this.myFacing = newFacing;

      this.room.send("move", {
        x: this.myTileX,
        y: this.myTileY,
        facing: this.myFacing,
      });
    }
  }
}
