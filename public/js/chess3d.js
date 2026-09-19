const _clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const PIECE_TYPE_NAMES = {
  '♚': 'king', '♛': 'queen', '♜': 'rook',
  '♝': 'bishop', '♞': 'knight', '♟': 'pawn'
};

// [radiusTop, radiusBottom, height, radialSegments]
const PIECE_PROFILES = {
  '♚': [0.35, 0.40, 0.80, 16],
  '♛': [0.30, 0.38, 0.75, 16],
  '♜': [0.28, 0.35, 0.70, 8],
  '♝': [0.25, 0.32, 0.72, 12],
  '♞': [0.27, 0.34, 0.68, 10],
  '♟': [0.20, 0.28, 0.50, 8]
};

const BOARD_OFFSET = 3.5;

// Browsers cap the number of live WebGL contexts (a handful on iOS Safari,
// more on desktop), so creating one per game eventually makes context
// creation fail and the board goes black. One renderer/context is created
// and reused for every game; per-game scene resources are disposed in
// dispose() below.
let sharedRenderer = null;

function getSharedRenderer(canvas) {
  if (!sharedRenderer) {
    sharedRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  }
  return sharedRenderer;
}

class Chess3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.disposed = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.renderer = getSharedRenderer(canvas);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.075);

    this.board = [];
    this.pieces = [];
    this.textures = {};
    this.geometryCache = {};
    this.validMoveMeshes = [];
    this.lastMoveMeshes = [];
    this.selectionMeshes = [];

    // Orbit state. phi is measured from straight-up, so small phi == top-down.
    this.cameraTheta = -Math.PI / 2;  // behind White
    this.cameraPhi = Math.PI / 4;
    this.minPhi = 0.12;
    this.maxPhi = Math.PI / 2 - 0.08;
    this.fitDistance = 16;
    this.zoomRatio = 1;
    this.cameraDistance = 16;

    // Pointer state: one entry per active pointer (finger / mouse / pen).
    this.activePointers = new Map();
    this.pinchStartDist = null;
    this.pinchStartZoom = null;

    this.boardGroup = new THREE.Group();
    this.piecesGroup = new THREE.Group();
    this.moveIndicatorGroup = new THREE.Group();

    this.init();
  }

  init() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(0x0a0a0a);
    this.scene.fog = new THREE.Fog(0x0a0a0a, 22, 60);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -15;
    directionalLight.shadow.camera.right = 15;
    directionalLight.shadow.camera.top = 15;
    directionalLight.shadow.camera.bottom = -15;
    this.scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0x4a90d9, 0.4, 25);
    pointLight.position.set(-5, 12, 5);
    this.scene.add(pointLight);

    this.scene.add(this.boardGroup);
    this.scene.add(this.piecesGroup);
    this.scene.add(this.moveIndicatorGroup);

    this.createBoard();
    this.setupEventListeners();
    this.resize(true);
    this.animate();
  }

  /* ─── Layout / camera ────────────────────────────────────────── */

  // The renderer must match the canvas' CSS box, not the window: the canvas
  // sits between a header and a footer, so window-based sizing skews the
  // projection and makes taps land on the wrong square.
  resize(force = false) {
    const box = this.canvas.parentElement || this.canvas;
    const w = Math.max(1, Math.round(box.clientWidth || this.canvas.clientWidth));
    const h = Math.max(1, Math.round(box.clientHeight || this.canvas.clientHeight));
    if (!force && w === this.viewWidth && h === this.viewHeight) return;

    this.viewWidth = w;
    this.viewHeight = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);  // keep CSS sizing from the stylesheet
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // Tall/narrow phone viewports need a more top-down angle to stay readable.
    if (this.userAdjustedPhi !== true) {
      this.cameraPhi = this.camera.aspect < 0.85 ? 0.62 : Math.PI / 4;
    }

    this.fitDistance = this.computeFitDistance();
    this.minDistance = this.fitDistance * 0.35;
    this.maxDistance = this.fitDistance * 2.0;
    this.setZoomRatio(this.zoomRatio);
  }

  // Iteratively shrink/grow the orbit radius until the board's bounding box
  // projects just inside the viewport. Works for any aspect ratio or angle.
  computeFitDistance(margin = 1.06) {
    const probe = this.camera.clone();
    const corners = [];
    for (const x of [-4.4, 4.4]) {
      for (const z of [-4.4, 4.4]) {
        for (const y of [0, 1.0]) corners.push(new THREE.Vector3(x, y, z));
      }
    }

    let dist = 16;
    for (let i = 0; i < 8; i++) {
      probe.position.set(
        dist * Math.sin(this.cameraPhi) * Math.cos(this.cameraTheta),
        dist * Math.cos(this.cameraPhi),
        dist * Math.sin(this.cameraPhi) * Math.sin(this.cameraTheta)
      );
      probe.lookAt(0, 0, 0);
      probe.updateMatrixWorld(true);

      let extent = 0;
      for (const c of corners) {
        const v = c.clone().project(probe);
        extent = Math.max(extent, Math.abs(v.x), Math.abs(v.y));
      }
      if (!isFinite(extent) || extent <= 0) break;
      dist = _clamp(dist * extent * margin, 6, 90);
      if (Math.abs(extent * margin - 1) < 0.005) break;
    }
    return dist;
  }

  setZoomRatio(ratio) {
    this.zoomRatio = _clamp(ratio, 0.35, 2.0);
    this.cameraDistance = _clamp(
      this.fitDistance * this.zoomRatio,
      this.minDistance,
      this.maxDistance
    );
    this.updateCameraPosition();
  }

  updateCameraPosition() {
    this.camera.position.x = this.cameraDistance * Math.sin(this.cameraPhi) * Math.cos(this.cameraTheta);
    this.camera.position.y = this.cameraDistance * Math.cos(this.cameraPhi);
    this.camera.position.z = this.cameraDistance * Math.sin(this.cameraPhi) * Math.sin(this.cameraTheta);
    this.camera.lookAt(0, 0, 0);
  }

  /* ─── Board & pieces ─────────────────────────────────────────── */

  createBoard() {
    const boardGeometry = new THREE.BoxGeometry(8.5, 0.3, 8.5);
    const boardMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1510, roughness: 0.8 });
    const boardBase = new THREE.Mesh(boardGeometry, boardMaterial);
    boardBase.position.y = -0.3;
    boardBase.receiveShadow = true;
    this.boardGroup.add(boardBase);

    for (let row = 0; row < 8; row++) {
      this.board[row] = [];
      for (let col = 0; col < 8; col++) {
        const isWhite = (row + col) % 2 === 0;
        const geometry = new THREE.BoxGeometry(0.95, 0.15, 0.95);
        const material = new THREE.MeshStandardMaterial({
          color: isWhite ? 0xe8e4dc : 0x6b7c5e,
          roughness: 0.7
        });

        const square = new THREE.Mesh(geometry, material);
        square.position.set(col - BOARD_OFFSET, 0, row - BOARD_OFFSET);
        square.receiveShadow = true;
        square.userData = { row, col, isWhite };

        this.boardGroup.add(square);
        this.board[row][col] = square;
      }
    }
  }

  async loadTextures() {
    window.setPortraitDeck(window.game ? window.game.selectedDeck : 'silicon-valley');

    const names = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
    const loads = [];
    for (const color of ['white', 'black']) {
      this.textures[color] = {};
      for (const name of names) {
        loads.push(
          window.loadPortraitAsTexture(color, name).then(texture => {
            this.textures[color][name] = texture;
          })
        );
      }
    }
    await Promise.all(loads);
  }

  getPieceGeometry(type) {
    if (!this.geometryCache[type]) {
      const profile = PIECE_PROFILES[type] || PIECE_PROFILES['♟'];
      this.geometryCache[type] = new THREE.CylinderGeometry(...profile);
    }
    return this.geometryCache[type];
  }

  getSharedGeometry(key, build) {
    if (!this.geometryCache[key]) this.geometryCache[key] = build();
    return this.geometryCache[key];
  }

  createPieceMesh(type, color, row, col) {
    const bodyColor = color === 'white' ? 0xf5f5f0 : 0x1a1a1a;
    const piece = new THREE.Mesh(
      this.getPieceGeometry(type),
      new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.4, metalness: 0.05 })
    );
    piece.position.set(col - BOARD_OFFSET, 0.4, row - BOARD_OFFSET);
    piece.castShadow = true;
    piece.userData = { type, color, row, col, isPiece: true };

    const base = new THREE.Mesh(
      this.getSharedGeometry('base', () => new THREE.CylinderGeometry(0.38, 0.42, 0.15, 16)),
      new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.4 })
    );
    base.position.y = -0.2;
    base.userData = { isPiece: true, parentPiece: piece };
    piece.add(base);

    const profile = PIECE_PROFILES[type] || PIECE_PROFILES['♟'];
    const portraitGeometry = this.getSharedGeometry(
      `top-${type}`,
      () => new THREE.CircleGeometry(profile[0] * 0.96, 32)
    );
    const portraitMaterial = new THREE.MeshStandardMaterial({
      map: this.textures[color]?.[PIECE_TYPE_NAMES[type]] || null,
      transparent: true,
      roughness: 0.5,
      metalness: 0,
      side: THREE.DoubleSide
    });

    // Face on the flat top of the piece, spun every frame (see animate) so
    // it always reads upright from wherever the camera happens to be.
    const top = new THREE.Mesh(portraitGeometry, portraitMaterial);
    top.rotation.x = -Math.PI / 2;
    top.rotation.z = Math.PI / 2 - this.cameraTheta;
    top.position.y = profile[2] / 2 + 0.006;
    top.userData = { isPiece: true, parentPiece: piece };
    piece.add(top);

    piece.userData.portraits = [top];
    return piece;
  }

  addPiece(type, color, row, col) {
    const piece = this.createPieceMesh(type, color, row, col);
    this.piecesGroup.add(piece);
    this.pieces.push(piece);
    return piece;
  }

  async createPieces() {
    await this.loadTextures();
    if (this.disposed) return;

    const initialSetup = [
      ['♜', '♞', '♝', '♛', '♚', '♝', '♞', '♜'],
      ['♟', '♟', '♟', '♟', '♟', '♟', '♟', '♟'],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      ['♟', '♟', '♟', '♟', '♟', '♟', '♟', '♟'],
      ['♜', '♞', '♝', '♛', '♚', '♝', '♞', '♜']
    ];

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const type = initialSetup[row][col];
        if (!type) continue;
        this.addPiece(type, row < 2 ? 'white' : 'black', row, col);
      }
    }
  }

  // Pawn promotion: swap body geometry and portrait in place.
  setPieceType(row, col, type) {
    const piece = this.getPieceAt(row, col);
    if (!piece || piece.userData.type === type) return;

    piece.userData.type = type;
    piece.geometry = this.getPieceGeometry(type);
    const texture = this.textures[piece.userData.color]?.[PIECE_TYPE_NAMES[type]];
    const profile = PIECE_PROFILES[type] || PIECE_PROFILES['♟'];
    (piece.userData.portraits || []).forEach(p => {
      p.material.map = texture || null;
      p.material.needsUpdate = true;
      p.geometry = this.getSharedGeometry(
        `top-${type}`,
        () => new THREE.CircleGeometry(profile[0] * 0.96, 32)
      );
      p.position.y = profile[2] / 2 + 0.006;
    });
  }

  getPieceAt(row, col) {
    return this.pieces.find(p => p.userData.row === row && p.userData.col === col);
  }

  removePiece(piece) {
    if (!piece) return;
    this.piecesGroup.remove(piece);
    this.pieces = this.pieces.filter(p => p !== piece);
    // Body/portrait geometries are shared and stay in the cache; the
    // per-piece materials are not.
    piece.traverse(obj => {
      if (obj.isMesh && obj.material) obj.material.dispose();
    });
  }

  movePiece(fromRow, fromCol, toRow, toCol, animate = true) {
    const piece = this.getPieceAt(fromRow, fromCol);
    if (!piece) return null;

    const captured = this.getPieceAt(toRow, toCol);
    if (captured && captured !== piece) this.removePiece(captured);

    const targetX = toCol - BOARD_OFFSET;
    const targetZ = toRow - BOARD_OFFSET;

    piece.userData.row = toRow;
    piece.userData.col = toCol;

    if (animate) {
      this.animateMove(piece, targetX, targetZ);
    } else {
      if (piece.userData.moveAnim) piece.userData.moveAnim.cancelled = true;
      piece.position.set(targetX, 0.4, targetZ);
    }

    return captured;
  }

  animateMove(piece, targetX, targetZ) {
    if (piece.userData.moveAnim) piece.userData.moveAnim.cancelled = true;
    const token = { cancelled: false };
    piece.userData.moveAnim = token;

    const startX = piece.position.x;
    const startZ = piece.position.z;
    const peakY = 1.5;
    const duration = 380;
    const startTime = performance.now();

    const step = (now) => {
      if (token.cancelled || this.disposed) return;
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      piece.position.x = startX + (targetX - startX) * eased;
      piece.position.z = startZ + (targetZ - startZ) * eased;
      piece.position.y = 0.4 + Math.sin(progress * Math.PI) * (peakY - 0.4);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        piece.position.set(targetX, 0.4, targetZ);
        piece.userData.moveAnim = null;
      }
    };

    requestAnimationFrame(step);
  }

  /* ─── Highlights ─────────────────────────────────────────────── */

  disposeMeshes(list) {
    list.forEach(mesh => {
      this.moveIndicatorGroup.remove(mesh);
      mesh.material.dispose();
    });
    list.length = 0;
  }

  highlightSquare(row, col, color = 0x00ff00) {
    const square = this.board[row]?.[col];
    if (!square) return;

    const mesh = new THREE.Mesh(
      this.getSharedGeometry('hl', () => new THREE.BoxGeometry(0.95, 0.2, 0.95)),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 })
    );
    mesh.position.copy(square.position);
    mesh.position.y = 0.08;
    this.moveIndicatorGroup.add(mesh);
    this.lastMoveMeshes.push(mesh);
  }

  clearHighlights() {
    this.disposeMeshes(this.lastMoveMeshes);
  }

  showSelectedSquare(row, col) {
    this.clearSelectedSquare();
    const square = this.board[row]?.[col];
    if (!square) return;

    const ring = new THREE.Mesh(
      this.getSharedGeometry('selRing', () => new THREE.RingGeometry(0.40, 0.49, 40)),
      new THREE.MeshBasicMaterial({
        color: 0xffd166, transparent: true, opacity: 0.95, side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(square.position);
    ring.position.y = 0.095;
    ring.userData.isSelectionRing = true;
    this.moveIndicatorGroup.add(ring);
    this.selectionMeshes.push(ring);
  }

  clearSelectedSquare() {
    this.disposeMeshes(this.selectionMeshes);
  }

  showValidMoves(moves) {
    this.clearValidMoves();

    moves.forEach(([row, col]) => {
      const square = this.board[row]?.[col];
      if (!square) return;

      const isCapture = !!this.getPieceAt(row, col);
      let mesh;
      if (isCapture) {
        // A ring around the square reads clearly even under a fingertip.
        mesh = new THREE.Mesh(
          this.getSharedGeometry('capRing', () => new THREE.RingGeometry(0.34, 0.47, 32)),
          new THREE.MeshBasicMaterial({
            color: 0xff5a5f, transparent: true, opacity: 0.85, side: THREE.DoubleSide
          })
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.copy(square.position);
        mesh.position.y = 0.09;
      } else {
        mesh = new THREE.Mesh(
          this.getSharedGeometry('moveDot', () => new THREE.SphereGeometry(0.16, 16, 16)),
          new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.75 })
        );
        mesh.position.copy(square.position);
        mesh.position.y = 0.22;
        mesh.userData.pulse = true;
      }
      this.moveIndicatorGroup.add(mesh);
      this.validMoveMeshes.push(mesh);
    });
  }

  clearValidMoves() {
    this.disposeMeshes(this.validMoveMeshes);
    this.clearSelectedSquare();
  }

  /* ─── Input ──────────────────────────────────────────────────── */

  // One unified Pointer Events pipeline for mouse, pen and touch. The old
  // code ran pointer* and touch* handlers side by side, so every tap was
  // dispatched twice (select then immediately deselect) and mobile felt dead.
  setupEventListeners() {
    this.abort = new AbortController();
    const signal = this.abort.signal;

    this.canvas.addEventListener('pointerdown', e => this.onPointerDown(e), { signal });
    this.canvas.addEventListener('pointermove', e => this.onPointerMove(e), { signal });
    this.canvas.addEventListener('pointerup', e => this.onPointerUp(e), { signal });
    this.canvas.addEventListener('pointercancel', e => this.onPointerCancel(e), { signal });
    this.canvas.addEventListener('lostpointercapture', e => this.onPointerCancel(e), { signal });
    this.canvas.addEventListener('wheel', e => this.onWheel(e), { passive: false, signal });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault(), { signal });
    // Safari <13 gesture events would otherwise zoom the page on pinch.
    this.canvas.addEventListener('gesturestart', e => e.preventDefault(), { signal });

    const onViewportChange = () => this.resize();
    window.addEventListener('resize', onViewportChange, { signal });
    window.addEventListener('orientationchange', onViewportChange, { signal });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onViewportChange, { signal });
    }
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(onViewportChange);
      this.resizeObserver.observe(this.canvas.parentElement || this.canvas);
    }
  }

  tapSlop(pointerType) {
    return pointerType === 'mouse' ? 5 : 14;
  }

  onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    // Audio contexts can only start inside a user gesture on mobile.
    window.chessSounds?.unlock?.();

    try { this.canvas.setPointerCapture(event.pointerId); } catch (e) { /* not fatal */ }

    this.activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      startTime: performance.now(),
      pointerType: event.pointerType,
      moved: false
    });

    if (this.activePointers.size === 2) {
      const [a, b] = [...this.activePointers.values()];
      this.pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchStartZoom = this.zoomRatio;
      // A two-finger gesture is never a tap.
      this.activePointers.forEach(p => { p.moved = true; });
    }
  }

  onPointerMove(event) {
    const p = this.activePointers.get(event.pointerId);
    if (!p) return;

    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    p.x = event.clientX;
    p.y = event.clientY;

    const travelled = Math.hypot(event.clientX - p.startX, event.clientY - p.startY);
    if (travelled > this.tapSlop(p.pointerType)) p.moved = true;

    if (this.activePointers.size >= 2) {
      const [a, b] = [...this.activePointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchStartDist > 0 && dist > 0) {
        this.setZoomRatio(this.pinchStartZoom * (this.pinchStartDist / dist));
      }
      return;
    }

    // Hold off rotating until the slop is exceeded, so a tap never nudges
    // the camera (fingers always drift a pixel or two).
    if (!p.moved) return;

    this.cameraTheta -= dx * 0.006;
    this.cameraPhi = _clamp(this.cameraPhi - dy * 0.006, this.minPhi, this.maxPhi);
    this.userAdjustedPhi = true;
    this.updateCameraPosition();
  }

  onPointerUp(event) {
    const p = this.activePointers.get(event.pointerId);
    this.releasePointer(event.pointerId);
    if (!p) return;

    const travelled = Math.hypot(event.clientX - p.startX, event.clientY - p.startY);
    const elapsed = performance.now() - p.startTime;

    if (!p.moved && travelled <= this.tapSlop(p.pointerType) && elapsed < 800) {
      this.handleTap(event.clientX, event.clientY);
    }
  }

  onPointerCancel(event) {
    this.releasePointer(event.pointerId);
  }

  releasePointer(pointerId) {
    this.activePointers.delete(pointerId);
    if (this.activePointers.size < 2) {
      this.pinchStartDist = null;
      this.pinchStartZoom = null;
    }
    try {
      if (this.canvas.hasPointerCapture?.(pointerId)) {
        this.canvas.releasePointerCapture(pointerId);
      }
    } catch (e) { /* already released */ }
  }

  onWheel(event) {
    event.preventDefault();
    this.setZoomRatio(this.zoomRatio * (1 + event.deltaY * 0.0012));
  }

  handleTap(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const game = window.game;
    if (!game) return;

    const hits = this.raycaster.intersectObjects(
      [...this.pieces, ...this.boardGroup.children], true
    );

    let hit = hits.length ? hits[0].object : null;
    if (hit && hit.userData.parentPiece) hit = hit.userData.parentPiece;

    if (hit && hit.userData.isPiece) {
      game.selectPiece(hit);
      return;
    }
    if (hit && hit.userData.row !== undefined) {
      game.handleSquareClick(hit.userData.row, hit.userData.col);
      return;
    }

    // Nothing precise was hit (edge of a square, the board rim, a fingertip
    // slightly off target): snap to the nearest square on the board plane.
    const point = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, point)) {
      const col = Math.round(point.x + BOARD_OFFSET);
      const row = Math.round(point.z + BOARD_OFFSET);
      if (row >= 0 && row < 8 && col >= 0 && col < 8) {
        const piece = this.getPieceAt(row, col);
        if (piece) game.selectPiece(piece);
        else game.handleSquareClick(row, col);
        return;
      }
    }

    game.handleTapOutside();
  }

  /* ─── View controls ──────────────────────────────────────────── */

  rotateBoard() {
    this.animateTheta(this.cameraTheta + Math.PI);
  }

  // Put the camera behind the given colour's back rank.
  faceSide(color, animate = true) {
    const target = color === 'black' ? Math.PI / 2 : -Math.PI / 2;
    // Take the shortest way round from wherever we are now.
    const turns = Math.round((this.cameraTheta - target) / (Math.PI * 2));
    const goal = target + turns * Math.PI * 2;
    if (animate) this.animateTheta(goal);
    else { this.cameraTheta = goal; this.updateCameraPosition(); }
  }

  animateTheta(target) {
    this.thetaTarget = target;
    if (this.thetaAnimating) return;
    this.thetaAnimating = true;

    const step = () => {
      if (this.disposed) { this.thetaAnimating = false; return; }
      const diff = this.thetaTarget - this.cameraTheta;
      if (Math.abs(diff) > 0.004) {
        this.cameraTheta += diff * 0.14;
        this.updateCameraPosition();
        requestAnimationFrame(step);
      } else {
        this.cameraTheta = this.thetaTarget;
        this.updateCameraPosition();
        this.thetaAnimating = false;
      }
    };
    requestAnimationFrame(step);
  }

  resetView() {
    this.userAdjustedPhi = false;
    this.zoomRatio = 1;
    this.resize(true);
  }

  /* ─── Loop / teardown ────────────────────────────────────────── */

  animate() {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(() => this.animate());

    if (document.hidden) return;

    const t = performance.now() * 0.005;
    this.validMoveMeshes.forEach((mesh, i) => {
      if (mesh.userData.pulse) mesh.scale.setScalar(1 + Math.sin(t + i) * 0.12);
    });
    this.selectionMeshes.forEach(mesh => {
      mesh.material.opacity = 0.65 + Math.sin(t * 1.4) * 0.3;
    });

    const portraitYaw = Math.PI / 2 - this.cameraTheta;
    for (const piece of this.pieces) {
      const portraits = piece.userData.portraits;
      if (portraits) for (const p of portraits) p.rotation.z = portraitYaw;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.abort?.abort();
    this.resizeObserver?.disconnect();

    this.scene.traverse(obj => {
      if (!obj.isMesh) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(m => m?.dispose());
    });
    Object.values(this.geometryCache).forEach(g => g.dispose());
    this.boardGroup.traverse(obj => { if (obj.isMesh) obj.geometry?.dispose(); });
    Object.values(this.textures).forEach(byName =>
      Object.values(byName).forEach(t => t?.dispose())
    );

    this.pieces = [];
    // The renderer and its WebGL context intentionally stay alive: they are
    // shared across games, so a new game never needs a fresh context.
  }
}
