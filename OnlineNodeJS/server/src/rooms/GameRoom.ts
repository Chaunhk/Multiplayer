import { Room, Client } from "@colyseus/core";
import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

class Player extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") name: string = "";
}

class Tile extends Schema {
  @type("boolean") dug: boolean = false;
}

class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type([Tile]) tiles = new ArraySchema<Tile>();
  @type("number") shipPosition: number = 0; // index into tiles array
  @type("boolean") crashed: boolean = false;

  gridWidth: number = 20;
}

export class GameRoom extends Room {
  maxClients = 4;
  state = new GameState();
  private shipInterval!: any;

  onCreate() {
  for (let i = 0; i < this.state.gridWidth; i++) {
    const tile = new Tile();
    tile.dug = i === 0;
    this.state.tiles.push(tile);
  }

  this.onMessage("move", (client, data: { x: number; y: number }) => {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.x = data.x;
      player.y = data.y;
    }
  });

  this.onMessage("dig", (client, data: { tileIndex: number }) => {
    if (this.state.crashed) return;
    const tile = this.state.tiles[data.tileIndex];
    if (tile) {
      tile.dug = true;
    }
  });

  // Give players 3 seconds before the ship starts moving
  this.clock.setTimeout(() => {
    this.shipInterval = this.clock.setInterval(() => {
      if (this.state.crashed) return;

      const nextIndex = this.state.shipPosition + 1;
      const nextTile = this.state.tiles[nextIndex];

      if (!nextTile || !nextTile.dug) {
        this.state.crashed = true;
        return;
      }

      this.state.shipPosition = nextIndex;
    }, 2000); // ship moves every 2 seconds instead of 1
  }, 3000);
}

  onJoin(client: Client, options: { name?: string }) {
    const player = new Player();
    player.name = options?.name || `Player-${client.sessionId.slice(0, 4)}`;
    player.x = 20;
    player.y = 350; // just below the track row
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  onDispose() {
    this.shipInterval?.clear();
  }
}