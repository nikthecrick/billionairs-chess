const PROMOTION_ROW = { white: 7, black: 0 };

class ChessGame {
  constructor() {
    this.chess3d = null;
    this.ws = null;
    this.mode = null;
    this.myColor = null;
    this.currentTurn = 'white';
    this.selectedSquare = null;
    this.validMoves = [];
    this.state = null;
    this.roomId = null;
    this.moveHistory = [];
    this.piecesReady = false;
    this.gameOver = false;
    this.soundEnabled = true;
    this.selectedDeck = 'silicon-valley';
    this.timeControl = { enabled: true, minutes: 10, increment: 5 };
    this.clock = null;
    this.clockTimer = null;
    this.clockSyncOffset = 0;
    this.clockTimeoutClaimed = false;
    this.pendingClock = null;
    this.pendingMoves = [];
    this.gameGeneration = 0;
    this.lobbyOpen = false;
    this.lobbyRooms = [];
    this.lobbyError = null;
    this.openRoomWaiting = false;
    this.roomCreatePending = false;
    this.joinPending = false;
    this.joinFromLobby = false;
    this.socketRole = null;
    this.socketGeneration = 0;

    this.setupMenu();
    this.setupDeckSelector();
    this.setupTimeControls();
    this.renderRoster();
  }

  /* ─── Menu ───────────────────────────────────────────────────── */

