import { Room, Client } from "@colyseus/core";
import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

// ─── Config ──────────────────────────────────────────────
const GRID_WIDTH = 30;
const GRID_HEIGHT = 20;
const SHIP_SPAWN_COL = 1;
const DOCK_COL = GRID_WIDTH - 2; // column 28
const SHIP_SPEED = 0.5 / 1.5; // tiles per second (1 tile every 1.5s)

type Direction = "up" | "down" | "left" | "right";
const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};
const DELTA: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

// ─── Schema ──────────────────────────────────────────────
class Player extends Schema {
  @type("number") x: number = 0; // tile coordinates, not pixels
  @type("number") y: number = 0;
  @type("string") facing: Direction = "down";
  @type("string") name: string = "";
  // "carrying" is either "" (nothing), "dirt" (freshly dug or picked up pile) — same representation either way
  @type("boolean") carrying: boolean = false;
}

class Tile extends Schema {
  // "ground" | "river" | tile can also have a dirt pile ON TOP of either
  @type("string") terrain: "ground" | "river" = "ground";
  @type("boolean") hasDirtPile: boolean = false;
}

class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type([Tile]) tiles = new ArraySchema<Tile>(); // flat array, index = y * GRID_WIDTH + x

  @type("number") shipX: number = 0; // continuous world position, in tile units (can be fractional)
  @type("number") shipY: number = 0;
  @type("string") shipFacing: Direction = "right";
  @type("string") shipSignal: string = ""; // pending turn signal: "" | "up" | "down" | "left" | "right"
  @type("boolean") crashed: boolean = false;
  @type("boolean") won: boolean = false;

  @type("number") dockX: number = 0;
  @type("number") dockY: number = 0;
}

export class GameRoom extends Room {
  maxClients = 5; // design: up to 5 players
  state = new GameState();
  private shipLoopHandle: any;

  onCreate() {
    this.initGrid();
    this.initShipAndDock();
    this.registerMessageHandlers();
    this.startShipLoop();
  }

  // ─── Setup ──────────────────────────────────────────────

  private tileIndex(x: number, y: number): number {
    return y * GRID_WIDTH + x;
  }

