const BOARD_THEMES = {
  'silicon-valley': {
    name: 'Silicon Circuit',
    stage: 'assets/boards/silicon-circuit.jpg',
    squareLight: 0xc7f2e8,
    squareDark: 0x163c36,
    base: 0x071311,
    background: 0x04100e,
    fog: 0x04100e,
    floor: 0x0b211d,
    ambient: 0xc8fff5,
    ambientIntensity: 0.65,
    directional: 0xeafffb,
    directionalIntensity: 0.95,
    point: 0x26e3bd,
    pointIntensity: 0.65,
    accent: 0x38f2cf,
    roughness: 0.68
  },
  politicians: {
    name: 'Marble Hall',
    stage: 'assets/boards/world-leaders-marble.jpg',
    squareLight: 0xe8e1d3,
    squareDark: 0x59645a,
    base: 0x1d1b18,
    background: 0x0d0d0c,
    fog: 0x111110,
    floor: 0x211d18,
    ambient: 0xfff4dc,
    ambientIntensity: 0.62,
    directional: 0xffffff,
    directionalIntensity: 0.9,
    point: 0xd6b46a,
    pointIntensity: 0.55,
    accent: 0xd8b96e,
    roughness: 0.72
  },
  actors: {
    name: 'Red Carpet Arena',
    stage: 'assets/boards/hollywood-red-fabric.jpg',
    squareLight: 0xf2d8d2,
    squareDark: 0x651f2a,
    base: 0x170b0d,
    background: 0x0c0708,
    fog: 0x100809,
    floor: 0x260e12,
    ambient: 0xffd9d2,
    ambientIntensity: 0.64,
    directional: 0xfff0ec,
    directionalIntensity: 0.92,
    point: 0xff5b6a,
    pointIntensity: 0.62,
    accent: 0xff5268,
    roughness: 0.7
  },
  musicians: {
    name: 'Neon Concert',
    stage: 'assets/boards/music-stage.jpg',
    squareLight: 0xd8dcf7,
    squareDark: 0x29244f,
    base: 0x0b0b16,
    background: 0x070711,
    fog: 0x090914,
    floor: 0x11101f,
    ambient: 0xd9dcff,
    ambientIntensity: 0.66,
    directional: 0xf2f3ff,
    directionalIntensity: 0.9,
    point: 0x8f6bff,
    pointIntensity: 0.72,
    accent: 0xa78bfa,
    roughness: 0.66
  }
};

function getBoardTheme(deckId) {
  return BOARD_THEMES[deckId] || BOARD_THEMES['silicon-valley'];
}

if (typeof module !== 'undefined') module.exports = { BOARD_THEMES, getBoardTheme };
