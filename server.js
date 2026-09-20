const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const clients = new Set();
const deckIds = new Set(['silicon-valley', 'politicians', 'actors', 'musicians']);
let waitingPlayer = null;

function normalizeDeckId(deckId) {
  return deckIds.has(deckId) ? deckId : 'silicon-valley';
}

function getOpenRooms() {
  return Array.from(rooms.values())
    .filter(room => room.open && room.players.white?.readyState === WebSocket.OPEN && !room.players.black)
    .map(room => ({
      roomId: room.roomId,
      deckId: normalizeDeckId(room.deckId),
      timeControl: room.timeControl,
      open: true,
      createdAt: room.createdAt
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

function broadcastLobby() {
  const payload = { type: 'lobby', rooms: getOpenRooms() };
  clients.forEach(client => send(client, payload));
}

function generateRoomId() {
  let roomId;
  do {
    roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  } while (rooms.has(roomId));
  return roomId;
}

function normalizeTimeControl(input) {
  if (!input || typeof input !== 'object' || input.enabled !== true) {
    return { enabled: false, minutes: 0, increment: 0 };
  }
  const minutes = Number(input.minutes);
  const increment = Number(input.increment);
  if (!Number.isFinite(minutes) || minutes <= 0 || !Number.isFinite(increment) || increment < 0) {
    return { enabled: false, minutes: 0, increment: 0 };
  }
  return {
    enabled: true,
    minutes: Math.min(180, Math.max(1, Math.floor(minutes))),
    increment: Math.min(60, Math.max(0, Math.floor(increment)))
  };
}

function createChessState(timeControl = null) {
  const normalized = normalizeTimeControl(timeControl);
  const board = Array(8).fill(null).map(() => Array(8).fill(null));

  const pieceOrder = ['♜','♞','♝','♛','♚','♝','♞','♜'];

  for (let x = 0; x < 8; x++) {
    board[0][x] = { type: pieceOrder[x], color: 'white', moved: false };
    board[1][x] = { type: '♟', color: 'white', moved: false };
    board[6][x] = { type: '♟', color: 'black', moved: false };
    board[7][x] = { type: pieceOrder[x], color: 'black', moved: false };
  }

  const now = Date.now();
  const state = {
    board,
    currentTurn: 'white',
    selectedPiece: null,
    validMoves: [],
    moveHistory: [],
    capturedPieces: { white: [], black: [] },
    gameOver: false,
    winner: null,
    clock: normalized.enabled ? {
      enabled: true,
      whiteMs: normalized.minutes * 60000,
      blackMs: normalized.minutes * 60000,
      incrementMs: normalized.increment * 1000,
      activeColor: 'white',
      lastMoveAt: now,
      winner: null,
      reason: null
    } : null
  };
  return state;
}

function clockSnapshot(state, now = Date.now()) {
  if (!state?.clock) return null;
  const clock = { ...state.clock, lastMoveAt: now, serverNow: now };
  if (!clock.enabled || clock.winner) return clock;
  const elapsed = Math.max(0, now - state.clock.lastMoveAt);
  const active = clock.activeColor;
  clock[`${active}Ms`] = Math.max(0, clock[`${active}Ms`] - elapsed);
  return clock;
}

function clockExpiredColor(state, now = Date.now()) {
  if (!state?.clock?.enabled || state.clock.winner) return null;
  const elapsed = now - state.clock.lastMoveAt;
  return state.clock[state.clock.activeColor + 'Ms'] - elapsed <= 0
    ? state.clock.activeColor
    : null;
}

function applyClockMove(state, color, now = Date.now()) {
  if (!state.clock?.enabled || state.clock.winner) return true;
  if (clockExpiredColor(state, now)) return false;
  const elapsed = now - state.clock.lastMoveAt;
  const remaining = state.clock[`${color}Ms`] - elapsed;
  if (remaining <= 0) return false;
  state.clock[`${color}Ms`] = remaining + state.clock.incrementMs;
  state.clock.activeColor = color === 'white' ? 'black' : 'white';
  state.clock.lastMoveAt = now;
  return true;
}

function clearClockTimeout(room) {
  if (room.timeout) clearTimeout(room.timeout);
  room.timeout = null;
}

function scheduleClockTimeout(room, roomId) {
  clearClockTimeout(room);
  if (!room.state.clock?.enabled || room.state.clock.winner) return;
  const now = Date.now();
  const expired = clockExpiredColor(room.state, now);
  if (expired) {
    finishRoomByTimeout(room, roomId, expired);
    return;
  }
  const active = room.state.clock.activeColor;
  const remaining = Math.max(0, room.state.clock[`${active}Ms`] - (now - room.state.clock.lastMoveAt));
  room.timeout = setTimeout(() => finishRoomByTimeout(room, roomId, active, 'timeout'), remaining);
  if (room.timeout.unref) room.timeout.unref();
}

function finishRoom(room, roomId, winner, reason) {
  if (!room || room.state?.gameOver) return;
  room.state.gameOver = true;
  room.state.winner = winner;
  if (room.state.clock) {
    room.state.clock.winner = winner;
    room.state.clock.reason = reason;
  }
  clearClockTimeout(room);
  const payload = {
    type: 'game_over',
    winner,
    reason,
    state: room.state,
    clock: clockSnapshot(room.state)
  };
  send(room.players.white, payload);
  send(room.players.black, payload);
  const wasOpen = room.open;
  rooms.delete(roomId);
  if (wasOpen) broadcastLobby();
}

function finishRoomByTimeout(room, roomId, color, reason = 'timeout') {
  const winner = color === 'white' ? 'black' : 'white';
  finishRoom(room, roomId, winner, reason);
}

function getValidMoves(state, row, col) {
  const piece = state.board[row][col];
  if (!piece) return [];

  const moves = [];
  const { type, color } = piece;

  switch(type) {
    case '♟': {
      const dir = color === 'white' ? 1 : -1;
      const startRow = color === 'white' ? 1 : 6;

      const nextRow = row + dir;
      if (nextRow >= 0 && nextRow <= 7 && !state.board[nextRow][col]) {
        moves.push([nextRow, col]);
        const doubleRow = row + dir * 2;
        if (row === startRow && doubleRow >= 0 && doubleRow <= 7 && !state.board[doubleRow][col]) {
          moves.push([doubleRow, col]);
        }
      }

      for (const dc of [-1, 1]) {
        const nr = row + dir, nc = col + dc;
        if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
          const target = state.board[nr][nc];
          if (target && target.color !== color) {
            moves.push([nr, nc]);
          }
        }
      }
      break;
    }

    case '♜':
      for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        for (let i = 1; i < 8; i++) {
          const nr = row + dr * i, nc = col + dc * i;
          if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
          if (state.board[nr][nc]) {
            if (state.board[nr][nc].color !== color) moves.push([nr, nc]);
            break;
          }
          moves.push([nr, nc]);
        }
      }
      break;

    case '♞':
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr = row + dr, nc = col + dc;
        if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
          if (!state.board[nr][nc] || state.board[nr][nc].color !== color)
            moves.push([nr, nc]);
        }
      }
      break;

    case '♝':
      for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
        for (let i = 1; i < 8; i++) {
          const nr = row + dr * i, nc = col + dc * i;
          if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
          if (state.board[nr][nc]) {
            if (state.board[nr][nc].color !== color) moves.push([nr, nc]);
            break;
          }
          moves.push([nr, nc]);
        }
      }
      break;

    case '♛':
      for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0],[-1,-1],[-1,1],[1,-1],[1,1]]) {
        for (let i = 1; i < 8; i++) {
          const nr = row + dr * i, nc = col + dc * i;
          if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
          if (state.board[nr][nc]) {
            if (state.board[nr][nc].color !== color) moves.push([nr, nc]);
            break;
          }
          moves.push([nr, nc]);
        }
      }
      break;

    case '♚':
      for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0],[-1,-1],[-1,1],[1,-1],[1,1]]) {
        const nr = row + dr, nc = col + dc;
        if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
          if (!state.board[nr][nc] || state.board[nr][nc].color !== color)
            moves.push([nr, nc]);
        }
      }
      break;
  }

  return moves.filter(([r, c]) => r >= 0 && r <= 7 && c >= 0 && c <= 7);
}

