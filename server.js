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
let waitingPlayer = null;

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createChessState() {
  const board = Array(8).fill(null).map(() => Array(8).fill(null));
  
  const pieceOrder = ['♜','♞','♝','♛','♚','♝','♞','♜'];
  
  for (let x = 0; x < 8; x++) {
    board[0][x] = { type: pieceOrder[x], color: 'white', moved: false };
    board[1][x] = { type: '♟', color: 'white', moved: false };
    board[6][x] = { type: '♟', color: 'black', moved: false };
    board[7][x] = { type: pieceOrder[x], color: 'black', moved: false };
  }
  
  return {
    board,
    currentTurn: 'white',
    selectedPiece: null,
    validMoves: [],
    moveHistory: [],
    capturedPieces: { white: [], black: [] },
    gameOver: false,
    winner: null
  };
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

function send(client, payload) {
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(payload));
  }
}

wss.on('connection', (ws) => {
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
      case 'create_room': {
        const roomId = generateRoomId();
        const state = createChessState();
        rooms.set(roomId, {
          players: { white: ws, black: null },
          state
        });
        ws.roomId = roomId;
        ws.color = 'white';
        send(ws, { type: 'room_created', roomId });
        break;
      }
      
      case 'join_random': {
        if (waitingPlayer && waitingPlayer.readyState === WebSocket.OPEN) {
          const roomId = generateRoomId();
          const state = createChessState();
          rooms.set(roomId, {
            players: { white: waitingPlayer, black: ws },
            state
          });
          
          waitingPlayer.roomId = roomId;
          waitingPlayer.color = 'white';
          ws.roomId = roomId;
          ws.color = 'black';
          
          send(waitingPlayer, { type: 'game_start', color: 'white', roomId, state });
          send(ws, { type: 'game_start', color: 'black', roomId, state });
          
          waitingPlayer = null;
        } else {
          waitingPlayer = ws;
          send(ws, { type: 'waiting' });
        }
        break;
      }
      
      case 'join_room': {
        const roomId = typeof msg.roomId === 'string' ? msg.roomId.toUpperCase().trim() : '';
        const room = rooms.get(roomId);
        const host = room && room.players.white;

        if (!room || room.players.black) {
          send(ws, { type: 'error', message: 'Room not found or full' });
          break;
        }
        if (!host || host.readyState !== WebSocket.OPEN) {
          rooms.delete(roomId);
          send(ws, { type: 'error', message: 'Host is no longer connected' });
          break;
        }

        room.players.black = ws;
        ws.roomId = roomId;
        ws.color = 'black';

        send(ws, { type: 'game_start', color: 'black', roomId, state: room.state });
        send(host, { type: 'game_start', color: 'white', roomId, state: room.state });
        break;
      }
      
      case 'move': {
        const room = rooms.get(ws.roomId);
        if (!room) break;
        
        const { state } = room;
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
        
        const capturedPiece = state.board[toRow][toCol];
        makeMove(state, fromRow, fromCol, toRow, toCol);
        
        const opponent = ws.color === 'white' ? room.players.black : room.players.white;
        
        const moveData = {
          type: 'move_made',
          from: [fromRow, fromCol],
          to: [toRow, toCol],
          piece: state.board[toRow][toCol],
          captured: capturedPiece,
          currentTurn: state.currentTurn,
          state
        };
        
        send(opponent, moveData);
        send(ws, moveData);
        break;
      }
      
      case 'chat': {
        const room = rooms.get(ws.roomId);
        if (!room) break;
        const opponent = ws.color === 'white' ? room.players.black : room.players.white;
        send(opponent, { type: 'chat', message: msg.message, from: ws.color });
        break;
      }
    }
  });
  
  ws.on('close', () => {
    if (waitingPlayer === ws) waitingPlayer = null;
    const room = rooms.get(ws.roomId);
    if (room) {
      const opponent = ws.color === 'white' ? room.players.black : room.players.white;
      send(opponent, { type: 'opponent_disconnected' });
      rooms.delete(ws.roomId);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Chess server running on http://localhost:${PORT}`);
});