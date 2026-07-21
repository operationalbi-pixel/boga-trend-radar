import { normalizeText, titleCase } from "./utils.js";

const STOP_WORDS = new Set([
  "yang", "dan", "dengan", "untuk", "dari", "ini", "itu", "di", "ke", "pada", "ala", "versi",
  "cara", "bikin", "buat", "membuat", "resep", "review", "cobain", "coba", "enak", "banget", "simple",
  "mudah", "cepat", "terbaru", "viral", "trending", "trend", "fyp", "shorts", "short", "video", "indonesia",
  "jakarta", "tiktok", "youtube", "food", "makanan", "minuman", "jajanan", "dessert", "recipe", "how", "to",
  "the", "a", "an", "of", "and", "with", "new", "best", "most", "try", "trying", "taste", "tasting",
  "asmr", "mukbang", "street", "homemade", "rumahan", "modal", "jualan", "ide", "menu", "kekinian",
  "wajib", "dicoba", "coba", "cicip", "cicipin", "recommended", "favorit", "favorite",
  "2024", "2025", "2026", "2027", "part", "episode", "ep", "vs"
]);

const GENERIC_ONLY = new Set([
  "viral", "food", "makanan", "minuman", "jajanan", "dessert", "pastry", "cake", "resep", "recipe", "menu"
]);

const TAXONOMY = {
  Dessert: ["dessert", "tiramisu", "pudding", "puding", "parfait", "gelato", "ice cream", "es krim", "mousse", "creme brulee", "kunafa", "knafeh", "panna cotta", "dessert cup", "dessert box", "parfait cup", "trifle", "jar dessert", "cup"],
  Pastry: ["croissant", "danish", "pastry", "pain au chocolat", "cruffin", "kouign amann", "cromboloni", "crookie", "puff", "flan"],
  Cake: ["cake", "cheesecake", "bolu", "brownies", "brownie", "layer cake", "roll cake", "chiffon", "sponge cake", "opera cake"],
  Beverage: ["coffee", "kopi", "latte", "matcha", "tea", "teh", "mocktail", "smoothie", "milkshake", "soda", "boba", "lemonade", "juice", "jus"],
  Cookie: ["cookie", "cookies", "biscuit", "biskuit", "soft cookie", "chewy cookie"],
  Bread: ["bread", "roti", "bagel", "sourdough", "toast", "brioche", "focaccia", "bun"],
  Snack: ["snack", "keripik", "chips", "gorengan", "martabak", "cireng", "cimol", "dimsum", "takoyaki", "corndog", "corn dog"],
  MainCourse: ["rice", "nasi", "noodle", "mie", "ramen", "pasta", "pizza", "burger", "steak", "chicken", "ayam", "beef", "sapi", "salmon", "sushi", "udon", "curry", "kari"],
  Ingredient: ["pistachio", "matcha", "ube", "taro", "strawberry", "stroberi", "mango", "mangga", "chocolate", "cokelat", "cheese", "keju", "salted egg", "truffle", "biscoff", "lotus", "mochi", "kunafa", "vanilla", "caramel", "karamel"],
};

const FOOD_TERMS = new Set(Object.values(TAXONOMY).flatMap((items) => items.flatMap((item) => item.split(" "))));
const MULTIWORD_TERMS = Object.values(TAXONOMY).flat().filter((item) => item.includes(" "));

export function isFoodText(value = "") {
  const text = ` ${normalizeText(value)} `;
  if (!text.trim()) return false;
  return Object.values(TAXONOMY).some((terms) => terms.some((term) => text.includes(` ${normalizeText(term)} `)))
    || /\b(food|makanan|minuman|kuliner|resep|dessert|pastry|cake|snack|jajanan|bakery|restaurant|cafe)\b/.test(text);
}

export function classifyFood(value = "") {
  const text = ` ${normalizeText(value)} `;
  let best = { category: "Other", score: 0 };
  for (const [category, terms] of Object.entries(TAXONOMY)) {
    const score = terms.reduce((total, term) => total + (text.includes(` ${normalizeText(term)} `) ? term.split(" ").length : 0), 0);
    if (score > best.score) best = { category, score };
  }
  if (best.category === "Ingredient") {
    for (const category of ["Dessert", "Pastry", "Cake", "Beverage", "Cookie", "Bread", "Snack", "MainCourse"]) {
      if (TAXONOMY[category].some((term) => text.includes(` ${normalizeText(term)} `))) return category;
    }
  }
  return best.category;
}

function tokenIsMeaningful(token) {
  return token.length >= 2 && !STOP_WORDS.has(token) && !/^\d+$/.test(token);
}

function candidateScore(tokens) {
  const foodHits = tokens.filter((token) => FOOD_TERMS.has(token)).length;
  const genericHits = tokens.filter((token) => GENERIC_ONLY.has(token)).length;
  const unique = new Set(tokens).size;
  return foodHits * 8 + unique * 2 - genericHits * 5 - Math.abs(tokens.length - 3);
}

export function extractFoodCandidates(title = "") {
  const normalized = normalizeText(title);
  if (!isFoodText(normalized)) return [];

  const segments = normalized
    .split(/\b(?:review|resep|recipe|cara|how to|asmr|mukbang|shorts?)\b|[|/:;-]+/g)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const candidates = [];
  for (const segment of segments) {
    const tokens = segment.split(" ").filter(tokenIsMeaningful);
    if (!tokens.length) continue;

    const compact = tokens.slice(0, 6);
    if (compact.length >= 2 && compact.some((token) => FOOD_TERMS.has(token))) {
      candidates.push(compact);
    }

    for (let size = 2; size <= Math.min(5, tokens.length); size += 1) {
      for (let index = 0; index <= tokens.length - size; index += 1) {
        const window = tokens.slice(index, index + size);
        const phrase = window.join(" ");
        const hasFood = window.some((token) => FOOD_TERMS.has(token)) || MULTIWORD_TERMS.some((term) => phrase.includes(term));
        if (hasFood) candidates.push(window);
      }
    }
  }

  const unique = new Map();
  for (const tokens of candidates) {
    const cleaned = tokens.filter(tokenIsMeaningful);
    if (cleaned.length < 2 || cleaned.length > 6) continue;
    if (cleaned.every((token) => GENERIC_ONLY.has(token))) continue;
    const key = cleaned.join(" ");
    const score = candidateScore(cleaned);
    if (!unique.has(key) || score > unique.get(key).score) unique.set(key, { key, score });
  }

  const sorted = [...unique.values()].sort((a, b) => b.score - a.score || a.key.length - b.key.length);
  const selected = [];
  for (const item of sorted) {
    const nested = selected.some((existing) => existing.key.includes(item.key) || item.key.includes(existing.key));
    if (nested) continue;
    selected.push(item);
    if (selected.length >= 2) break;
  }

  return selected.map((item) => ({
    name: titleCase(item.key),
    category: classifyFood(item.key),
    confidence: Math.min(100, Math.max(30, item.score * 4)),
  }));
}

export const FOOD_TAXONOMY = TAXONOMY;