function makeMove(state, fromRow, fromCol, toRow, toCol) {
  const piece = state.board[fromRow][fromCol];
  const target = state.board[toRow][toCol];

  if (target) {
    state.capturedPieces[piece.color].push(target);
  }

  state.board[toRow][toCol] = piece;
  state.board[fromRow][fromCol] = null;
  piece.moved = true;

  if (piece.type === '♟') {
    if ((piece.color === 'white' && toRow === 7) || (piece.color === 'black' && toRow === 0)) {
      piece.type = '♛';
    }
  }

  state.currentTurn = state.currentTurn === 'white' ? 'black' : 'white';
  state.moveHistory.push({ from: [fromRow, fromCol], to: [toRow, toCol], piece });
}

function hasKing(state, color) {
  return state.board.some(row => row.some(cell => cell?.type === '♚' && cell.color === color));
}

function send(client, payload) {
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(payload));
  }
}

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('error', (err) => console.error('socket error:', err.message));

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      return send(ws, { type: 'error', message: 'Malformed message' });
    }
    if (!msg || typeof msg.type !== 'string') return;

    switch(msg.type) {
      case 'get_lobby':
        send(ws, { type: 'lobby', rooms: getOpenRooms() });
        break;

      case 'create_room': {
        if (waitingPlayer === ws) waitingPlayer = null;
        if (ws.roomId && rooms.has(ws.roomId)) {
          return send(ws, { type: 'error', message: 'Room already active' });
        }
        const roomId = generateRoomId();
        const timeControl = normalizeTimeControl(msg.timeControl);
        const state = createChessState(timeControl);
        const room = {
          roomId,
          players: { white: ws, black: null },
          state,
          timeControl,
          open: msg.open === true,
          deckId: normalizeDeckId(msg.deckId),
          createdAt: Date.now(),
          started: false
        };
        rooms.set(roomId, room);
        ws.roomId = roomId;
        ws.color = 'white';
        send(ws, { type: 'room_created', roomId, timeControl, deckId: room.deckId });
        if (room.open) broadcastLobby();
        break;
      }

      case 'join_random': {
        if (ws.roomId && rooms.has(ws.roomId)) {
          return send(ws, { type: 'error', message: 'Room already active' });
        }
        if (waitingPlayer === ws) {
          send(ws, { type: 'waiting' });
          break;
        }
        if (waitingPlayer && waitingPlayer.readyState === WebSocket.OPEN) {
          const roomId = generateRoomId();
          const timeControl = normalizeTimeControl(waitingPlayer.timeControl || msg.timeControl || {
            enabled: true,
            minutes: 10,
            increment: 5
          });
          const state = createChessState(timeControl);
          const room = {
            roomId,
            players: { white: waitingPlayer, black: ws },
            state,
            timeControl,
            deckId: normalizeDeckId(waitingPlayer.deckId),
            started: true
          };
          if (state.clock) state.clock.lastMoveAt = Date.now();
          rooms.set(roomId, room);

          waitingPlayer.roomId = roomId;
          waitingPlayer.color = 'white';
          ws.roomId = roomId;
          ws.color = 'black';

          send(waitingPlayer, {
            type: 'game_start',
            color: 'white',
            roomId,
            deckId: room.deckId,
            timeControl,
            state,
            clock: clockSnapshot(state)
          });
          send(ws, {
            type: 'game_start',
            color: 'black',
            roomId,
            deckId: room.deckId,
            timeControl,
            state,
            clock: clockSnapshot(state)
          });

          waitingPlayer = null;
          scheduleClockTimeout(room, roomId);
        } else {
          waitingPlayer = ws;
          ws.deckId = normalizeDeckId(msg.deckId);
          ws.timeControl = normalizeTimeControl(msg.timeControl);
          send(ws, { type: 'waiting' });
        }
        break;
      }

      case 'join_room': {
        if (waitingPlayer === ws) waitingPlayer = null;
        if (ws.roomId && rooms.has(ws.roomId)) {
          return send(ws, { type: 'error', message: 'Room already active' });
        }
        const roomId = typeof msg.roomId === 'string' ? msg.roomId.toUpperCase().trim() : '';
        const room = rooms.get(roomId);
        const host = room && room.players.white;

        if (host === ws) {
          return send(ws, { type: 'error', message: 'Cannot join your own room' });
        }
        if (waitingPlayer === ws) waitingPlayer = null;

        if (!room || room.players.black) {
          send(ws, { type: 'error', message: 'Room not found or full' });
          break;
        }
        const wasOpen = room.open;
        if (!host || host.readyState !== WebSocket.OPEN) {
          clearClockTimeout(room);
          rooms.delete(roomId);
          send(ws, { type: 'error', message: 'Host is no longer connected' });
          if (wasOpen) broadcastLobby();
          break;
        }

        room.players.black = ws;
        ws.roomId = roomId;
        ws.color = 'black';
        room.started = true;
        room.open = false;
        if (room.state.clock) room.state.clock.lastMoveAt = Date.now();

        send(ws, {
          type: 'game_start',
          color: 'black',
          roomId,
          deckId: room.deckId,
          timeControl: room.timeControl,
          state: room.state,
          clock: clockSnapshot(room.state)
        });
        send(host, {
          type: 'game_start',
          color: 'white',
          roomId,
          deckId: room.deckId,
          timeControl: room.timeControl,
          state: room.state,
          clock: clockSnapshot(room.state)
        });
        if (wasOpen) broadcastLobby();
        scheduleClockTimeout(room, roomId);
        break;
      }

      case 'move': {
        const room = rooms.get(ws.roomId);
        if (!room || !room.started || !room.players.black) {
          send(ws, { type: 'error', message: 'Game has not started' });
          break;
        }

        const { state } = room;
        const expired = clockExpiredColor(state);
        if (expired) {
          finishRoomByTimeout(room, ws.roomId, expired);
          return;
        }
        const onBoard = (v) => Number.isInteger(v) && v >= 0 && v <= 7;
        if (!Array.isArray(msg.from) || !Array.isArray(msg.to) ||
            !msg.from.every(onBoard) || !msg.to.every(onBoard)) {
          return send(ws, { type: 'error', message: 'Invalid move' });
        }

        const [fromRow, fromCol] = msg.from;
        const [toRow, toCol] = msg.to;

        const piece = state.board[fromRow][fromCol];
        if (!piece || piece.color !== ws.color || state.currentTurn !== ws.color) {
          return send(ws, { type: 'error', message: 'Not your move' });
        }

        const validMoves = getValidMoves(state, fromRow, fromCol);
        if (!validMoves.some(([r, c]) => r === toRow && c === toCol)) {
          return send(ws, { type: 'error', message: 'Illegal move' });
        }

        if (!applyClockMove(state, ws.color)) {
          finishRoomByTimeout(room, ws.roomId, clockExpiredColor(state) || ws.color);
          return;
        }

        const capturedPiece = state.board[toRow][toCol];
        makeMove(state, fromRow, fromCol, toRow, toCol);
        if (!hasKing(state, 'white')) {
          finishRoom(room, ws.roomId, 'black', 'checkmate');
          return;
        }
        if (!hasKing(state, 'black')) {
          finishRoom(room, ws.roomId, 'white', 'checkmate');
          return;
        }
        scheduleClockTimeout(room, ws.roomId);

        const opponent = ws.color === 'white' ? room.players.black : room.players.white;

        const moveData = {
          type: 'move_made',
          from: [fromRow, fromCol],
          to: [toRow, toCol],
          piece: state.board[toRow][toCol],
          captured: capturedPiece,
          currentTurn: state.currentTurn,
          state,
          clock: clockSnapshot(state)
        };

        send(opponent, moveData);
        send(ws, moveData);
        break;
      }

      case 'claim_timeout': {
        const room = rooms.get(ws.roomId);
        if (!room || !room.started || !room.players.black) break;
        const expired = clockExpiredColor(room.state);
        if (expired) finishRoomByTimeout(room, ws.roomId, expired);
        else send(ws, { type: 'error', message: 'Clock has not expired' });
        break;
      }

      case 'chat': {
        const room = rooms.get(ws.roomId);
        if (!room || !room.started || !room.players.black) break;
        const opponent = ws.color === 'white' ? room.players.black : room.players.white;
        send(opponent, { type: 'chat', message: msg.message, from: ws.color });
        break;
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    if (waitingPlayer === ws) waitingPlayer = null;
    const room = rooms.get(ws.roomId);
    if (room) {
      const wasOpen = room.open;
      const opponent = ws.color === 'white' ? room.players.black : room.players.white;
      send(opponent, { type: 'opponent_disconnected' });
      clearClockTimeout(room);
      rooms.delete(ws.roomId);
      if (wasOpen) broadcastLobby();
    }
  });
});

const heartbeat = setInterval(() => {
  clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  });
}, 30000);
if (heartbeat.unref) heartbeat.unref();

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Chess server running on http://localhost:${PORT}`);
});