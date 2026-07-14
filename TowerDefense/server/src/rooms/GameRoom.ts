//import { Schema, type } from "@colyseus/schema";
import { Room } from "@colyseus/core/build/Room";
import { Client } from "@colyseus/core/build/Transport";
import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
interface TowerTypeDef {
  name: string;
  cost: number;
  damage: number;
  range: number;
  fireRateMs: number;
  allowedLaneType: "air" | "ground" | "aqua" | "any";
  maxHp: number;
}

const TOWER_TYPES: TowerTypeDef[] = [
  {
    name: "Gunner",
    cost: 10,
    damage: 8,
    range: 3,
    fireRateMs: 800,
    allowedLaneType: "ground",
    maxHp: 100,
  },
  {
    name: "Anti-Air",
    cost: 15,
    damage: 12,
    range: 4,
    fireRateMs: 1000,
    allowedLaneType: "air",
    maxHp: 80,
  },
  {
    name: "Depth Charge",
    cost: 15,
    damage: 12,
    range: 4,
    fireRateMs: 1000,
    allowedLaneType: "aqua",
    maxHp: 80,
  },
];
interface EnemyTypeDef {
  name: string;
  cost: number;
  laneType: "air" | "ground" | "aqua";
  maxHp: number;
  damage: number;
  speed: number;
}

const ENEMY_TYPES: EnemyTypeDef[] = [
  {
    name: "Jetpack Rider",
    cost: 1,
    laneType: "air",
    maxHp: 30,
    damage: 5,
    speed: 0.03,
  },
  {
    name: "Helicopter",
    cost: 2,
    laneType: "air",
    maxHp: 60,
    damage: 8,
    speed: 0.025,
  },
  {
    name: "Jet Fighter",
    cost: 4,
    laneType: "air",
    maxHp: 100,
    damage: 15,
    speed: 0.04,
  },

  {
    name: "Robot",
    cost: 1,
    laneType: "ground",
    maxHp: 40,
    damage: 5,
    speed: 0.02,
  },
  {
    name: "Tank",
    cost: 3,
    laneType: "ground",
    maxHp: 120,
    damage: 12,
    speed: 0.015,
  },
  {
    name: "Armored Vehicle",
    cost: 5,
    laneType: "ground",
    maxHp: 200,
    damage: 20,
    speed: 0.01,
  },

  {
    name: "Canoe",
    cost: 1,
    laneType: "aqua",
    maxHp: 35,
    damage: 5,
    speed: 0.02,
  },
  {
    name: "Ship",
    cost: 3,
    laneType: "aqua",
    maxHp: 130,
    damage: 12,
    speed: 0.015,
  },
  {
    name: "Battleship",
    cost: 6,
    laneType: "aqua",
    maxHp: 250,
    damage: 25,
    speed: 0.01,
  },
];

interface SegmentDef {
  budget: number;
  maxCostUnlocked: number; // enemies with cost <= this are allowed to spawn
}

const SEGMENTS: SegmentDef[] = [
  { budget: 20, maxCostUnlocked: 2 },
  { budget: 40, maxCostUnlocked: 4 },
  { budget: 70, maxCostUnlocked: 6 },
];

class Tower extends Schema {
  @type("string") name: string = "";
  @type("number") damage: number = 0;
  @type("number") maxHp: number = 100;
  @type("number") hp: number = 100;
  @type("number") lane: number = 0;
  @type("number") column: number = 0;
  @type("string") placedBy: string = "";
  @type("string") towerType: string = "straight";
  lastFiredAt: number = 0; // no @type — server-only bookkeeping, never sent to clients
}

class Enemy extends Schema {
  @type("string") name: string = "";
  @type("number") maxHp: number = 100;
  @type("number") hp: number = 100;
  @type("number") damage: number = 0;
  @type("number") lane: number = 0;
  @type("number") x: number = 0;
  @type("string") enemyType: string = "straight";
}

type Direction = "up" | "down" | "left" | "right";
class Player extends Schema {
  @type("number") selectedLane: number = 0;
  @type("number") selectedColumn: number = 0;
  @type("number") resource: number = 20;
  @type("number") income: number = 1; //this will increase once the resouce cards are bought
  @type("string") name: string = "";
  @type("boolean") isReady: boolean = false;
  @type("boolean") isCarrying: boolean = false;
  @type("string") towerType: string = "";
}
class Tile extends Schema {
  @type("string") terrain: "ground" | "aqua" | "air" = "ground";
}
class GameState extends Schema {
  @type("string") hostSessionId: string = "";
  @type("number") baseHp: number = 100;
  @type({ map: Player }) players = new MapSchema<Player>();
  @type([Tile]) tiles = new ArraySchema<Tile>();
  @type([Tower]) towers = new ArraySchema<Tower>();
  @type([Enemy]) enemies = new ArraySchema<Enemy>();
  @type("string") phase: "lobby" | "countdown" | "playing" = "lobby";
  @type("number") countdown: number = 0;