  setupDeckSelector() {
    document.querySelectorAll('.deck-option').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.parentElement.classList.contains('disabled')) return;
        window.chessSounds.playButton();
        document.querySelectorAll('.deck-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedDeck = btn.dataset.deck;
        this.renderRoster();
        this.updateGameAvatars();
        this.updateStageLabel();
      });
    });
  }

  setupTimeControls() {
    document.querySelectorAll('.time-option').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.parentElement.classList.contains('disabled')) return;
        window.chessSounds.playButton();
        document.querySelectorAll('.time-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.timeControl = {
          enabled: btn.dataset.enabled === 'true',
          minutes: Number(btn.dataset.minutes || 0),
          increment: Number(btn.dataset.increment || 0)
        };
      });
    });
  }

  renderRoster() {
    const deck = getDeck(this.selectedDeck);
    const content = document.getElementById('roster-content');
    const order = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];

    const team = (color) => order
      .map(p => `<div class="piece-chip"><div class="piece-avatar" style="background-image:url('assets/portraits/${deck[color][p].image}')"></div><span>${deck[color][p].name}</span></div>`)
      .join('');

    content.innerHTML = `
      <div class="team">
        <div class="team-label">White</div>
        <div class="team-pieces">${team('white')}</div>
      </div>
      <div class="team">
        <div class="team-label">Black</div>
        <div class="team-pieces">${team('black')}</div>
      </div>
    `;
  }

  updateGameAvatars() {
    const deck = getDeck(this.selectedDeck);
    const whiteAvatar = document.querySelector('.white-avatar');
    const blackAvatar = document.querySelector('.black-avatar');
    if (whiteAvatar) whiteAvatar.style.backgroundImage = `url('assets/portraits/${deck.white.king.image}')`;
    if (blackAvatar) blackAvatar.style.backgroundImage = `url('assets/portraits/${deck.black.king.image}')`;
  }

  updateStageLabel() {
    const label = document.getElementById('stage-label');
    if (!label) return;
    label.textContent = getBoardTheme(this.selectedDeck).name;
  }

  showMenuPanel(panelId) {
    ['menu-actions', 'online-menu', 'lobby-screen', 'room-join-form', 'waiting-screen'].forEach((id) => {
      document.getElementById(id)?.classList.add('hidden');
    });
    if (panelId) document.getElementById(panelId)?.classList.remove('hidden');
  }

  closeSocket() {
    const socket = this.ws;
    this.ws = null;
    this.socketRole = null;
    this.socketGeneration++;
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
  }

  isCurrentSocket(socket, generation) {
    return this.ws === socket && this.socketGeneration === generation;
  }

  leaveLobby() {
    this.lobbyOpen = false;
    this.lobbyRooms = [];
    this.lobbyError = null;
    this.roomCreatePending = false;
    this.joinPending = false;
    this.joinFromLobby = false;
    if (this.socketRole === 'lobby') this.closeSocket();
    this.setDeckSelectorEnabled(true);
    this.setTimeControlsEnabled(true);
    this.hideLobby();
  }

  normalizeTimeControlValue(input) {
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

  applyDeck(deckId) {
    const hasDeck = Object.prototype.hasOwnProperty.call(DECKS, deckId);
    this.selectedDeck = hasDeck ? deckId : 'silicon-valley';
    const deck = getDeck(this.selectedDeck);
    document.querySelectorAll('.deck-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.deck === this.selectedDeck);
    });
    this.renderRoster();
    this.updateGameAvatars();
    this.updateStageLabel();
    if (typeof window.setPortraitDeck === 'function') window.setPortraitDeck(this.selectedDeck);
  }

  applyTimeControl(timeControl) {
    const normalized = this.normalizeTimeControlValue(timeControl);
    this.timeControl = normalized;
    document.querySelectorAll('.time-option').forEach(btn => {
      btn.classList.toggle('active',
        btn.dataset.enabled === String(normalized.enabled) &&
        Number(btn.dataset.minutes || 0) === normalized.minutes &&
        Number(btn.dataset.increment || 0) === normalized.increment
      );
    });
  }

  setDeckSelectorEnabled(enabled) {
    const options = document.getElementById('deck-options');
    if (!options) return;
    options.classList.toggle('disabled', !enabled);
    options.setAttribute('aria-disabled', String(!enabled));
  }

  setTimeControlsEnabled(enabled) {
    const options = document.getElementById('time-options');
    if (!options) return;
    options.classList.toggle('disabled', !enabled);
    options.setAttribute('aria-disabled', String(!enabled));
  }

  createTimeControl() {
    return {
      enabled: this.timeControl.enabled,
      minutes: this.timeControl.minutes,
      increment: this.timeControl.increment
    };
  }

  startLocalClock() {
    this.stopClock();
    this.pendingClock = null;
    if (!this.timeControl.enabled) {
      this.clock = null;
      this.renderClock();
      return;
    }

    const initialMs = this.timeControl.minutes * 60000;
    const now = Date.now();
    this.clock = {
      enabled: true,
      whiteMs: initialMs,
      blackMs: initialMs,
      incrementMs: this.timeControl.increment * 1000,
      activeColor: 'white',
      lastMoveAt: now
    };
    this.clockSyncOffset = 0;
    this.clockTimeoutClaimed = false;
    this.startClockTicker();
    this.renderClock();
  }

  startClockFromServer(clock) {
    this.stopClock();
    this.pendingClock = null;
    if (!clock?.enabled) {
      this.clock = null;
      this.renderClock();
      return;
    }

    const serverNow = Number(clock.serverNow || Date.now());
    this.clock = {
      enabled: true,
      whiteMs: Number(clock.whiteMs),
      blackMs: Number(clock.blackMs),
      incrementMs: Number(clock.incrementMs || 0),
      activeColor: clock.activeColor || 'white',
      lastMoveAt: Number(clock.lastMoveAt || serverNow)
    };
    this.clockSyncOffset = Date.now() - serverNow;
    this.clockTimeoutClaimed = false;
    this.startClockTicker();
    this.renderClock();
  }

  startClockTicker() {
    this.stopClock();
    this.clockTimer = window.setInterval(() => this.renderClock(), 100);
  }

  stopClock() {
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer = null;
  }

  getClockRemaining(color) {
    if (!this.clock) return Infinity;
    const now = Date.now() - this.clockSyncOffset;
    const elapsed = Math.max(0, now - this.clock.lastMoveAt);
    return Math.max(0, this.clock[`${color}Ms`] - elapsed);
  }

  renderClock() {
    const whiteEl = document.getElementById('clock-white');
    const blackEl = document.getElementById('clock-black');
    if (!whiteEl || !blackEl) return;

    if (!this.clock) {
      whiteEl.textContent = '--:--';
      blackEl.textContent = '--:--';
      whiteEl.classList.remove('low', 'critical');
      blackEl.classList.remove('low', 'critical');
      return;
    }

    const activeRemaining = this.getClockRemaining(this.clock.activeColor);
    const whiteRemaining = this.clock.activeColor === 'white' ? activeRemaining : this.clock.whiteMs;
    const blackRemaining = this.clock.activeColor === 'black' ? activeRemaining : this.clock.blackMs;
    this.setClockElement(whiteEl, whiteRemaining);
    this.setClockElement(blackEl, blackRemaining);

    if (activeRemaining <= 0) {
      if (this.mode === 'local') {
        this.finishByTimeout(this.clock.activeColor);
      } else if (typeof WebSocket !== 'undefined' && this.ws?.readyState === WebSocket.OPEN && !this.clockTimeoutClaimed) {
        this.clockTimeoutClaimed = true;
        this.ws.send(JSON.stringify({ type: 'claim_timeout' }));
      }
    }
  }

  setClockElement(element, ms) {
    element.textContent = this.formatClock(ms);
    element.classList.toggle('low', ms <= 20000 && ms > 5000);
    element.classList.toggle('critical', ms <= 5000);
  }

  formatClock(ms) {
    const totalTenths = Math.max(0, Math.ceil(ms / 100));
    const minutes = Math.floor(totalTenths / 600);
    const seconds = Math.floor((totalTenths % 600) / 10);
    const tenths = totalTenths % 10;
    const base = `${minutes}:${String(seconds).padStart(2, '0')}`;
    return minutes > 0 ? base : `${base}.${tenths}`;
  }

  tickLocalClock(color) {
    if (!this.clock) return true;
    const now = Date.now();
    const elapsed = now - this.clock.lastMoveAt;
    const remaining = this.clock[`${color}Ms`] - elapsed;
    if (remaining <= 0) {
      this.finishByTimeout(color);
      return false;
    }

    this.clock[`${color}Ms`] = remaining + this.clock.incrementMs;
    this.clock.activeColor = color === 'white' ? 'black' : 'white';
    this.clock.lastMoveAt = now;
    this.renderClock();
    return true;
  }

  finishByTimeout(color) {
    if (this.gameOver) return;
    this.gameOver = true;
    this.stopClock();
    const winner = color === 'white' ? 'black' : 'white';
    const loser = color === 'white' ? 'White' : 'Black';
    const winnerName = color === 'white' ? 'Black' : 'White';
    this.showGameOver(
      `${winnerName} Wins`,
      `${loser} ran out of time.`,
      this.mode === 'online' && this.myColor === winner ? 'victory' : 'defeat'
    );
  }

  setupMenu() {
    const on = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    };

    on('btn-local', () => {
      window.chessSounds.playButton();
      this.closeSocket();
      this.setDeckSelectorEnabled(true);
      this.setTimeControlsEnabled(true);
      this.startLocalGame();
    });

    on('btn-online', () => {
      window.chessSounds.playButton();
      this.setDeckSelectorEnabled(true);
      this.setTimeControlsEnabled(true);
      this.showMenuPanel('online-menu');
    });

    on('btn-create-room', () => {
      window.chessSounds.playButton();
      this.createRoom(false);
    });

    on('btn-create-open', () => {
      window.chessSounds.playButton();
      this.createRoom(true);
    });

    on('btn-find-open', () => {
      window.chessSounds.playButton();
      this.showLobby();
    });

    on('btn-join-room', () => {
      window.chessSounds.playButton();
      this.leaveLobby();
      this.showMenuPanel('room-join-form');
      document.getElementById('room-code').focus();
    });

    on('btn-join', () => {
      window.chessSounds.playButton();
      this.joinRoom();
    });

    document.getElementById('room-code').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.joinRoom();
    });

    on('btn-back', () => {
      window.chessSounds.playButton();
      this.leaveLobby();
      this.showMenuPanel('menu-actions');
    });

    on('btn-refresh-lobby', () => {
      window.chessSounds.playButton();
      this.showLobby();
    });

    on('btn-lobby-back', () => {
      window.chessSounds.playButton();
      this.leaveLobby();
      this.showMenuPanel('online-menu');
    });

    on('btn-back2', () => {
      window.chessSounds.playButton();
      this.showMenuPanel('online-menu');
    });

    on('btn-copy-code', async () => {
      window.chessSounds.playButton();
      const code = document.getElementById('room-code-display').textContent;
      const btn = document.getElementById('btn-copy-code');
      const label = btn.querySelector('.btn-label');
      const ok = await this.copyToClipboard(code);
      label.textContent = ok ? 'Copied!' : 'Copy failed';
      setTimeout(() => { label.textContent = 'Copy Code'; }, 2000);
    });

    on('btn-cancel-wait', () => {
      window.chessSounds.playButton();
      this.closeSocket();
      this.openRoomWaiting = false;
      this.roomCreatePending = false;
      this.joinPending = false;
      this.joinFromLobby = false;
      this.setDeckSelectorEnabled(true);
      this.setTimeControlsEnabled(true);
      this.showMenuPanel('online-menu');
    });

    on('btn-rotate', () => {
      window.chessSounds.playButton();
      if (this.chess3d) this.chess3d.rotateBoard();
    });

    on('btn-reset-view', () => {
      window.chessSounds.playButton();
      if (this.chess3d) {
        this.chess3d.resetView();
        this.chess3d.faceSide(this.mode === 'online' ? this.myColor : this.currentTurn);
      }
    });

    on('btn-undo', () => {
      window.chessSounds.playButton();
      this.undoMove();
    });

    on('btn-sound', () => {
      this.soundEnabled = !this.soundEnabled;
      window.chessSounds.setEnabled(this.soundEnabled);
      document.getElementById('btn-sound').classList.toggle('muted', !this.soundEnabled);
      document.getElementById('btn-sound').setAttribute(
        'aria-label', this.soundEnabled ? 'Mute sound' : 'Unmute sound'
      );
      if (this.soundEnabled) window.chessSounds.playButton();
    });

    on('btn-menu', () => {
      window.chessSounds.playButton();
      this.returnToMenu();
    });

    on('btn-new-game', () => {
      window.chessSounds.playButton();
      this.returnToMenu();
    });

    // Clipboard needs a secure context; fall back to a hidden textarea.
    document.addEventListener('pointerdown', () => window.chessSounds.unlock(), { once: true });
  }

  async copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  /* ─── Setup / teardown ───────────────────────────────────────── */

  // One canvas/renderer/WebGL context is reused for every game. Browsers
  // refuse to create new WebGL contexts after a handful exist, which crashed
  // the board when starting another game (e.g. after changing the deck);
  // only the scene contents are rebuilt per game.
  async initChess3D() {
    this.piecesReady = false;
    const generation = ++this.gameGeneration;
    if (this.chess3d) {
      this.chess3d.dispose();
      this.chess3d = null;
    }

    this.updateStageLabel();
    this.chess3d = new Chess3D(document.getElementById('chess-canvas'), this.selectedDeck);
    await this.chess3d.createPieces();
    if (generation !== this.gameGeneration || this.gameOver) return;
    this.piecesReady = true;
    if (this.mode === 'local') this.startLocalClock();
    else if (this.pendingClock) this.startClockFromServer(this.pendingClock);
    this.flushPendingMoves();
  }

  enterGameScreen() {
    this.showMenuPanel(null);
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.body.classList.add('in-game');
  }

  startLocalGame() {
    this.mode = 'local';
    this.myColor = 'white';
    this.currentTurn = 'white';
    this.gameOver = false;
    this.moveHistory = [];
    this.selectedSquare = null;
    this.validMoves = [];
    this.generateInitialState();

    this.enterGameScreen();

    this.initChess3D().then(() => {
      this.chess3d.faceSide('white', false);
      this.updateUI();
      this.updateGameAvatars();
    }).catch(() => this.returnToMenu());
  }

  socketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  createRoom(open = false) {
    this.closeSocket();
    this.lobbyOpen = false;
    this.joinFromLobby = false;
    this.openRoomWaiting = false;
    this.roomCreatePending = true;
    this.setDeckSelectorEnabled(false);
    this.setTimeControlsEnabled(false);
    this.showMenuPanel('waiting-screen');

    const generation = ++this.socketGeneration;
    const socket = new WebSocket(this.socketUrl());
    this.ws = socket;
    this.socketRole = 'room';

    socket.onopen = () => {
      if (!this.isCurrentSocket(socket, generation)) {
        socket.close();
        return;
      }
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({
        type: 'create_room',
        open,
        deckId: this.selectedDeck,
        timeControl: this.createTimeControl()
      }));
    };
    socket.onmessage = (event) => {
      if (!this.isCurrentSocket(socket, generation)) return;
      this.handleWebSocketMessage(JSON.parse(event.data));
    };
    socket.onerror = () => {
      if (this.isCurrentSocket(socket, generation)) window.chessSounds.playError();
    };
    socket.onclose = () => {
      if (!this.isCurrentSocket(socket, generation)) return;
      this.ws = null;
      this.socketRole = null;
      this.openRoomWaiting = false;
      this.roomCreatePending = false;
      this.joinPending = false;
      if (this.mode === 'online' && this.roomId && !this.gameOver) {
        this.returnToMenu();
        return;
      }
      this.setDeckSelectorEnabled(true);
      this.setTimeControlsEnabled(true);
      if (!document.getElementById('waiting-screen').classList.contains('hidden')) {
        this.showMenuPanel('online-menu');
      }
    };

    document.getElementById('waiting-sub').textContent = open
      ? 'Your game is visible in the open lobby.'
      : 'Share this code with a friend';
    document.getElementById('btn-copy-code').classList.toggle('hidden', open);
    document.getElementById('room-code-display').textContent = '...';
    this.openRoomWaiting = open;
  }

  joinRoom(roomId = null) {
    const input = document.getElementById('room-code');
    const code = (roomId || input.value).toUpperCase().trim();
    if (code.length < 4) {
      window.chessSounds.playError();
      window.chessHaptics.error();
      if (!roomId) {
        input.style.borderColor = 'var(--red, #ff5a5f)';
        setTimeout(() => { input.style.borderColor = ''; }, 1500);
      }
      return;
    }

    const fromLobby = this.lobbyOpen;
    this.closeSocket();
    this.lobbyOpen = false;
    this.openRoomWaiting = false;
    this.roomCreatePending = false;
    this.joinPending = true;
    this.joinFromLobby = fromLobby;
    this.setDeckSelectorEnabled(false);
    this.setTimeControlsEnabled(false);
    this.showMenuPanel('waiting-screen');

    const generation = ++this.socketGeneration;
    const socket = new WebSocket(this.socketUrl());
    this.ws = socket;
    this.socketRole = 'room';

    socket.onopen = () => {
      if (!this.isCurrentSocket(socket, generation)) {
        socket.close();
        return;
      }
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: 'join_room', roomId: code }));
    };
    socket.onmessage = (event) => {
      if (!this.isCurrentSocket(socket, generation)) return;
      this.handleWebSocketMessage(JSON.parse(event.data));
    };
    socket.onerror = () => {
      if (this.isCurrentSocket(socket, generation)) window.chessSounds.playError();
    };
    socket.onclose = () => {
      if (!this.isCurrentSocket(socket, generation)) return;
      const wasJoinPending = this.joinPending;
      const wasJoinFromLobby = this.joinFromLobby;
      this.ws = null;
      this.socketRole = null;
      this.joinPending = false;
      if (this.mode === 'online' && this.roomId && !this.gameOver) {
        this.returnToMenu();
        return;
      }
      this.setDeckSelectorEnabled(true);
      this.setTimeControlsEnabled(true);
      if (wasJoinPending && wasJoinFromLobby) {
        this.joinFromLobby = false;
        this.showLobby();
        return;
      }
      if (wasJoinPending) {
        this.showMenuPanel('room-join-form');
      }
    };

    document.getElementById('room-code-display').textContent = code;
  }

  showLobby(connect = true, clearError = true) {
    this.lobbyOpen = true;
    this.joinPending = false;
    this.roomCreatePending = false;
    this.lobbyRooms = [];
    if (clearError) this.lobbyError = null;
    this.setDeckSelectorEnabled(false);
    this.setTimeControlsEnabled(false);
    this.showMenuPanel('lobby-screen');
    this.renderLobby();
    if (connect) this.ensureLobbySocket();
  }

  hideLobby() {
    this.lobbyOpen = false;
    document.getElementById('lobby-screen').classList.add('hidden');
  }

  ensureLobbySocket() {
    if (this.socketRole === 'lobby' && this.ws?.readyState === WebSocket.OPEN) {
      this.requestLobby();
      return;
    }
    if (this.ws) this.closeSocket();

    const generation = ++this.socketGeneration;
    const socket = new WebSocket(this.socketUrl());
    this.ws = socket;
    this.socketRole = 'lobby';

    socket.onopen = () => {
      if (!this.isCurrentSocket(socket, generation)) {
        socket.close();
        return;
      }
      if (!this.lobbyOpen || socket.readyState !== WebSocket.OPEN) return;
      this.requestLobby();
    };
    socket.onmessage = (event) => {
      if (!this.isCurrentSocket(socket, generation)) return;
      this.handleWebSocketMessage(JSON.parse(event.data));
    };
    socket.onerror = () => {
      if (this.isCurrentSocket(socket, generation)) window.chessSounds.playError();
    };
    socket.onclose = () => {
      if (!this.isCurrentSocket(socket, generation)) return;
      this.ws = null;
      this.socketRole = null;
      if (!this.lobbyOpen) return;
      this.lobbyOpen = false;
      this.lobbyError = 'Connection lost. Return to the menu and try again.';
      this.showLobby(false, false);
    };
  }

  requestLobby() {
    if (this.socketRole === 'lobby' && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'get_lobby' }));
    }
  }

  renderLobby() {
    const list = document.getElementById('lobby-list');
    if (!list) return;

    if (this.lobbyError) {
      list.innerHTML = `<div class="lobby-empty">${this.escapeHtml(this.lobbyError)}</div>`;
      return;
    }

    const rooms = this.lobbyRooms.filter(room => room && room.roomId && room.open === true);
    if (rooms.length === 0) {
      list.innerHTML = '<div class="lobby-empty">No open games yet.<br>Create one and let another player join.</div>';
      return;
    }

    list.innerHTML = rooms.map(room => {
      const deck = getDeck(room.deckId);
      const timeControl = this.formatLobbyTimeControl(room.timeControl);
      return `<button class="lobby-room" data-room-id="${this.escapeHtml(room.roomId)}">
        <span class="lobby-room-main">
          <span class="lobby-room-deck">${this.escapeHtml(deck.name)}</span>
          <span class="lobby-room-meta">
            <span>${this.escapeHtml(timeControl)}</span>
            <span>Public</span>
          </span>
        </span>
        <span class="lobby-room-join">Join</span>
      </button>`;
    }).join('');

    list.querySelectorAll('.lobby-room').forEach(button => {
      button.addEventListener('click', () => {
        window.chessSounds.playButton();
        this.joinRoom(button.dataset.roomId);
      });
    });
  }

  formatLobbyTimeControl(timeControl) {
    const normalized = this.normalizeTimeControlValue(timeControl);
    if (!normalized.enabled) return 'Untimed';
    return `${normalized.minutes} + ${normalized.increment}`;
  }

  escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  handleWebSocketMessage(msg) {
    switch (msg.type) {
      case 'lobby':
        if (this.socketRole !== 'lobby') return;
        this.lobbyRooms = Array.isArray(msg.rooms) ? msg.rooms : [];
        this.lobbyError = null;
        this.renderLobby();
        break;

      case 'room_created':
        if (this.socketRole !== 'room') return;
        this.roomCreatePending = false;
        this.roomId = msg.roomId;
        this.applyDeck(msg.deckId);
        this.applyTimeControl(msg.timeControl);
        document.getElementById('room-code-display').textContent = msg.roomId;
        break;

      case 'waiting':
        if (this.socketRole !== 'room') return;
        document.getElementById('room-code-display').textContent = '...';
        break;

      case 'game_start': {
        if (this.socketRole !== 'room') return;
        this.lobbyOpen = false;
        this.openRoomWaiting = false;
        this.roomCreatePending = false;
        this.joinPending = false;
        this.joinFromLobby = false;
        this.hideLobby();
        this.applyDeck(msg.deckId);
        this.applyTimeControl(msg.timeControl);
        this.mode = 'online';
        this.myColor = msg.color;
        this.roomId = msg.roomId;
        this.state = msg.state;
        this.currentTurn = msg.state?.currentTurn || 'white';
        this.pendingClock = msg.clock || (msg.state?.clock
          ? { ...msg.state.clock, serverNow: Date.now() }
          : null);
        this.pendingMoves = [];
        this.gameOver = false;
        this.moveHistory = [];
        this.selectedSquare = null;
        this.validMoves = [];

        this.enterGameScreen();

        this.initChess3D().then(() => {
          this.chess3d.faceSide(this.myColor, false);
          this.updateUI();
          this.updateGameAvatars();
        }).catch(() => this.returnToMenu());
        break;
      }

      case 'move_made': {
        if (this.socketRole !== 'room') return;
        if (!this.piecesReady || !this.chess3d || this.gameOver) {
          this.pendingMoves.push(msg);
          break;
        }
        this.applyMoveMessage(msg);
        break;
      }

      case 'game_over': {
        if (this.socketRole !== 'room') return;
        this.gameGeneration++;
        this.pendingMoves = [];
        this.pendingClock = null;
        this.stopClock();
        this.state = msg.state || this.state;
        if (msg.winner) {
          const winnerName = msg.winner === 'white' ? 'White' : 'Black';
          const loserName = msg.winner === 'white' ? 'Black' : 'White';
          const detail = msg.reason === 'timeout' ? `${loserName} ran out of time.` : 'Game over.';
          this.showGameOver(
            `${winnerName} Wins`,
            detail,
            this.mode === 'online' && this.myColor === msg.winner ? 'victory' : 'defeat'
          );
        } else {
          this.showGameOver('Game Over', msg.detail || 'The game is over.');
        }
        break;
      }

      case 'error':
        if (this.joinPending && this.joinFromLobby) {
          this.closeSocket();
          this.joinPending = false;
          this.joinFromLobby = false;
          this.showLobby();
          break;
        }
        if (this.joinPending) {
          this.closeSocket();
          this.joinPending = false;
          this.joinFromLobby = false;
          this.setDeckSelectorEnabled(true);
          this.setTimeControlsEnabled(true);
          this.showMenuPanel('room-join-form');
          break;
        }
        if (this.roomCreatePending) {
          this.closeSocket();
          this.roomCreatePending = false;
          this.openRoomWaiting = false;
          this.setDeckSelectorEnabled(true);
          this.setTimeControlsEnabled(true);
          this.showMenuPanel('online-menu');
          break;
        }
        if (this.lobbyOpen && this.socketRole === 'lobby') {
          this.lobbyError = msg.message || 'Unable to load open games';
          this.renderLobby();
          break;
        }
        if (this.socketRole === 'room') {
          window.chessSounds.playError();
          window.chessHaptics.error();
          this.clearSelection();
          this.setStatusFlash(msg.message || 'Move rejected');
        }
        break;

      case 'opponent_disconnected':
        if (this.socketRole === 'room') {
          this.showGameOver('Opponent Left', 'Your opponent disconnected from the game.');
        }
        break;
    }
  }

  applyMoveMessage(msg) {
    this.state = msg.state;
    this.currentTurn = msg.currentTurn;
    if (msg.clock) this.startClockFromServer(msg.clock);
    else if (msg.state?.clock) {
      this.startClockFromServer({ ...msg.state.clock, serverNow: Date.now() });
    }
    this.clearSelection();

    if (this.chess3d) {
      this.chess3d.movePiece(msg.from[0], msg.from[1], msg.to[0], msg.to[1]);
      if (msg.piece) this.chess3d.setPieceType(msg.to[0], msg.to[1], msg.piece.type);
      this.chess3d.clearHighlights();
      this.chess3d.highlightSquare(msg.from[0], msg.from[1], 0xffaa00);
      this.chess3d.highlightSquare(msg.to[0], msg.to[1], 0x00aaff);
    }

    if (msg.captured) {
      window.chessSounds.playCapture();
      window.chessHaptics.capture();
    } else {
      window.chessSounds.playMove();
      window.chessHaptics.move();
    }

    this.updateUI();
    this.checkGameOver();
  }

  flushPendingMoves() {
    const moves = this.pendingMoves.splice(0);
    if (this.gameOver || !this.piecesReady || !this.chess3d) return;
    moves.forEach(msg => this.applyMoveMessage(msg));
  }

  generateInitialState() {
    const board = Array(8).fill(null).map(() => Array(8).fill(null));
    const pieceOrder = ['♜', '♞', '♝', '♛', '♚', '♝', '♞', '♜'];

    for (let x = 0; x < 8; x++) {
      board[0][x] = { type: pieceOrder[x], color: 'white', moved: false };
      board[1][x] = { type: '♟', color: 'white', moved: false };
      board[6][x] = { type: '♟', color: 'black', moved: false };
      board[7][x] = { type: pieceOrder[x], color: 'black', moved: false };
    }

    this.state = {
      board,
      currentTurn: 'white',
      capturedPieces: { white: [], black: [] },
      moveHistory: []
    };
  }

  /* ─── Interaction ────────────────────────────────────────────── */

  canInteract() {
    if (!this.piecesReady || this.gameOver || !this.state) return false;
    if (this.mode === 'local' && this.clock && this.getClockRemaining(this.currentTurn) <= 0) {
      this.finishByTimeout(this.currentTurn);
      return false;
    }
    if (this.mode === 'online' && this.myColor !== this.currentTurn) return false;
    return true;
  }

  clearSelection() {
    this.selectedSquare = null;
    this.validMoves = [];
    if (this.chess3d) this.chess3d.clearValidMoves();
  }

  selectPiece(piece) {
    if (!this.canInteract()) return;

    const { row, col } = piece.userData;
    // Trust the game state, not the mesh: a promoted mesh could lag behind.
    const cell = this.state.board[row]?.[col];
    if (!cell) return;

    if (cell.color !== this.currentTurn) {
      // Tapping an enemy piece that sits on a highlighted square captures it.
      if (this.isValidTarget(row, col)) {
        this.makeMove(this.selectedSquare[0], this.selectedSquare[1], row, col);
      } else if (this.selectedSquare) {
        this.clearSelection();
      }
      return;
    }

    // Tapping the selected piece again deselects it.
    if (this.selectedSquare && this.selectedSquare[0] === row && this.selectedSquare[1] === col) {
      this.clearSelection();
      return;
    }

    this.selectedSquare = [row, col];
    this.validMoves = this.getValidMoves(row, col);
    this.chess3d.clearValidMoves();
    this.chess3d.showSelectedSquare(row, col);
    this.chess3d.showValidMoves(this.validMoves);
    window.chessSounds.playSelect();
    window.chessHaptics.select();
  }

  isValidTarget(row, col) {
    return !!this.selectedSquare && this.validMoves.some(([r, c]) => r === row && c === col);
  }

  handleSquareClick(row, col) {
    if (!this.canInteract()) return;

    // An occupied square can be reached by the plane fallback too.
    const cell = this.state.board[row]?.[col];
    if (cell && !this.isValidTarget(row, col)) {
      const piece = this.chess3d.getPieceAt(row, col);
      if (piece) { this.selectPiece(piece); return; }
    }

    if (!this.selectedSquare) return;

    if (!this.isValidTarget(row, col)) {
      window.chessSounds.playError();
      this.clearSelection();
      return;
    }

    this.makeMove(this.selectedSquare[0], this.selectedSquare[1], row, col);
  }

  handleTapOutside() {
    if (this.selectedSquare) this.clearSelection();
  }

  makeMove(fromRow, fromCol, toRow, toCol) {
    const piece = this.state.board[fromRow][fromCol];
    if (!piece) { this.clearSelection(); return; }

    if (this.mode === 'online') {
      // The server owns the board in online play; applying the move locally
      // first would desync us whenever it rejects the move.
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'move', from: [fromRow, fromCol], to: [toRow, toCol] }));
      }
      this.clearSelection();
      return;
    }

    const target = this.state.board[toRow][toCol];
    const before = { ...piece };  // snapshot before mutation, for undo
    const clockBefore = this.clock ? { ...this.clock } : null;
    if (!this.tickLocalClock(piece.color)) return;

    if (target) this.state.capturedPieces[piece.color].push(target);
    this.state.board[toRow][toCol] = piece;
    this.state.board[fromRow][fromCol] = null;
    piece.moved = true;

    const promoted = piece.type === '♟' && toRow === PROMOTION_ROW[piece.color];
    if (promoted) piece.type = '♛';

    this.moveHistory.push({
      fromRow, fromCol, toRow, toCol,
      piece: before,
      captured: target,
      promoted,
      clock: clockBefore
    });

    this.chess3d.movePiece(fromRow, fromCol, toRow, toCol);
    if (promoted) this.chess3d.setPieceType(toRow, toCol, '♛');
    this.chess3d.clearHighlights();
    this.chess3d.highlightSquare(fromRow, fromCol, 0xffaa00);
    this.chess3d.highlightSquare(toRow, toCol, 0x00aaff);

    if (target) {
      window.chessSounds.playCapture();
      window.chessHaptics.capture();
    } else {
      window.chessSounds.playMove();
      window.chessHaptics.move();
    }

    this.currentTurn = this.currentTurn === 'white' ? 'black' : 'white';
    this.state.currentTurn = this.currentTurn;

    this.clearSelection();
    this.updateUI();
    this.checkGameOver();
  }

  getValidMoves(row, col) {
    const piece = this.state.board[row][col];
    if (!piece) return [];

    const board = this.state.board;
    const { type, color } = piece;
    const moves = [];
    const inside = (r, c) => r >= 0 && r <= 7 && c >= 0 && c <= 7;

    const slide = (dirs) => {
      for (const [dr, dc] of dirs) {
        for (let i = 1; i < 8; i++) {
          const nr = row + dr * i, nc = col + dc * i;
          if (!inside(nr, nc)) break;
          if (board[nr][nc]) {
            if (board[nr][nc].color !== color) moves.push([nr, nc]);
            break;
          }
          moves.push([nr, nc]);
        }
      }
    };

    const stepTo = (dirs) => {
      for (const [dr, dc] of dirs) {
        const nr = row + dr, nc = col + dc;
        if (!inside(nr, nc)) continue;
        if (!board[nr][nc] || board[nr][nc].color !== color) moves.push([nr, nc]);
      }
    };

    const ORTHO = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    if (type === '♟') {
      const dir = color === 'white' ? 1 : -1;
      const startRow = color === 'white' ? 1 : 6;
      const nextRow = row + dir;
      if (inside(nextRow, col) && !board[nextRow][col]) {
        moves.push([nextRow, col]);
        const doubleRow = row + dir * 2;
        if (row === startRow && inside(doubleRow, col) && !board[doubleRow][col]) {
          moves.push([doubleRow, col]);
        }
      }
      for (const dc of [-1, 1]) {
        const nr = row + dir, nc = col + dc;
        if (inside(nr, nc) && board[nr][nc] && board[nr][nc].color !== color) moves.push([nr, nc]);
      }
    } else if (type === '♜') {
      slide(ORTHO);
    } else if (type === '♝') {
      slide(DIAG);
    } else if (type === '♛') {
      slide([...ORTHO, ...DIAG]);
    } else if (type === '♞') {
      stepTo([[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]);
    } else if (type === '♚') {
      stepTo([...ORTHO, ...DIAG]);
    }

    return moves;
  }

  undoMove() {
    if (this.mode === 'online') {
      this.setStatusFlash('Undo is local-only');
      return;
    }
    if (this.moveHistory.length === 0 || !this.chess3d || this.gameOver) return;

    const last = this.moveHistory.pop();
    if (last.clock) {
      this.clock = { ...last.clock, lastMoveAt: Date.now() };
      this.clockTimeoutClaimed = false;
      this.startClockTicker();
      this.renderClock();
    }
    this.state.board[last.fromRow][last.fromCol] = last.piece;
    this.state.board[last.toRow][last.toCol] = last.captured || null;

    this.chess3d.movePiece(last.toRow, last.toCol, last.fromRow, last.fromCol, false);
    if (last.promoted) this.chess3d.setPieceType(last.fromRow, last.fromCol, last.piece.type);

    if (last.captured) {
      this.state.capturedPieces[last.piece.color].pop();
      this.chess3d.addPiece(last.captured.type, last.captured.color, last.toRow, last.toCol);
    }

    this.currentTurn = last.piece.color;
    this.state.currentTurn = this.currentTurn;
    this.gameOver = false;
    document.getElementById('game-over-modal').classList.add('hidden');

    this.chess3d.clearHighlights();
    this.clearSelection();
    this.updateUI();
  }

  /* ─── UI ─────────────────────────────────────────────────────── */

  updateUI() {
    const isWhiteTurn = this.currentTurn === 'white';

    document.getElementById('dot-white').classList.toggle('active', isWhiteTurn);
    document.getElementById('dot-black').classList.toggle('active', !isWhiteTurn);
    document.getElementById('player-white').classList.toggle('active', isWhiteTurn);
    document.getElementById('player-black').classList.toggle('active', !isWhiteTurn);

    const status = document.getElementById('game-status');
    if (this.mode === 'online') {
      status.textContent = this.myColor === this.currentTurn ? 'Your Turn' : "Opponent's Turn";
    } else {
      status.textContent = isWhiteTurn ? 'White to move' : 'Black to move';
    }

    document.getElementById('btn-undo').disabled =
      this.mode === 'online' || this.moveHistory.length === 0;

    this.updateCapturedPieces();
  }

  setStatusFlash(text) {
    const status = document.getElementById('game-status');
    if (!status) return;
    const previous = status.textContent;
    status.textContent = text;
    status.classList.add('flash');
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => {
      status.classList.remove('flash');
      status.textContent = previous;
      this.updateUI();
    }, 1600);
  }

  updateCapturedPieces() {
    if (!this.state) return;
    document.getElementById('captured-white').textContent =
      this.state.capturedPieces.white.map(p => p.type).join('');
    document.getElementById('captured-black').textContent =
      this.state.capturedPieces.black.map(p => p.type).join('');
  }

  checkGameOver() {
    if (!this.state) return;
    let whiteKing = false, blackKing = false;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = this.state.board[r][c];
        if (cell?.type === '♚') {
          if (cell.color === 'white') whiteKing = true;
          else blackKing = true;
        }
      }
    }
    if (!whiteKing) this.showGameOver('Black Wins', 'The white king has fallen', this.mode === 'online' && this.myColor === 'white' ? 'defeat' : 'victory');
    else if (!blackKing) this.showGameOver('White Wins', 'The black king has fallen', this.mode === 'online' && this.myColor === 'black' ? 'defeat' : 'victory');
  }

  showGameOver(title, detail, outcome = 'victory') {
    this.gameOver = true;
    this.stopClock();
    this.clearSelection();
    if (outcome === 'defeat') window.chessSounds.playDefeat();
    else window.chessSounds.playGameOver();
    document.getElementById('winner-text').textContent = title;
    document.getElementById('winner-detail').textContent = detail;
    document.getElementById('game-over-modal').classList.remove('hidden');
  }

  returnToMenu() {
    this.closeSocket();
    if (this.chess3d) { this.chess3d.dispose(); this.chess3d = null; }

    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('game-over-modal').classList.add('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');
    document.body.classList.remove('in-game');
    this.showMenuPanel('menu-actions');

    this.lobbyOpen = false;
    this.lobbyRooms = [];
    this.lobbyError = null;
    this.openRoomWaiting = false;
    this.roomCreatePending = false;
    this.joinPending = false;
    this.joinFromLobby = false;
    this.setDeckSelectorEnabled(true);
    this.setTimeControlsEnabled(true);

    this.piecesReady = false;
    this.gameOver = false;
    this.mode = null;
    this.myColor = null;
    this.currentTurn = 'white';
    this.roomId = null;
    this.state = null;
    this.moveHistory = [];
    this.selectedSquare = null;
    this.validMoves = [];
    this.pendingClock = null;
    this.pendingMoves = [];
    this.gameGeneration++;
    this.stopClock();
    this.clock = null;
    document.getElementById('game-status')?.classList.remove('flash');
    clearTimeout(this.statusTimer);
  }
}

window.addEventListener('DOMContentLoaded', () => { window.game = new ChessGame(); });
