import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms = new Map();

const publicRoles = [
  "Médico", "Ingeniero", "Seguridad", "Archivista", "Operador", "Diplomático", "Técnico"
];

const factions = [
  "Supervivientes", "Supervivientes", "Supervivientes", "Supervivientes", "Infiltrados", "Despiertos"
];

const secretObjectives = [
  "Consigue que otro jugador diga públicamente que confía en ti.",
  "Haz que el grupo acuse a un inocente al menos una vez.",
  "No votes igual que la mayoría durante dos rondas seguidas.",
  "Logra que alguien te enseñe un mensaje privado de la IA.",
  "Provoca una alianza entre dos jugadores y luego rómpela.",
  "Termina la partida siendo sospechoso, pero no expulsado.",
  "Defiende públicamente a alguien que parezca culpable.",
  "Haz que un jugador entre en paranoia narrativa: que dude de todo en voz alta."
];

const globalProtocols = [
  "PROTOCOLO SILENCIO: durante 2 minutos nadie puede decir nombres propios.",
  "PROTOCOLO ESPEJO: cada jugador debe defender al jugador a su izquierda durante 1 minuto.",
  "PROTOCOLO ROJO: apaguen las luces 30 segundos. Al volver, todos deben cambiar de asiento.",
  "PROTOCOLO SOSPECHA: votación secreta inmediata: ¿quién oculta información?",
  "PROTOCOLO RUIDO: durante 3 minutos solo podéis hacer preguntas, no afirmaciones.",
  "PROTOCOLO CONFESIÓN: cada jugador debe decir una verdad útil y una mentira posible."
];

const privateMessages = [
  "La IA cree que alguien está usando tu confianza contra ti.",
  "No muestres este mensaje. Si alguien pregunta, di que recibiste un error.",
  "Alguien ha mencionado tu rol en secreto. Puede ser una trampa.",
  "Durante esta ronda, protege verbalmente al jugador más sospechoso.",
  "Tu siguiente acusación tendrá peso narrativo. Úsala bien.",
  "Si consigues que dos personas discutan, ganas influencia ficticia sobre la IA.",
  "Pregunta a alguien: '¿qué te dijo realmente el sistema?'. Observa su reacción.",
  "ERROR // memoria dañada // el Archivista quizá no es lo que parece.",
  "La IA no puede confirmar si tu objetivo sigue siendo seguro.",
  "El jugador con más seguridad al hablar podría estar mintiendo."
];
const roundPhases = ["alerta", "negociacion", "transmision", "operacion", "fallo"];

const phaseLabels = {
  alerta: "ALERTA",
  negociacion: "NEGOCIACIÓN",
  transmision: "TRANSMISIÓN",
  operacion: "OPERACIÓN",
  fallo: "FALLO DEL SISTEMA"
};

const phaseGlobalMessages = {
  alerta: [
    "NODO detecta una anomalía en el refugio. Todos deben declarar qué saben.",
    "ALERTA: se ha registrado una contradicción en los testimonios.",
    "La IA sospecha que alguien ha ocultado información crítica."
  ],
  negociacion: [
    "Fase de negociación: hablad, pactad, mentid o confesad. La IA observa.",
    "Negociación abierta. Durante esta fase, toda alianza puede ser usada en vuestra contra.",
    "NODO permite comunicación libre. No todo lo dicho será recordado igual."
  ],
  transmision: [
    "Transmisión privada iniciada. Revisad vuestros buzones de IA.",
    "NODO envía señales individuales. No todas son fiables.",
    "Canal privado abierto. La información puede estar corrupta."
  ],
  operacion: [
    "Operación activa: el grupo debe tomar una decisión pública.",
    "Elegid a un jugador para investigar, proteger, aislar o acusar.",
    "La IA exige una decisión colectiva antes de continuar."
  ],
  fallo: [
    "FALLO DEL SISTEMA: las reglas sociales se alteran temporalmente.",
    "Error crítico. NODO aplica un protocolo inesperado.",
    "La memoria de la IA se fragmenta. Un evento caótico queda activado."
  ]
};

function makeCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(code));
  return code;
}

function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function publicRoomState(room) {
  return {
	code: room.code,
	hostSocketId: room.hostSocketId,
	phase: room.phase,
	round: room.round,
	roundPhase: room.roundPhase || null,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      publicRole: p.publicRole || null,
      isHost: p.id === room.hostSocketId
    })),
    log: room.log.slice(-30)
  };
}

