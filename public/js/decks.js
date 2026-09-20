const DECKS = {
  'silicon-valley': {
    name: 'Silicon Valley',
    icon: '💻',
    white: {
      king: { name: 'Elon Musk', image: 'silicon-valley/king-white.jpg' },
      queen: { name: 'Jensen Huang', image: 'silicon-valley/queen-white.jpg' },
      rook: { name: 'Sundar Pichai', image: 'silicon-valley/rook-white.jpg' },
      bishop: { name: 'Mark Zuckerberg', image: 'silicon-valley/bishop-white.jpg' },
      knight: { name: 'Jeff Bezos', image: 'silicon-valley/knight-white.jpg' },
      pawn: { name: 'Tech Employee', image: 'silicon-valley/pawn-white.jpg' }
    },
    black: {
      king: { name: 'Bill Gates', image: 'silicon-valley/king-black.jpg' },
      queen: { name: 'Lisa Su', image: 'silicon-valley/queen-black.jpg' },
      rook: { name: 'Satya Nadella', image: 'silicon-valley/rook-black.jpg' },
      bishop: { name: 'Tim Cook', image: 'silicon-valley/bishop-black.jpg' },
      knight: { name: 'Larry Page', image: 'silicon-valley/knight-black.jpg' },
      pawn: { name: 'Tech Intern', image: 'silicon-valley/pawn-black.jpg' }
    }
  },
  'politicians': {
    name: 'World Leaders',
    icon: '🏛️',
    white: {
      king: { name: 'Barack Obama', image: 'politicians/king-white.jpg' },
      queen: { name: 'Kamala Harris', image: 'politicians/queen-white.jpg' },
      rook: { name: 'Joe Biden', image: 'politicians/rook-white.jpg' },
      bishop: { name: 'Hillary Clinton', image: 'politicians/bishop-white.jpg' },
      knight: { name: 'Bernie Sanders', image: 'politicians/knight-white.jpg' },
      pawn: { name: 'Senator', image: 'politicians/pawn-white.jpg' }
    },
    black: {
      king: { name: 'Donald Trump', image: 'politicians/king-black.jpg' },
      queen: { name: 'Vladimir Putin', image: 'politicians/queen-black.jpg' },
      rook: { name: 'Emmanuel Macron', image: 'politicians/rook-black.jpg' },
      bishop: { name: 'Angela Merkel', image: 'politicians/bishop-black.jpg' },
      knight: { name: 'Xi Jinping', image: 'politicians/knight-black.jpg' },
      pawn: { name: 'Diplomat', image: 'politicians/pawn-black.jpg' }
    }
  },
  'actors': {
    name: 'Hollywood Stars',
    icon: '🎬',
    white: {
      king: { name: 'Tom Cruise', image: 'actors/king-white.jpg' },
      queen: { name: 'Scarlett Johansson', image: 'actors/queen-white.jpg' },
      rook: { name: 'Denzel Washington', image: 'actors/rook-white.jpg' },
      bishop: { name: 'Meryl Streep', image: 'actors/bishop-white.jpg' },
      knight: { name: 'Morgan Freeman', image: 'actors/knight-white.jpg' },
      pawn: { name: 'Stunt Double', image: 'actors/pawn-white.jpg' }
    },
    black: {
      king: { name: 'Jackie Chan', image: 'actors/king-black.jpg' },
      queen: { name: 'Gal Gadot', image: 'actors/queen-black.jpg' },
      rook: { name: 'Keanu Reeves', image: 'actors/rook-black.jpg' },
      bishop: { name: 'Cate Blanchett', image: 'actors/bishop-black.jpg' },
      knight: { name: 'Jet Li', image: 'actors/knight-black.jpg' },
      pawn: { name: 'Extra', image: 'actors/pawn-black.jpg' }
    }
  },
  'musicians': {
    name: 'Music Legends',
    icon: '🎵',
    white: {
      king: { name: 'Taylor Swift', image: 'musicians/king-white.jpg' },
      queen: { name: 'Beyoncé', image: 'musicians/queen-white.jpg' },
      rook: { name: 'Ed Sheeran', image: 'musicians/rook-white.jpg' },
      bishop: { name: 'Adele', image: 'musicians/bishop-white.jpg' },
      knight: { name: 'Drake', image: 'musicians/knight-white.jpg' },
      pawn: { name: 'Roadie', image: 'musicians/pawn-white.jpg' }
    },
    black: {
      king: { name: 'BTS', image: 'musicians/king-black.jpg' },
      queen: { name: 'Rihanna', image: 'musicians/queen-black.jpg' },
      rook: { name: 'Bad Bunny', image: 'musicians/rook-black.jpg' },
      bishop: { name: 'Shakira', image: 'musicians/bishop-black.jpg' },
      knight: { name: 'The Weeknd', image: 'musicians/knight-black.jpg' },
      pawn: { name: 'DJ', image: 'musicians/pawn-black.jpg' }
    }
  }
};

function getDeck(deckId) {
  return Object.prototype.hasOwnProperty.call(DECKS, deckId)
    ? DECKS[deckId]
    : DECKS['silicon-valley'];
}

function getPieceInfo(deckId, color, pieceType) {
  const deck = getDeck(deckId);
  const typeMap = { '♚': 'king', '♛': 'queen', '♜': 'rook', '♝': 'bishop', '♞': 'knight', '♟': 'pawn' };
  const key = typeMap[pieceType] || 'pawn';
  return deck[color][key];
}

if (typeof module !== 'undefined') module.exports = { DECKS, getDeck, getPieceInfo };