let currentDeckId = 'silicon-valley';

function setPortraitDeck(deckId) {
  currentDeckId = deckId;
}

function getPortraitUrl(color, pieceType) {
  const typeMap = {
    '♚': 'king', '♛': 'queen', '♜': 'rook', '♝': 'bishop', '♞': 'knight', '♟': 'pawn',
    'king': 'king', 'queen': 'queen', 'rook': 'rook', 'bishop': 'bishop', 'knight': 'knight', 'pawn': 'pawn'
  };
  const key = typeMap[pieceType] || 'pawn';
  return `assets/portraits/${currentDeckId}/${key}-${color}.jpg`;
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function createFallbackTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color === 'white' ? '#f5f5f0' : '#1a1a1a';
  ctx.beginPath();
  ctx.arc(128, 128, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color === 'white' ? '#333' : '#ddd';
  ctx.font = '100px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♟', 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function makePortraitTexture(img, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(128, 128, 128, 0, Math.PI * 2);
  ctx.clip();
  const size = Math.min(img.width, img.height);
  const sx = (img.width - size) / 2;
  const sy = (img.height - size) / 2;
  ctx.drawImage(img, sx, sy, size, size, 0, 0, 256, 256);
  const gradient = ctx.createRadialGradient(128, 128, 100, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

async function loadPortraitAsTexture(color, pieceType) {
  const url = getPortraitUrl(color, pieceType);
  const img = await loadImage(url);
  if (img) {
    try { return makePortraitTexture(img, color); } catch(e) { /* fall through */ }
  }
  return createFallbackTexture(color);
}

window.setPortraitDeck = setPortraitDeck;
window.loadPortraitAsTexture = loadPortraitAsTexture;