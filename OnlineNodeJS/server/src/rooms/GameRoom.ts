import { Room, Client } from "@colyseus/core";
import { Schema, MapSchema, type } from "@colyseus/schema";

class Player extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") name: string = "";
}

class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type("number") sharedCounter: number = 0;
}

export class GameRoom extends Room {
  maxClients = 4;
  state = new GameState();

  onCreate() {
    this.onMessage("move", (client, data: { x: number; y: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.x = data.x;
        player.y = data.y;
      }
    });

    this.onMessage("incrementCounter", () => {
      this.state.sharedCounter++;
    });
  }

  onJoin(client: Client, options: { name?: string }) {
    const player = new Player();
    player.name = options?.name || `Player-${client.sessionId.slice(0, 4)}`;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }
}
