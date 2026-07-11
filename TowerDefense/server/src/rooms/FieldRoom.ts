//import { Schema, type } from "@colyseus/schema";
import { Room } from "@colyseus/core/build/Room";
import { Client } from "@colyseus/core/build/Transport";
import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

class Tower extends Schema {
  @type("string") name: string = "";
  @type("number") damage: number = 0;
  @type("number") maxHp: number = 100;
  @type("number") hp: number = 100;
  @type("number") lane: number = 0;
  @type("number") column: number = 0;
  @type("string") placedBy: string = "";
  @type("string") towerType: string = "straight";
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
  // "carrying" is either "" (nothing), "tower"
  @type("boolean") isCarrying: boolean = false;
  @type("string") towerType: string = "";
}
class Tile extends Schema {
  @type("string") terrain: "ground" | "aqua" | "air" = "ground";
}
class GameState extends Schema {
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
    this.startLobbyCheck();
  }
  onJoin(client: Client, options: { name?: string }) {
    const player = new Player();
    player.name = options?.name || `Player-${client.sessionId.slice(0, 4)}`;
    player.resource = this.initialResourceAmount;
    player.income = this.initialIncomeAmount;
    this.state.players.set(client.sessionId, player);
  }
  private startLobbyCheck() {}
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