  @type("boolean") defeated: boolean = false;
  @type("boolean") victory: boolean = false;
}
export class GameRoom extends Room {
  maxClients = 5;
  state = new GameState();
  private shipLoopHandle: any;
  private lobbyCheckHandle: any;
  private countdownHandle: any;
  private initialResourceAmount = 20;
  private initialIncomeAmount = 1;
  onCreate() {
    this.registerMessageHandlers();
  }
  private readonly COUNTDOWN_SECONDS = 5;

  private registerMessageHandlers() {
    this.onMessage("toggleReady", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.isReady = !player.isReady;
    });
    this.onMessage(
      "placeTower",
      (client, data: { towerType: string; lane: number; column: number }) => {
        if (this.state.phase !== "playing") return;

        const player = this.state.players.get(client.sessionId);
        if (!player) return;

        const typeDef = TOWER_TYPES.find((t) => t.name === data.towerType);
        if (!typeDef) return;

        if (player.resource < typeDef.cost) return; // can't afford it

        const tile = this.state.tiles[data.lane];
        if (!tile) return;
        if (
          typeDef.allowedLaneType !== "any" &&
          tile.terrain !== typeDef.allowedLaneType
        ) {
          return; // wrong lane type for this tower (no platform support yet)
        }

        const occupied = this.state.towers.some(
          (t) => t.lane === data.lane && t.column === data.column,
        );
        if (occupied) return; // cell already has a tower

        const tower = new Tower();
        tower.name = typeDef.name;
        tower.towerType = typeDef.name;
        tower.damage = typeDef.damage;
        tower.maxHp = typeDef.maxHp;
        tower.hp = typeDef.maxHp;
        tower.lane = data.lane;
        tower.column = data.column;
        tower.placedBy = client.sessionId;
        this.state.towers.push(tower);

        player.resource -= typeDef.cost;
      },
    );
    this.onMessage("startGame", (client) => {
      if (
        client.sessionId !== this.state.hostSessionId ||
        !this.allPlayersReady()
      ) {
        return;
      }
      this.state.phase = "countdown";
      this.state.countdown = this.COUNTDOWN_SECONDS;
      this.startCountdown();
    });
  }

  private allPlayersReady(): boolean {
    for (const player of this.state.players.values()) {
      if (!player.isReady) return false;
    }
    return true;
  }

  private startCountdown() {
    this.countdownHandle = this.clock.setInterval(() => {
      if (!this.allPlayersReady()) {
        this.state.phase = "lobby";
        this.state.countdown = 0;
        this.countdownHandle?.clear();
        return;
      }

      this.state.countdown -= 1;

      if (this.state.countdown <= 0) {
        this.state.phase = "playing";
        this.countdownHandle?.clear();
        this.startSpawning();
        this.startGameTick();
      }
    }, 1000);
  }
  onJoin(client: Client, options: { name?: string }) {
    const player = new Player();
    player.name = options?.name || `Player-${client.sessionId.slice(0, 4)}`;
    player.resource = this.initialResourceAmount;
    player.income = this.initialIncomeAmount;

    if (this.state.players.size === 0) {
      this.state.hostSessionId = client.sessionId;
    }
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    if (this.state.hostSessionId === client.sessionId) {
      const nextHost = this.state.players.keys().next().value;
      this.state.hostSessionId = nextHost || "";
    }
  }
  private startLobbyCheck() {}
  private startSpawning() {
    this.scheduleNextSpawn();
  }
  private currentSegmentIndex = 0;
  private pointsSpentThisSegment = 0;
  private flagSpikesCompleted = 0;
  private spawnLoopHandle: any;
  private scheduleNextSpawn() {
    const segment = SEGMENTS[this.currentSegmentIndex];
    if (!segment) return; // no more segments — handled by flag-spike logic instead

    // Interval shrinks as more of the segment's budget is spent (more pressure over time)
    const progress = this.pointsSpentThisSegment / segment.budget; // 0 to 1
    const interval = 2000 - progress * 1200; // starts at 2000ms, drops to ~800ms

    this.spawnLoopHandle = this.clock.setTimeout(() => {
      this.spawnOneEnemy(segment);
      this.scheduleNextSpawn();
    }, interval);
  }

  private spawnOneEnemy(segment: SegmentDef) {
    const available = ENEMY_TYPES.filter(
      (e) => e.cost <= segment.maxCostUnlocked,
    );
    const chosen = available[Math.floor(Math.random() * available.length)];

    const lane = this.pickRandomLaneOfType(chosen.laneType);
    if (lane === -1) return; // no lane of this type exists on the current map

    const enemy = new Enemy();
    enemy.name = chosen.name;
    enemy.enemyType = chosen.name;
    enemy.maxHp = chosen.maxHp;
    enemy.hp = chosen.maxHp;
    enemy.damage = chosen.damage;
    enemy.lane = lane;
    enemy.x = 0;
    this.state.enemies.push(enemy);

    this.pointsSpentThisSegment += chosen.cost;

    if (this.pointsSpentThisSegment >= segment.budget) {
      this.triggerFlagSpike(segment);
    }
  }

  private pickRandomLaneOfType(laneType: "air" | "ground" | "aqua"): number {
    const matchingLanes = this.state.tiles
      .map((tile, index) => ({ tile, index }))
      .filter(({ tile }) => tile.terrain === laneType);

    if (matchingLanes.length === 0) return -1;
    const pick =
      matchingLanes[Math.floor(Math.random() * matchingLanes.length)];
    return pick.index;
  }

  private triggerFlagSpike(segment: SegmentDef) {
    this.spawnLoopHandle?.clear();

    const burstBudget = segment.budget * 0.4; // 40% of segment's budget, per our design
    let spent = 0;
    const available = ENEMY_TYPES.filter(
      (e) => e.cost <= segment.maxCostUnlocked,
    );

    while (spent < burstBudget) {
      const chosen = available[Math.floor(Math.random() * available.length)];
      const lane = this.pickRandomLaneOfType(chosen.laneType);
      if (lane === -1) break;

      const enemy = new Enemy();
      enemy.name = chosen.name;
      enemy.enemyType = chosen.name;
      enemy.maxHp = chosen.maxHp;
      enemy.hp = chosen.maxHp;
      enemy.damage = chosen.damage;
      enemy.lane = lane;
      enemy.x = 0;
      this.state.enemies.push(enemy);

      spent += chosen.cost;
    }

    this.flagSpikesCompleted += 1;
    this.currentSegmentIndex += 1;
    this.pointsSpentThisSegment = 0;

    if (this.currentSegmentIndex < SEGMENTS.length) {
      this.scheduleNextSpawn(); // move into next segment's normal spawning
    }
    // If currentSegmentIndex >= SEGMENTS.length, that was the FINAL flag spike —
    // victory triggers once these enemies are all cleared (checked elsewhere).
  }
  private gameTickHandle: any;

  private startGameTick() {
    const TICK_MS = 100;
    this.gameTickHandle = this.clock.setInterval(() => {
      this.advanceEnemies();
      this.checkWinLoseConditions();
    }, TICK_MS);
  }

  private advanceEnemies() {
    const BASE_X = 20; // however far the lane is, in tile units — adjust to your map
    for (let i = this.state.enemies.length - 1; i >= 0; i--) {
      const enemy = this.state.enemies[i];
      const typeDef = ENEMY_TYPES.find((e) => e.name === enemy.enemyType);
      const speed = typeDef?.speed ?? 0.02;

      enemy.x += speed;

      if (enemy.x >= BASE_X) {
        this.state.baseHp -= enemy.damage;
        this.state.enemies.splice(i, 1); // remove enemy, it reached the base
      }
    }
  }

  private checkWinLoseConditions() {
    if (this.state.baseHp <= 0) {
      this.state.defeated = true;
      this.gameTickHandle?.clear();
      this.spawnLoopHandle?.clear();
      return;
    }

    const finalFlagDone = this.currentSegmentIndex >= SEGMENTS.length;
    if (finalFlagDone && this.state.enemies.length === 0) {
      this.state.victory = true;
      this.gameTickHandle?.clear();
      this.spawnLoopHandle?.clear();
    }
  }
}

// interface Tower {
//   name: string;
//   maxhp: number;
//   damage: number;
//   type: string;
// }
// const gunner: Tower = {
//   name: "Gunner tower",
//   maxhp: 100,
//   damage: 10,
//   type: "straight",
// };
// interface Enemy {
//   name: string;
//   maxhp: number;
//   damage: number;
//   type: string;
// }
// const boat: Enemy = {
//   name: "Boat Alpha",
//   maxhp: 100,
//   damage: 10,
//   type: "straight",
// };
// const chopper: Enemy = {
//   name: "Flyer Alpha",
//   maxhp: 100,
//   damage: 10,
//   type: "straight",
// };
// const machine: Enemy = {
//   name: "Terain Alpha",
//   maxhp: 100,
//   damage: 10,
//   type: "straight",
// };