  private tileAt(x: number, y: number): Tile | undefined {
    if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) return undefined;
    return this.state.tiles[this.tileIndex(x, y)];
  }

  private initGrid() {
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const tile = new Tile();
        // Design: outer 1-tile ring is border — we just leave it as "ground"
        // and simply never let the ship path start/end there. Players CAN
        // walk near it; it's non-functional, not physically special.
        this.state.tiles.push(tile);
      }
    }
  }

  private initShipAndDock() {
    // Design: ship & dock rows are independently random within [5, 14]
    const shipRow = 5 + Math.floor(Math.random() * 10);
    const dockRow = 5 + Math.floor(Math.random() * 10);

    this.state.shipX = SHIP_SPAWN_COL;
    this.state.shipY = shipRow;
    this.state.shipFacing = "right";

    this.state.dockX = DOCK_COL;
    this.state.dockY = dockRow;

    // Design: head start — 3 tiles ahead of the ship's spawn are pre-dug
    for (let i = 1; i <= 3; i++) {
      const tile = this.tileAt(SHIP_SPAWN_COL + i, shipRow);
      if (tile) tile.terrain = "river";
    }
    // The ship's own starting tile counts as passable too
    const startTile = this.tileAt(SHIP_SPAWN_COL, shipRow);
    if (startTile) startTile.terrain = "river";
  }

  // ─── Player actions ─────────────────────────────────────

  private registerMessageHandlers() {
    this.onMessage(
      "move",
      (client, data: { x: number; y: number; facing: Direction }) => {
        const player = this.state.players.get(client.sessionId);
        if (!player) return;
        // NOTE: client-authoritative position for now (same simplification as
        // the earlier prototype) — server currently trusts the client's x/y.
        // A hardening pass later would validate steps server-side instead.
        player.x = data.x;
        player.y = data.y;
        player.facing = data.facing;
      },
    );

    // Dig: player faces a ground tile, not carrying anything -> becomes river, player now carries dirt
    this.onMessage("dig", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.carrying) return;

      const target = this.facingTile(player);
      if (target && target.terrain === "ground" && !target.hasDirtPile) {
        target.terrain = "river";
        player.carrying = true;
      }
    });

    // Dump: player carrying dirt, faces an empty tile (no pile already there)
    this.onMessage("dump", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.carrying) return;

      const target = this.facingTile(player);
      if (!target || target.hasDirtPile) return; // can't dump on existing pile

      if (target.terrain === "ground") {
        // Design: dumping dirt onto ground creates a pile (new obstacle)
        target.hasDirtPile = true;
      } else if (target.terrain === "river") {
        // Design: dumping dirt back into a dug river fills it back to ground
        target.terrain = "ground";
      }
      player.carrying = false;
    });

    // Pick up an existing dirt pile to relocate it
    this.onMessage("pickup", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.carrying) return;

      const target = this.facingTile(player);
      if (target && target.hasDirtPile) {
        target.hasDirtPile = false;
        player.carrying = true;
      }
    });

    // Turn signal: only perpendicular turns are valid; opposite direction rejected
    this.onMessage("signal", (client, data: { direction: Direction }) => {
      const requested = data.direction;
      const current = this.state.shipFacing as Direction;

      if (requested === current) return; // already going that way, no-op
      if (requested === OPPOSITE[current]) return; // design rule: can't signal a reverse

      this.state.shipSignal = requested;
    });
  }

  private facingTile(player: Player): Tile | undefined {
    const delta = DELTA[player.facing as Direction];
    // Player x/y are stored in tile units (see NOTE in "move" handler);
    // "facing tile" is simply one tile-step from their current position.
    const targetX = Math.round(player.x) + delta.dx;
    const targetY = Math.round(player.y) + delta.dy;
    return this.tileAt(targetX, targetY);
  }

  // ─── Ship loop ──────────────────────────────────────────

  private startShipLoop() {
    // Runs frequently (small time steps) so movement is smooth/continuous
    // rather than tile-by-tile hopping, per design.
    const TICK_MS = 50;
    this.shipLoopHandle = this.clock.setInterval(() => {
      if (this.state.crashed || this.state.won) return;
      this.advanceShip(TICK_MS / 1000);
    }, TICK_MS);
  }

  private advanceShip(deltaSeconds: number) {
    const distance = SHIP_SPEED * deltaSeconds;
    const facing = this.state.shipFacing as Direction;
    const delta = DELTA[facing];

    // The tile the ship is currently moving toward (its leading edge)
    const currentTileX =
      delta.dx > 0
        ? Math.floor(this.state.shipX)
        : delta.dx < 0
          ? Math.ceil(this.state.shipX)
          : Math.round(this.state.shipX);
    const currentTileY =
      delta.dy > 0
        ? Math.floor(this.state.shipY)
        : delta.dy < 0
          ? Math.ceil(this.state.shipY)
          : Math.round(this.state.shipY);
    const targetTileX = currentTileX + delta.dx;
    const targetTileY = currentTileY + delta.dy;

    // Check for a pending turn signal — take it if the perpendicular tile is river
    if (this.state.shipSignal) {
      const signalDir = this.state.shipSignal as Direction;
      const signalDelta = DELTA[signalDir];
      const signalTileX = currentTileX + signalDelta.dx;
      const signalTileY = currentTileY + signalDelta.dy;
      const signalTile = this.tileAt(signalTileX, signalTileY);

      // Only actually turn once the ship is centered-ish on a tile (avoids
      // turning mid-tile in a way that looks like teleporting sideways)
      const nearCenter =
        Math.abs(this.state.shipX - Math.round(this.state.shipX)) < 0.05 &&
        Math.abs(this.state.shipY - Math.round(this.state.shipY)) < 0.05;

      if (signalTile && signalTile.terrain === "river" && nearCenter) {
        this.state.shipFacing = signalDir;
        this.state.shipSignal = "";
        return; // turned this tick; move normally next tick
      }
    }

    const targetTile = this.tileAt(targetTileX, targetTileY);
    if (!targetTile || targetTile.terrain !== "river") {
      // Design: crash only happens when trying to advance into a non-river tile
      this.state.crashed = true;
      return;
    }

    this.state.shipX += delta.dx * distance;
    this.state.shipY += delta.dy * distance;

    // Win check: close enough to the dock tile
    const distToDock = Math.hypot(
      this.state.shipX - this.state.dockX,
      this.state.shipY - this.state.dockY,
    );
    if (distToDock < 0.5) {
      this.state.won = true;
    }
  }

  // ─── Lifecycle ──────────────────────────────────────────

  onJoin(client: Client, options: { name?: string }) {
    const player = new Player();
    player.name = options?.name || `Player-${client.sessionId.slice(0, 4)}`;
    // Spawn players near the ship's start so they're not lost in a big empty grid
    player.x = SHIP_SPAWN_COL;
    player.y = Math.min(GRID_HEIGHT - 2, this.state.shipY + 2);
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  onDispose() {
    this.shipLoopHandle?.clear();
  }
}
