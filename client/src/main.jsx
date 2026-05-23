import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import "./styles.css";

const serverUrl = import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`;


function App() {
  const socket = useMemo(() => io(serverUrl, {
   autoConnect: true,
   reconnection: true,
   reconnectionAttempts: Infinity,
   reconnectionDelay: 1000,
   reconnectionDelayMax: 5000,
  }), []);
  const [name, setName] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [playerId, setPlayerId] = useState(null);
  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const [privateMessages, setPrivateMessages] = useState([]);
  const [globalEvents, setGlobalEvents] = useState([]);
  const [chat, setChat] = useState([]);
  const [chatText, setChatText] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("connected");
  const [now, setNow] = useState(Date.now());

  const isHost = room?.hostSocketId === playerId;
  const phaseLabel = {
	alerta: "ALERTA",
	negociacion: "NEGOCIACIÓN",
	transmision: "TRANSMISIÓN",
	operacion: "OPERACIÓN",
	fallo: "FALLO DEL SISTEMA"
  }[room?.roundPhase] || null;
  
  const phaseElapsed = room?.phaseStartedAt
	? Math.floor((now - room.phaseStartedAt) / 1000)
	: 0;

  const phaseRemaining = room?.phaseDuration
	? Math.max(room.phaseDuration - phaseElapsed, 0)
	: null;

  const minutes = phaseRemaining !== null
	? Math.floor(phaseRemaining / 60)
	: 0;

  const seconds = phaseRemaining !== null
	? String(phaseRemaining % 60).padStart(2, "0")
	: "00";

  useEffect(() => {
    socket.on("room-state", setRoom);
    socket.on("private-message", msg => setPrivateMessages(prev => [msg, ...prev]));
    socket.on("global-event", msg => setGlobalEvents(prev => [msg, ...prev]));
    socket.on("chat-message", msg => setChat(prev => [...prev, msg].slice(-80)));
    return () => {
      socket.off("room-state");
      socket.off("private-message");
      socket.off("global-event");
      socket.off("chat-message");
    };
  }, [socket]);
  
  useEffect(() => {
  let wakeLock = null;

  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
        console.log("Wake Lock activado");
      }
    } catch (error) {
      console.log("Wake Lock no disponible:", error);
    }
  }

  requestWakeLock();

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      requestWakeLock();
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);

    if (wakeLock) {
      wakeLock.release();
    }
  };
}, []);

useEffect(() => {
  function handleConnect() {
    setConnectionStatus("connected");
  }

  function handleDisconnect() {
    setConnectionStatus("disconnected");
  }

  function handleReconnectAttempt() {
    setConnectionStatus("reconnecting");
  }

  socket.on("connect", handleConnect);
  socket.on("disconnect", handleDisconnect);
  socket.io.on("reconnect_attempt", handleReconnectAttempt);

  return () => {
    socket.off("connect", handleConnect);
    socket.off("disconnect", handleDisconnect);
    socket.io.off("reconnect_attempt", handleReconnectAttempt);
  };
}, [socket]);

useEffect(() => {
  const savedSession = JSON.parse(localStorage.getItem("nodoSession") || "null");

  if (!savedSession) return;

  function restoreSavedSession() {
    socket.emit("restore-session", savedSession, response => {
      if (!response?.ok) {
        console.log("No se pudo restaurar sesión:", response?.error);
        return;
      }

      setPlayerId(response.playerId);
      setRoom(response.room);
      setName(savedSession.name || "");
      setCodeInput(savedSession.code || "");
      setConnectionStatus("connected");
      setError("");
	  
	  setPrivateMessages(response.privateMessages || []);
	  setGlobalEvents(response.globalEvents || []);
	  setChat(response.chat || []);

      localStorage.setItem("nodoSession", JSON.stringify({
        ...savedSession,
        playerId: response.playerId
      }));
    });
  }

  if (socket.connected) {
    restoreSavedSession();
  } else {
    socket.once("connect", restoreSavedSession);
  }

  return () => {
    socket.off("connect", restoreSavedSession);
  };
}, [socket]);

useEffect(() => {
  const interval = setInterval(() => {
    setNow(Date.now());
  }, 1000);

  return () => clearInterval(interval);
}, []);

function reconnect() {
  const savedSession = JSON.parse(localStorage.getItem("nodoSession") || "null");

  if (!savedSession) {
    setError("No hay sesión guardada para reconectar.");
    return;
  }

  if (!socket.connected) {
    socket.connect();
  }

  socket.emit("restore-session", savedSession, response => {
    if (!response?.ok) {
      setError(response?.error || "No se pudo recuperar la sesión.");
      return;
    }

    setPlayerId(response.playerId);
    setRoom(response.room);
    setConnectionStatus("connected");
    setError("");
	
	setPrivateMessages(response.privateMessages || []);
	setGlobalEvents(response.globalEvents || []);
	setChat(response.chat || []);

    localStorage.setItem("nodoSession", JSON.stringify({
      ...savedSession,
      playerId: response.playerId
    }));
  });
}
  function createRoom() {
    setError("");
    socket.emit("create-room", { name }, response => {
      if (!response?.ok) return setError(response?.error || "No se pudo crear sala.");
      setPlayerId(response.playerId);
	  setRoom(response.room);

	  localStorage.setItem("nodoSession", JSON.stringify({
		code: response.room.code,
		playerId: response.playerId,
		name
	  }));
	});
  }

  function joinRoom() {
	setError("");
	socket.emit("join-room", { code: codeInput, name }, response => {
		if (!response?.ok) return setError(response?.error || "No se pudo unir a sala.");

		setPlayerId(response.playerId);
		setRoom(response.room);

		setPrivateMessages(response.privateMessages || []);
		setGlobalEvents(response.globalEvents || []);
		setChat(response.chat || []);

		localStorage.setItem("nodoSession", JSON.stringify({
			code: response.room.code,
			playerId: response.playerId,
			name
		}));
	});
}

  function startGame() {
    socket.emit("start-game", { code: room.code }, response => {
      if (!response?.ok) setError(response?.error || "No se pudo iniciar.");
    });
  }

  function nextRound() {
    socket.emit("next-round", { code: room.code }, response => {
      if (!response?.ok) setError(response?.error || "No se pudo avanzar ronda.");
    });
  }

  function sendChat(event) {
    event.preventDefault();
    socket.emit("global-chat", { code: room.code, text: chatText });
    setChatText("");
  }

  if (!room) {
    return (
      <main className="shell narrow">
        <section className="hero card">
          <p className="eyebrow">NODO 0.1</p>
          <h1>La IA despierta.</h1>
          <p className="muted">Prototipo local para 4–7 jugadores. Un móvil por persona.</p>

          <label>Tu nombre</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Moi" maxLength={24} />

          <div className="grid two">
            <button onClick={createRoom}>Crear sala</button>
            <div className="joinBox">
              <input value={codeInput} onChange={e => setCodeInput(e.target.value)} placeholder="Código" />
              <button className="secondary" onClick={joinRoom}>Unirse</button>
            </div>
          </div>

          {error && <p className="error">{error}</p>}
          <p className="tiny">Servidor: {serverUrl}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Sala</p>
          <h1>{room.code}</h1>
        </div>
        <div className="status">
			<span>
				{room.phase === "lobby"
				? "Lobby"
				: `Ciclo ${room.round} · ${phaseLabel || "SIN FASE"}`}
			</span>

			{room.phase === "playing" && phaseRemaining !== null && (
			  <strong>{minutes}:{seconds}</strong>
			)}

			{isHost && <strong>Anfitrión</strong>}
		</div>
      </header>
	  
	  <div className="connection-box">
		<span>
			Estado:{" "}
			{connectionStatus === "connected" && "🟢 Conectado"}
			{connectionStatus === "reconnecting" && "🟡 Reconectando"}
			{connectionStatus === "disconnected" && "🔴 Desconectado"}
		</span>

		<button onClick={reconnect}>
			Reconectar
		</button>
	</div>

      {error && <p className="error">{error}</p>}

      <section className="grid layout">
        <div className="card">
          <h2>Jugadores</h2>
          <div className="players">
            {room.players.map(player => (
              <div className="player" key={player.id}>
                <div>
                  <strong>{player.name}</strong>
                  <p>{player.publicRole || "Rol pendiente"}</p>
                </div>
                <span className={player.connected ? "online" : "offline"}>{player.connected ? "online" : "offline"}</span>
              </div>
            ))}
          </div>

          {isHost && (
            <div className="hostControls">
              {room.phase === "lobby" ? (
                <button onClick={startGame}>Iniciar partida</button>
              ) : (
                <button onClick={nextRound}>Avanzar fase</button>
              )}
            </div>
          )}
        </div>

        <div className="card danger">
          <h2>Buzón privado de la IA</h2>
          {privateMessages.length === 0 ? <p className="muted">Aún no has recibido mensajes.</p> : null}
          <div className="messageList">
            {privateMessages.map((msg, i) => (
              <article className={msg.important ? "message important" : "message"} key={i}>
                <strong>{msg.from}</strong>
                <pre>{msg.text}</pre>
              </article>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Eventos globales</h2>
          {globalEvents.length === 0 ? <p className="muted">Esperando órdenes del sistema.</p> : null}
          <div className="messageList">
            {globalEvents.map((event, i) => (
              <article className="message" key={i}>{event.text}</article>
            ))}
          </div>
        </div>

        <div className="card chatCard">
          <h2>Chat de sala</h2>
          <div className="chatLog">
            {chat.map(msg => (
              <p key={msg.id}><strong>{msg.name}:</strong> {msg.text}</p>
            ))}
          </div>
          <form onSubmit={sendChat} className="chatForm">
            <input value={chatText} onChange={e => setChatText(e.target.value)} placeholder="Escribe al grupo..." />
            <button>Enviar</button>
          </form>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
