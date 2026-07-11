import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Encoder } from "@colyseus/schema";
import { GameRoom } from "./rooms/GameRoom";

Encoder.BUFFER_SIZE = 24 * 1024; // Increased buffer for larger grid state

const port = Number(process.env.PORT) || 2567;
const app = express();
app.use(cors());
const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("game_room", GameRoom);
gameServer.listen(port, "0.0.0.0");
console.log(`Colyseus server listening on ws://localhost:${port}`);
