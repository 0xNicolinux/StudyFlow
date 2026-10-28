// Copia o worker do pdfjs para public/ (mesma versão instalada), para ser servido e cacheado offline.
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public", { recursive: true });
copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
console.log("pdf.worker.min.mjs sincronizado");
