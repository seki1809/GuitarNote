// Equal‑temperament (A4 = 440 Hz)
const NOTE_TABLE = [];
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

for (let midi = 40; midi <= 88; midi++) {      // E2 (low‑E open) .. E6
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const name = NOTE_NAMES[midi % 12] + Math.floor(midi / 12 - 1);
  NOTE_TABLE.push({ midi, name, freq });
}

// Guitar layout (string number ➜ open‑string MIDI note)
const STRINGS = [
  { name: 'low‑E', open: 40 }, // E2
  { name: 'A',     open: 45 }, // A2
  { name: 'D',     open: 50 }, // D3
  { name: 'G',     open: 55 }, // G3
  { name: 'B',     open: 59 }, // B3
  { name: 'high‑E',open: 64 }  // E4
];