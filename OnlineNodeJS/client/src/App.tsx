import { useEffect, useRef, useState } from "react";
import { Client, Room } from "colyseus.js";

interface PlayerView {
  x: number;
  y: number;
  name: string;
}

export default function App() {
  const roomRef = useRef<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [players, setPlayers] = useState<Record<string, PlayerView>>({});
  const [counter, setCounter] = useState(0);
  const [mySessionId, setMySessionId] = useState("");

  useEffect(() => {
    const client = new Client("ws://localhost:2567");

    client
      .joinOrCreate("game_room", {
        name: `Guest-${Math.floor(Math.random() * 1000)}`,
      })
      .then((room) => {
        roomRef.current = room;
        setMySessionId(room.sessionId);
        setConnected(true);

        room.state.players.onAdd((player: any, sessionId: string) => {
          const sync = () =>
            setPlayers((prev) => ({
              ...prev,
              [sessionId]: { x: player.x, y: player.y, name: player.name },
            }));
          sync();
          player.onChange(sync);
        });

        room.state.players.onRemove((_player: any, sessionId: string) => {
          setPlayers((prev) => {
            const next = { ...prev };
            delete next[sessionId];
            return next;
          });
        });

        room.state.listen("sharedCounter", (value: number) =>
          setCounter(value),
        );
      })
      .catch((err) => console.error("Failed to join room:", err));

    return () => {
      roomRef.current?.leave();
    };
  }, []);

  const moveRandomly = () => {
    roomRef.current?.send("move", {
      x: Math.floor(Math.random() * 400),
      y: Math.floor(Math.random() * 300),
    });
  };

  const incrementCounter = () => {
    roomRef.current?.send("incrementCounter");
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: 24, maxWidth: 600 }}>
      <h1>Co-op Demo</h1>
      <p>Status: {connected ? "Connected ✅" : "Connecting..."}</p>

      <div style={{ margin: "16px 0" }}>
        <button onClick={incrementCounter} style={{ marginRight: 8 }}>
          Increment shared counter
        </button>
        <strong> Shared counter: {counter}</strong>
      </div>

      <button onClick={moveRandomly}>Move my player randomly</button>

      <h3>Players in room:</h3>
      <ul>
        {Object.entries(players).map(([id, p]) => (
          <li key={id}>
            {p.name} {id === mySessionId ? "(you)" : ""} — x:{p.x}, y:{p.y}
          </li>
        ))}
      </ul>

      <p style={{ color: "#666", fontSize: 14 }}>
        Open this page in a second browser tab to see another player join the
        same room live.
      </p>
    </div>
  );
}
