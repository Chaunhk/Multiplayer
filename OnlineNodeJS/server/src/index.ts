import express from "express";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./rooms/GameRoom";

const port = Number(process.env.PORT) || 2567;
const app = express();
const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("game_room", GameRoom);
gameServer.listen(port);
console.log(`Colyseus server listening on ws://localhost:${port}`);