function emitRoomState(code) {
  const room = rooms.get(code);
  if (!room) return;
  io.to(code).emit("room-state", publicRoomState(room));
}

function addLog(room, text, type = "system") {
  room.log.push({ id: crypto.randomUUID(), text, type, time: new Date().toISOString() });
}

function findPlayerBySocket(socketId) {
  for (const room of rooms.values()) {
    const player = room.players.find(p => p.id === socketId);
    if (player) return { room, player };
  }
  return null;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

io.on("connection", socket => {
  socket.on("create-room", ({ name }, callback) => {
    const safeName = String(name || "Jugador").trim().slice(0, 24) || "Jugador";
    const code = makeCode();
    const room = {
  code,
  hostSocketId: socket.id,
  phase: "lobby",
  round: 0,
  roundPhase: null,
  players: [{
    id: socket.id,
    name: safeName,
    connected: true,
    privateMessages: []
  }],
  globalEvents: [],
  chat: [],
  log: []
};
    addLog(room, `${safeName} creó la sala ${code}.`);
    rooms.set(code, room);
    socket.join(code);
    callback?.({ ok: true, playerId: socket.id, room: publicRoomState(room) });
    emitRoomState(code);
  });

  socket.on("join-room", ({ code, name }, callback) => {
    const safeCode = String(code || "").trim();
    const room = rooms.get(safeCode);
    if (!room) return callback?.({ ok: false, error: "Esa sala no existe." });
    if (room.phase !== "lobby") return callback?.({ ok: false, error: "La partida ya ha empezado." });
    if (room.players.length >= 7) return callback?.({ ok: false, error: "La sala ya está llena." });

    const safeName = String(name || "Jugador").trim().slice(0, 24) || "Jugador";

const existingPlayer = room.players.find(p => p.name === safeName);

if (existingPlayer) {
  const oldId = existingPlayer.id;

  existingPlayer.id = socket.id;
  existingPlayer.connected = true;

  if (room.hostSocketId === oldId) {
    room.hostSocketId = socket.id;
  }

  socket.join(safeCode);

  addLog(room, `${safeName} recuperó su sesión desde el lobby.`);
  
  callback?.({
	ok: true,
	playerId: socket.id,
	room: publicRoomState(room),
	privateMessages: existingPlayer.privateMessages || [],
	globalEvents: room.globalEvents || [],
	chat: room.chat || []
  });
  
  emitRoomState(safeCode);
  return;
}

room.players.push({
  id: socket.id,
  name: safeName,
  connected: true,
  privateMessages: []
});
socket.join(safeCode);
addLog(room, `${safeName} se unió a la sala.`);
callback?.({ ok: true, playerId: socket.id, room: publicRoomState(room) });
emitRoomState(safeCode);
  });

  socket.on("start-game", ({ code }, callback) => {
    const room = rooms.get(String(code || "").trim());
    if (!room) return callback?.({ ok: false, error: "Sala no encontrada." });
    if (socket.id !== room.hostSocketId) return callback?.({ ok: false, error: "Solo el anfitrión puede iniciar." });
    if (room.players.length < 2) return callback?.({ ok: false, error: "Necesitáis mínimo 2 jugadores." });

    const roleDeck = shuffle(publicRoles);
    const factionDeck = shuffle(factions.slice(0, room.players.length));
    const objectiveDeck = shuffle(secretObjectives);

    room.phase = "playing";
    room.round = 1;
	room.roundPhase = "alerta";

    room.players.forEach((player, index) => {
      player.publicRole = roleDeck[index % roleDeck.length];
      player.faction = factionDeck[index % factionDeck.length];
      player.secretObjective = objectiveDeck[index % objectiveDeck.length];
    const privateMessage = {
		from: "IA NODO",
		text: `IDENTIDAD ASIGNADA\nRol público: ${player.publicRole}\nFacción oculta: ${player.faction}\nObjetivo secreto: ${player.secretObjective}`,
		important: true,
		time: new Date().toISOString()
	};

	player.privateMessages.push(privateMessage);
	io.to(player.id).emit("private-message", privateMessage);
    });

    addLog(room, "La partida ha comenzado. La IA ha repartido identidades privadas.", "event");
    const globalEvent = {
		text: "CICLO 1 · ALERTA\nNODO despierta. Se ha detectado la primera anomalía.",
		time: new Date().toISOString()
	};

	room.globalEvents.push(globalEvent);
	io.to(room.code).emit("global-event", globalEvent);
    callback?.({ ok: true });
    emitRoomState(room.code);
  });

  socket.on("next-round", ({ code }, callback) => {
	const room = rooms.get(String(code || "").trim());
	if (!room) return callback?.({ ok: false, error: "Sala no encontrada." });
	if (socket.id !== room.hostSocketId) return callback?.({ ok: false, error: "Solo el anfitrión puede avanzar fase." });
	if (room.phase !== "playing") return callback?.({ ok: false, error: "La partida aún no ha empezado." });

  const currentPhase = room.roundPhase || "alerta";
  const currentIndex = roundPhases.indexOf(currentPhase);
  const nextIndex = currentIndex + 1;

  if (nextIndex >= roundPhases.length) {
    room.round += 1;
    room.roundPhase = "alerta";
  } else {
    room.roundPhase = roundPhases[nextIndex];
  }

  const label = phaseLabels[room.roundPhase];
  let text = `CICLO ${room.round} · ${label}\n${pick(phaseGlobalMessages[room.roundPhase])}`;

  if (room.roundPhase === "fallo") {
    const protocol = pick(globalProtocols);
    text += `\n\n${protocol}`;
    addLog(room, `Ciclo ${room.round} · ${label}: ${protocol}`, "event");
  } else {
    addLog(room, `Ciclo ${room.round} · ${label}`, "event");
  }

  const globalEvent = {
    text,
    time: new Date().toISOString()
  };

  room.globalEvents.push(globalEvent);
  io.to(room.code).emit("global-event", globalEvent);

  if (room.roundPhase === "transmision") {
    room.players.forEach(player => {
      const privateMessage = {
        from: "IA NODO",
        text: pick(privateMessages),
        important: false,
        time: new Date().toISOString()
      };

      player.privateMessages.push(privateMessage);
      io.to(player.id).emit("private-message", privateMessage);
    });
  }

  callback?.({ ok: true });
  emitRoomState(room.code);
});
  socket.on("global-chat", ({ code, text }) => {
    const room = rooms.get(String(code || "").trim());
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    const cleanText = String(text || "").trim().slice(0, 500);
    if (!cleanText) return;
    const chatMessage = {
		id: crypto.randomUUID(),
		name: player.name,
		text: cleanText,
		time: new Date().toISOString()
	};

	room.chat.push(chatMessage);
	room.chat = room.chat.slice(-80);

	io.to(room.code).emit("chat-message", chatMessage);
  });
  socket.on("restore-session", ({ code, playerId, name }, callback) => {
  const safeCode = String(code || "").trim();
  const room = rooms.get(safeCode);

  if (!room) {
    return callback?.({ ok: false, error: "Sala no encontrada." });
  }

  const safeName = String(name || "").trim();

  const player = room.players.find(p => p.id === playerId)
    || room.players.find(p => safeName && p.name === safeName);

  if (!player) {
  return callback?.({ ok: false, error: "Jugador no encontrado en esta sala." });
  }

  if (safeName && player.name !== safeName) {
    return callback?.({ ok: false, error: "El nombre no coincide con la sesión guardada." });
  }

  const oldId = player.id;

  player.id = socket.id;
  player.connected = true;

  if (room.hostSocketId === oldId) {
    room.hostSocketId = socket.id;
  }

  socket.join(room.code);

  addLog(room, `${player.name} recuperó la conexión.`);
  emitRoomState(room.code);

  callback?.({
	ok: true,
	playerId: socket.id,
	room: publicRoomState(room),
	privateMessages: player.privateMessages || [],
	globalEvents: room.globalEvents || [],
	chat: room.chat || []
  });
});
  socket.on("disconnect", () => {
    const found = findPlayerBySocket(socket.id);
    if (!found) return;
    const { room, player } = found;
    player.connected = false;
    addLog(room, `${player.name} se desconectó.`);
    emitRoomState(room.code);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`NODO server running on http://0.0.0.0:${PORT}`);
});
