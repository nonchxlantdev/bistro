import sharp from "sharp";

/** Original code-drawn illustrations, explicitly labeled; no borrowed food photos. */
export async function demoArtwork(kind: "coffee" | "burger" | "tart") {
  const drawings = {
    coffee: '<ellipse cx="300" cy="345" rx="145" ry="22" fill="#C5A477"/><path d="M190 185h200v70a100 100 0 0 1-200 0z" fill="#FFFDF8" stroke="#49362B" stroke-width="8"/><path d="M390 205h28a35 35 0 0 1 0 70h-32" fill="none" stroke="#49362B" stroke-width="12"/><ellipse cx="290" cy="185" rx="100" ry="23" fill="#49362B"/><path d="M265 185q25-32 50 0q-25 26-50 0" fill="#F5F0E7"/><path d="M245 95q-15 20 0 40m45-60q-15 20 0 40m45-20q-15 20 0 40" fill="none" stroke="#777D5B" stroke-width="7" stroke-linecap="round"/>',
    burger: '<ellipse cx="300" cy="360" rx="174" ry="20" fill="#C5A477"/><path d="M155 220a145 115 0 0 1 290 0z" fill="#D6A568" stroke="#49362B" stroke-width="7"/><path d="M155 242l38-15 38 15 38-15 38 15 38-15 38 15 38-15 24 15" fill="none" stroke="#777D5B" stroke-width="18"/><rect x="155" y="263" width="290" height="38" rx="15" fill="#49362B"/><path d="M175 256h250l-50 35-55-18-65 18z" fill="#C5A477"/><path d="M155 316h290q-5 38-40 38H195q-35 0-40-38" fill="#D6A568" stroke="#49362B" stroke-width="7"/><g fill="#FFFDF8"><ellipse cx="240" cy="155" rx="5" ry="9"/><ellipse cx="300" cy="137" rx="5" ry="9"/><ellipse cx="360" cy="155" rx="5" ry="9"/></g>',
    tart: '<ellipse cx="300" cy="350" rx="160" ry="22" fill="#C5A477"/><path d="M165 230l25 90h220l25-90" fill="#C5A477" stroke="#49362B" stroke-width="8"/><ellipse cx="300" cy="230" rx="135" ry="48" fill="#49362B" stroke="#B76D50" stroke-width="10"/><path d="M230 220q70-50 140 0m-120 18q50-30 100 0" fill="none" stroke="#FFFDF8" stroke-width="5"/><path d="M300 185q-15-35 10-48q25 22-10 48" fill="#777D5B"/><circle cx="290" cy="187" r="16" fill="#B76D50"/>',
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450" viewBox="0 0 600 450"><rect width="600" height="450" fill="#EDE4D5"/>${drawings[kind]}<text x="300" y="415" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#72665C" letter-spacing="2">DEMO ILLUSTRATION</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
