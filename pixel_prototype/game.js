import { API_BASE } from "../assets/config.js";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const TILE_SIZE = 40;
const SHEET_TILE = 32;
const VIEW_W = Math.floor(canvas.width / TILE_SIZE);
const VIEW_H = Math.floor(canvas.height / TILE_SIZE);
const WORLD_DEFAULT_W = 56;
const WORLD_DEFAULT_H = 42;
const MOVE_SPEED = 4;
const CURRENT_MODEL = "gpt-4o-mini";
const INSIGHTS_REQUIRED = 2;
const FORCE_DECISION_TURNS = 7;
const DEFAULT_TILE_ORDER = ["floor", "wall", "doorClosed", "doorOpen", "terminal", "altFloor", "liquidOrHazard", "panel"];

// --- LOCALIZATION ---
const LANG = {
  fr: {
    start_game: "COMMENCER LA SIMULATION",
    select_mediator: "CHOISISSEZ VOTRE MÉDIATEUR",
    level: "Niveau",
    objective: "Objectif",
    interact_prompt: "[E] Interagir",
    prompt_talk: "[E] Parler",
    prompt_enter: "[E] Franchir",
    prompt_vote: "[E] Voter",
    prompt_loot: "[E] Récupérer",
    prompt_read: "[E] Lire",
    tutorial_move: "Utilisez ZQSD ou les Flèches pour bouger.",
    tutorial_interact: "Approchez un personnage et appuyez sur E pour discuter.",
    tutorial_chat: "Répondez aux questions pour gagner des points.",
    tutorial_skip: "Passer le tutoriel",
    intro_title: "INTRO NIVEAU",
    intro_continue: "[ESPACE] pour continuer",
    choice_title: "FAITES VOTRE CHOIX",
    choice_waiting: "En attente...",
    game_over: "FIN DE LA SIMULATION",
    thanks: "Merci d'avoir joué.",
  },
  en: {
    start_game: "START SIMULATION",
    select_mediator: "CHOOSE YOUR MEDIATOR",
    level: "Level",
    objective: "Objective",
    interact_prompt: "[E] Interact",
    prompt_talk: "[E] Talk",
    prompt_enter: "[E] Enter",
    prompt_vote: "[E] Vote",
    prompt_loot: "[E] Loot",
    prompt_read: "[E] Read",
    tutorial_move: "Use WASD or Arrows to move.",
    tutorial_interact: "Approach a character and press E to chat.",
    tutorial_chat: "Answer questions to earn points.",
    tutorial_skip: "Skip Tutorial",
    intro_title: "LEVEL INTRO",
    intro_continue: "[SPACE] to continue",
    choice_title: "MAKE YOUR CHOICE",
    choice_waiting: "Waiting...",
    game_over: "SIMULATION ENDED",
    thanks: "Thanks for playing.",
  },
  de: {
    start_game: "SIMULATION STARTEN",
    select_mediator: "WÄHLEN SIE IHREN VERMITTLER",
    level: "Ebene",
    objective: "Ziel",
    interact_prompt: "[E] Interagieren",
    prompt_talk: "[E] Reden",
    prompt_enter: "[E] Eintreten",
    prompt_vote: "[E] Abstimmen",
    prompt_loot: "[E] Plündern",
    prompt_read: "[E] Lesen",
    tutorial_move: "Benutzen Sie WASD oder Pfeile zum Bewegen.",
    tutorial_interact: "Gehen Sie zu einem Charakter und drücken Sie E.",
    tutorial_chat: "Beantworten Sie Fragen, um Punkte zu sammeln.",
    tutorial_skip: "Tutorial überspringen",
    intro_title: "LEVEL EINFÜHRUNG",
    intro_continue: "[LEERTASTE] zum Fortfahren",
    choice_title: "TREFFEN SIE IHRE WAHL",
    choice_waiting: "Warten...",
    game_over: "SIMULATION BEENDET",
    thanks: "Danke fürs Spielen.",
  }
};

const getText = (key) => {
  const lang = state.language || "fr";
  return LANG[lang][key] || key;
};


const uiLevel = document.getElementById("level-id");
const uiDialog = document.getElementById("dialog-box");
const uiDialogName = document.getElementById("dialog-name");
const uiDialogText = document.getElementById("dialog-text");
const uiChoice = document.getElementById("choice-overlay");
const uiChoiceContainer = document.getElementById("choice-container");
const uiPrompt = document.getElementById("interaction-prompt");

let uiChatContainer = null;
let uiChatTarget = null;
let uiChatAvatar = null;
let uiChatLog = null;
let uiChatInput = null;
let uiChatSend = null;
let uiChatHint = null;
let uiChatCollapse = null;
let uiChatMinimized = null;
let uiChatMiniAvatar = null;
let uiObjective = null;
let uiTutorialBox = null;
let uiTutorialStep = null;
let uiTutorialText = null;
let uiTutorialSkip = null;

const state = {
  scenario: null,
  personas: {},
  currentPersonas: {},
  currentSceneId: null,
  levelData: null,
  player: {
    x: 10,
    y: 12,
    pixelX: 10 * TILE_SIZE,
    pixelY: 12 * TILE_SIZE,
    dir: "down",
    isMoving: false,
  },
  entities: [],
  input: { keys: Object.create(null) },
  isLocked: false,
  isChatting: false,
  hasVoted: false,
  pendingDoorTarget: null,
  currentTheme: "nature",
  world: {
    w: WORLD_DEFAULT_W,
    h: WORLD_DEFAULT_H,
    tiles: [],
    deco: [],
    themes: [],
    zoneNames: [],
  },
  camera: {
    x: 0,
    y: 0,
  },
  assets: {},
  stars: [],
  chatSessions: {},
  currentChatTarget: null,
  globalHistory: [],
  chatOpen: false,
  meta: {
    intelPoints: 0,
    fastTrackCharges: 0,
    modules: {
      minimap: false,
    },
  },
  sceneProgress: {
    userTurns: 0,
    insightsCollected: 0,
    insightsRequired: INSIGHTS_REQUIRED,
    forceDecisionTurns: FORCE_DECISION_TURNS,
    loopBreakerIndex: 0,
    lastPlayerInput: "",
  },
  tutorial: {
    active: false,
    completedLevel1: false,
    step: 0,
    movedTiles: 0,
    lastTileX: null,
    lastTileY: null,
    awaitingChatReopen: false,
    flags: {
      npcInteracted: false,
      chatSent: false,
      chatCollapsed: false,
      chatReopenedAfterCollapse: false,
      terminalUsed: false,
      insightUsed: false,
      altarVoted: false,
      doorUsed: false,
    },
  },
  choiceHistory: [], // Track decisions across levels
};

const BASE_SPRITES = {
  player: [
    "   444444   ", "  44444444  ", "  44222244  ", "  42232324  ",
    "  11111111  ", "  11311311  ", "  11111111  ", "  31111113  ",
    "   11  11   ", "   11  11   ", "   11  11   ", "  333  333  ",
  ],
  player_up: [
    "   444444   ", "  44444444  ", "  44444444  ", "  44444444  ",
    "  11111111  ", "  11311311  ", "  11111111  ", "  31111113  ",
    "   11  11   ", "   11  11   ", "   11  11   ", "  333  333  ",
  ],
  player_side: [
    "   444444   ", "  44444444  ", "  44422244  ", "  44232244  ",
    "  11111111  ", "  11311111  ", "  11111111  ", "  31111111  ",
    "   11  11   ", "   11  11   ", "   11  11   ", "  333  333  ",
  ],
  npc: [
    "   444444   ", "  44444444  ", "  22222222  ", "  23222232  ",
    "  11111111  ", "  11133111  ", "  11111111  ", "  11111111  ",
    "   11  11   ", "   11  11   ", "   11  11   ", "  222  222  ",
  ],
  floor: [
    "222222222222", "211111111112", "211111111112", "211111111112",
    "211112211112", "211112211112", "211111111112", "211111111112",
    "211111111112", "211111111112", "211111111112", "222222222222",
  ],
  wall: [
    "222222222222", "333333333333", "111111111111", "113311331111",
    "113311331111", "111111111111", "111133311111", "111111111111",
    "113311331111", "113311331111", "111111111111", "222222222222",
  ],
  computer: [
    "222222222222", "211111111112", "213333333312", "213333333312",
    "213333333312", "211111111112", "222222222222", "211333311112",
    "211333311112", "211111111112", "222222222222", "222222222222",
  ],
  door: [
    "222222222222", "211111111112", "211111111112", "211333333312",
    "211333333312", "211111111112", "211111221112", "211111111112",
    "211111111112", "211111111112", "211111111112", "211111111112",
  ],
};

const TUTORIAL_STEPS = [
  "Deplace-toi (WASD ou fleches) sur au moins 4 cases.",
  "Mets-toi face a un conseiller et appuie sur E pour lancer l'echange.",
  "Reduis la fenetre de chat avec '-' puis rouvre-la via l'icone avatar.",
  "Envoie un message dans le chat (Enter ou bouton Envoyer).",
  "Va au terminal et appuie sur E pour lire le contexte de scene.",
  "Explore la zone et examine au moins 1 module avec E.",
  "Va a l'autel et valide un vote pour deverrouiller la decision.",
  "Rejoins la porte au nord et appuie sur E pour passer au niveau suivant.",
];

function generateSprite(key, colorMap, flip = false) {
  const data = BASE_SPRITES[key] || BASE_SPRITES.player;
  const size = 32;
  const pixel = size / 12;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const cctx = c.getContext("2d");
  if (flip) {
    cctx.translate(size, 0);
    cctx.scale(-1, 1);
  }
  for (let y = 0; y < 12; y += 1) {
    for (let x = 0; x < 12; x += 1) {
      const ch = data[y][x];
      if (ch !== " " && colorMap[ch]) {
        cctx.fillStyle = colorMap[ch];
        cctx.fillRect(x * pixel, y * pixel, pixel, pixel);
      }
    }
  }
  return c;
}


async function loadImage(path) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${path}`));
    img.src = path;
  });
}

function cropTile(sheet, tileIndex, row = 0, wTiles = 1, hTiles = 1) {
  const c = document.createElement("canvas");
  c.width = SHEET_TILE * wTiles;
  c.height = SHEET_TILE * hTiles;
  const cctx = c.getContext("2d");
  cctx.imageSmoothingEnabled = false;
  cctx.drawImage(
    sheet,
    tileIndex * SHEET_TILE,
    row * SHEET_TILE,
    SHEET_TILE * wTiles,
    SHEET_TILE * hTiles,
    0,
    0,
    SHEET_TILE * wTiles,
    SHEET_TILE * hTiles,
  );

  // Auto-Chroma-Key for opaque backgrounds (checkerboard)
  const imgData = cctx.getImageData(0, 0, c.width, c.height);
  const data = imgData.data;

  // Check top-left pixel alpha. If 255, assume it might be a background.
  if (data[3] === 255) {
    const r1 = data[0], g1 = data[1], b1 = data[2];

    // Sample a second point for checkerboard pattern (e.g. 16px offset)
    // Ensure we don't go out of bounds
    const idx2 = (Math.min(16, c.width - 1)) * 4;
    const r2 = data[idx2], g2 = data[idx2 + 1], b2 = data[idx2 + 2];

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // Tolerance for compression artifacts
      const tol = 15;

      // Match color 1
      if (Math.abs(r - r1) < tol && Math.abs(g - g1) < tol && Math.abs(b - b1) < tol) {
        data[i + 3] = 0;
        continue;
      }
      // Match color 2
      if (Math.abs(r - r2) < tol && Math.abs(g - g2) < tol && Math.abs(b - b2) < tol) {
        data[i + 3] = 0;
      }
    }
    cctx.putImageData(imgData, 0, 0);
  }

  return c;
}

function inferThemeFromScene(scene) {
  const txt = safeText(scene?.theme).toLowerCase();
  if (/(forest|foret|nature|eco|riv|village|faune|flore)/.test(txt)) return "nature";
  if (/(cyber|virtual|data|corp|city|urbain|prison|neon|ai)/.test(txt)) return "urbain";
  if (/(lab|medical|hopital|surgery|bio|clinique)/.test(txt)) return "laboratoire";
  if (/(space|mars|luna|orbital|station|cosmo|espace)/.test(txt)) return "espace";
  if (/(vote|government|council|senate|policy|bureau|parliament|state)/.test(txt)) return "bureaucratie";
  const n = parseLevelNumber(scene?.id);
  const fallback = ["nature", "urbain", "laboratoire", "espace", "bureaucratie"];
  return Number.isNaN(n) ? "nature" : fallback[(n - 1) % fallback.length];
}

function tileIndexFromOrder(order, aliases, fallbackIdx) {
  const ord = Array.isArray(order) ? order.map((x) => normalizeText(x)) : [];
  for (const alias of aliases) {
    const idx = ord.indexOf(normalizeText(alias));
    if (idx >= 0) return idx;
  }
  return fallbackIdx;
}

function buildThemeTileSet(theme) {
  const sheet = state.assets.tilesets?.[theme];
  if (!sheet) return null;
  const order = state.assets.tilesetsManifest?.tileOrder || DEFAULT_TILE_ORDER;

  // Helper to safely get a tile or fall back to the main sheet's equivalent if index is out of bounds
  const getTile = (aliases, fallbackIdx) => {
    const idx = tileIndexFromOrder(order, aliases, fallbackIdx);
    // cropTile handles out-of-bounds by returning valid canvas or null, 
    // but we want to ensure we at least try to get *something*
    return cropTile(sheet, idx);
  };

  const set = {
    floor: getTile(["floor"], 0),
    wall: getTile(["wall"], 1),
    door_closed: getTile(["doorClosed", "door_closed", "doorclosed"], 2),
    door_open: getTile(["doorOpen", "door_open", "dooropen"], 3),
    computer: getTile(["terminal", "computer"], 4),
    alt: getTile(["altFloor", "alt_floor", "panel", "alt"], 5),
    liquid: getTile(["liquidOrHazard", "liquid", "hazard"], 6),
    altar: getTile(["panel", "altar", "altFloor"], 7),
  };

  // --- EXTRACT ADVANCED ASSETS ---
  // Theme Rows for sheets: Row 0: Nature, Row 1: Urbain, Row 2: Lab, Row 3: Espace, Row 4: Bureau
  const tStr = safeText(theme).toLowerCase();
  const themeRow = tStr === "nature" ? 0 : tStr === "urbain" ? 1 : tStr === "laboratoire" ? 2 : tStr === "espace" ? 3 : 4;

  // Theme NPCs from spritesheet
  if (state.assets.sheets?.npcs_themes) {
    const npcSheet = state.assets.sheets.npcs_themes;
    set.npc_1 = cropTile(npcSheet, 0, themeRow);
    set.npc_2 = cropTile(npcSheet, 1, themeRow);
    set.npc_3 = cropTile(npcSheet, 2, themeRow);
  }

  // Helper to extract a random variant of a given size
  const extractRandom = (sheet, row, w, h, count) => {
    if (!sheet) return null;
    const variant = Math.floor(rng() * count); // Use seeded rng? No, strict random is fine for variety or use game state seed? 
    // Wait, buildThemeTileSet is called once per reload. 
    // To have variety across the map, we actually need *multiple* assets or the engine to pick randomly?
    // The current engine picks ONE 'building' asset for the entire theme. 
    // To have variety, we'd need to change the engine to support array of assets or "building_1", "building_2".
    // For now, let's just pick ONE random one so at least it differs between reloads/themes.
    // Or better: The prompt asked for "ajuster le découpage", implying we just need the *correct* cut.
    // Let's pick a random one for now.
    return cropTile(sheet, variant * w, row, w, h);
  };

  const buildingSheet = tStr === "nature" ? state.assets.sheets?.buildings_nature :
    tStr === "urbain" ? state.assets.sheets?.buildings_urbain :
      state.assets.sheets?.buildings_espace;

  // Buildings
  if (tStr === "espace" || tStr === "laboratoire") {
    // Use new sliced space buildings
    const bList = state.assets.buildings.space_sliced.filter(img => img !== null);
    if (bList.length > 0) {
      const randomB = bList[Math.floor(rng() * bList.length)];
      // Apply chroma key to individual image (treat as 1x1 tile of size WxH)
      // We must use cropTile to ensure the background is removed
      // But cropTile expects tile index. We can pass the whole image as sheet and use special params?
      // cropTile(sheet, tileIndex, row, w, h)
      // Actually, cropTile calculates coordinates based on TILE_SIZE=32.
      // This is tricky for arbitrary sized images.
      // Let's modify cropTile or create specific 'cleanImage' helper?
      // Re-using cropTile: 
      // If we pass tileIndex=0, row=0, wTiles = image.width/32, hTiles=image.height/32
      // It should work!
      const wTiles = Math.ceil(randomB.width / 32);
      const hTiles = Math.ceil(randomB.height / 32);
      set.building = cropTile(randomB, 0, 0, wTiles, hTiles);
      set.hasBuilding = true;
    }
  } else if (buildingSheet) {
    // Old logic for Nature/Urban (using sheets)
    // Assuming 3x3 buildings at fixed positions for now, or random?
    // Let's just pick one for demo.
    // Nature: (0,0), Urban: (0,0) of specific sheet?
    // The sheets are 640x640.
    // Let's pick a random 3x3 block from the sheet?
    // For now, keep the simple top-left extraction.
    set.building = cropTile(buildingSheet, 0, 0, 3, 3);
    set.hasBuilding = true;
  } else {
    set.building = drawBuilding(theme);
  }

  // Vehicles
  let vList = [];
  if (tStr === "nature") {
    vList = state.assets.vehicles.mixed_sliced.rustic;
  } else if (tStr === "urbain") {
    vList = state.assets.vehicles.mixed_sliced.urban;
  } else { // Space/Lab
    vList = state.assets.vehicles.mixed_sliced.scifi;
  }

  // Fallback to older sheet if list empty or undefined
  if (vList && vList.length > 0) {
    const vImg = vList[Math.floor(rng() * vList.length)];
    if (vImg) {
      const wTiles = Math.ceil(vImg.width / 32);
      const hTiles = Math.ceil(vImg.height / 32);
      set.vehicle = cropTile(vImg, 0, 0, wTiles, hTiles);
      set.hasVehicle = true;
    }
  } else if (state.assets.sheets?.vehicles) {
    // Fallback to original sheet logic
    // Row based on theme?
    const vRow = themeRow;
    set.vehicle = cropTile(state.assets.sheets.vehicles, 0, vRow, 2, 2);
    set.hasVehicle = true;
  } else {
    set.vehicle = drawVehicle(theme);
  }

  // NPCs (Keep using tileset row 4 or specific sheet?)
  // For now, extract from tileset row 4 (generic characters)
  if (sheet) {
    set.npc = cropTile(sheet, 4 + (themeRow % 4), 4, 1, 1); // Arbitrary NPC
    set.hasNPC = true;
  }

  return set;
}

function rebuildThemeTiles() {
  state.assets.themeTiles = {};
  const themes = Object.keys(state.assets.tilesets || {});
  themes.forEach((theme) => {
    const set = buildThemeTileSet(theme);
    if (set) state.assets.themeTiles[theme] = set;
  });
}

function applyThemeAssets(theme) {
  const t = state.assets.tilesets?.[theme] ? theme : "nature";
  const set = state.assets.themeTiles?.[t];
  if (!set) return;
  state.currentTheme = t;
  state.assets.floor = set.floor;
  state.assets.wall = set.wall;
  state.assets.door_closed = set.door_closed;
  state.assets.door_open = set.door_open;
  state.assets.computer = set.computer;
  state.assets.alt = set.alt;
  state.assets.liquid = set.liquid;
  state.assets.altar = set.altar;

  // Props
  if (set.building) state.assets.building = set.building;
  if (set.vehicle) state.assets.vehicle = set.vehicle;

  // Swap NPCs to match theme
  if (set.npc_1) state.assets["A-1"] = set.npc_1;
  if (set.npc_2) state.assets["B-2"] = set.npc_2;
  if (set.npc_3) state.assets["C-3"] = set.npc_3;
  if (set.building) state.assets.building = set.building;
  if (set.vehicle) state.assets.vehicle = set.vehicle;
}

function mapPersonas(list) {
  const map = {};
  for (const p of list || []) {
    if (p?.id) map[String(p.id)] = p;
  }
  return map;
}

function safeText(v) {
  return String(v || "").trim();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function hashStringSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createSeededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function normalizeText(s) {
  return safeText(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s) {
  const tokens = normalizeText(s).split(" ").filter((t) => t.length >= 3);
  return new Set(tokens);
}

function overlapScore(a, b) {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  sa.forEach((t) => {
    if (sb.has(t)) inter += 1;
  });
  return inter / Math.max(sa.size, sb.size);
}

function worldInBounds(x, y) {
  return x >= 0 && x < state.world.w && y >= 0 && y < state.world.h;
}

function createMatrix(w, h, value) {
  return Array.from({ length: h }, () => Array(w).fill(value));
}

function clearRectInMatrix(matrix, x, y, w, h, value = 0) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      if (yy >= 0 && yy < matrix.length && xx >= 0 && xx < matrix[0].length) {
        matrix[yy][xx] = value;
      }
    }
  }
}

function isBlockingEntityAt(x, y) {
  return state.entities.some((e) => !e.removed && e.blocking !== false && e.x === x && e.y === y);
}

function isTileWalkable(x, y) {
  if (!worldInBounds(x, y)) return false;
  if (state.world.tiles[y]?.[x] === 1) return false;
  if (isBlockingEntityAt(x, y)) return false;
  return true;
}

function placeIfWalkable(x, y, fallbackX, fallbackY) {
  const tx = clamp(Math.round(x), 1, state.world.w - 2);
  const ty = clamp(Math.round(y), 1, state.world.h - 2);
  if (state.world.tiles[ty]?.[tx] === 1) state.world.tiles[ty][tx] = 0;
  if (!isBlockingEntityAt(tx, ty)) return { x: tx, y: ty };
  const fx = clamp(Math.round(fallbackX), 1, state.world.w - 2);
  const fy = clamp(Math.round(fallbackY), 1, state.world.h - 2);
  return { x: fx, y: fy };
}

function updateCamera() {
  const worldPxW = state.world.w * TILE_SIZE;
  const worldPxH = state.world.h * TILE_SIZE;
  state.camera.x = clamp(
    state.player.pixelX - (canvas.width / 2) + (TILE_SIZE / 2),
    0,
    Math.max(0, worldPxW - canvas.width),
  );
  state.camera.y = clamp(
    state.player.pixelY - (canvas.height / 2) + (TILE_SIZE / 2),
    0,
    Math.max(0, worldPxH - canvas.height),
  );
}

function scenarioNarrativeText(scene) {
  const n = scene?.narrative || {};
  return [
    safeText(scene?.theme),
    safeText(scene?.title),
    safeText(n.visual_cues),
    safeText(n.context),
    safeText(n.dilemma),
    safeText(n.question),
  ].join(" ");
}

function buildZonePlan(scene, mainTheme) {
  const text = normalizeText(scenarioNarrativeText(scene));
  const hasWind = /(eolien|eolienne|wind|turbine|mine|carrier)/.test(text);
  const hasPort = /(port|quai|harbor|dock|mer|ocean)/.test(text);
  const hasForest = /(foret|forest|sacre|sacree|bois|village)/.test(text);
  const hasLab = /(lab|labo|medical|clinique|hopital|reacteur)/.test(text);

  if (hasWind) {
    return [
      { name: "Place du village", theme: "bureaucratie", rect: [0.05, 0.08, 0.45, 0.36] },
      { name: "Zone portuaire", theme: "urbain", rect: [0.55, 0.08, 0.95, 0.36] },
      { name: "Foret sacree", theme: "nature", rect: [0.05, 0.48, 0.45, 0.9] },
      { name: "Mine d'extraction", theme: "laboratoire", rect: [0.55, 0.48, 0.95, 0.9] },
    ];
  }

  const zones = [];
  zones.push({ name: "Zone civique", theme: mainTheme, rect: [0.08, 0.1, 0.48, 0.42] });
  zones.push({ name: "Couloir logistique", theme: hasPort ? "urbain" : mainTheme, rect: [0.52, 0.1, 0.92, 0.42] });
  zones.push({ name: hasForest ? "Foret vivriere" : "Reserve", theme: hasForest ? "nature" : mainTheme, rect: [0.08, 0.5, 0.48, 0.9] });
  zones.push({ name: hasLab ? "Annexe technique" : "Zone industrielle", theme: hasLab ? "laboratoire" : "urbain", rect: [0.52, 0.5, 0.92, 0.9] });
  return zones;
}

function applyZonesToThemeMap(themeMap, zones, width, height) {
  zones.forEach((zone) => {
    const x0 = Math.floor(zone.rect[0] * width);
    const y0 = Math.floor(zone.rect[1] * height);
    const x1 = Math.floor(zone.rect[2] * width);
    const y1 = Math.floor(zone.rect[3] * height);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (x >= 1 && x < width - 1 && y >= 1 && y < height - 1) themeMap[y][x] = zone.theme;
      }
    }
  });
}

function generateWorld(scene) {
  const w = WORLD_DEFAULT_W;
  const h = WORLD_DEFAULT_H;
  const tiles = createMatrix(w, h, 0);
  const deco = createMatrix(w, h, null);
  const theme = inferThemeFromScene(scene);
  const themes = createMatrix(w, h, theme);
  const zones = buildZonePlan(scene, theme);
  applyZonesToThemeMap(themes, zones, w, h);
  const rng = createSeededRandom(hashStringSeed(`${safeText(scene?.id)}|${theme}`));

  // Draw outer walls
  for (let x = 0; x < w; x += 1) {
    tiles[0][x] = 1;
    tiles[h - 1][x] = 1;
  }
  for (let y = 0; y < h; y += 1) {
    tiles[y][0] = 1;
    tiles[y][w - 1] = 1;
  }

  const spawnX = Math.floor(w / 2);
  const spawnY = Math.floor(h * 0.72);
  const doorX = spawnX;
  const doorY = Math.max(1, spawnY - 14);

  // Clear spawn and path to door
  clearRectInMatrix(tiles, spawnX - 8, spawnY - 7, 17, 14, 0);
  clearRectInMatrix(tiles, doorX - 1, doorY, 3, spawnY - doorY + 2, 0);

  // Helper: draw room boundaries for a zone (walls around edges)
  const drawRoomBoundaries = (zone) => {
    const x0 = Math.floor(zone.rect[0] * w);
    const y0 = Math.floor(zone.rect[1] * h);
    const x1 = Math.floor(zone.rect[2] * w);
    const y1 = Math.floor(zone.rect[3] * h);

    // Draw walls around the zone perimeter (with gaps for doors)
    for (let x = x0; x <= x1; x += 1) {
      if (x >= 1 && x < w - 1 && y0 >= 1 && y0 < h - 1) {
        if (Math.abs(x - (x0 + x1) / 2) > 2) tiles[y0][x] = 1;
      }
      if (x >= 1 && x < w - 1 && y1 >= 1 && y1 < h - 1) {
        if (Math.abs(x - (x0 + x1) / 2) > 2) tiles[y1][x] = 1;
      }
    }
    for (let y = y0; y <= y1; y += 1) {
      if (y >= 1 && y < h - 1 && x0 >= 1 && x0 < w - 1) {
        if (Math.abs(y - (y0 + y1) / 2) > 2) tiles[y][x0] = 1;
      }
      if (y >= 1 && y < h - 1 && x1 >= 1 && x1 < w - 1) {
        if (Math.abs(y - (y0 + y1) / 2) > 2) tiles[y][x1] = 1;
      }
    }
  };

  // Draw room boundaries for each zone
  zones.forEach((zone) => {
    drawRoomBoundaries(zone);
  });

  // Clear spawn area and main path again (after zone walls)
  clearRectInMatrix(tiles, spawnX - 6, spawnY - 5, 13, 10, 0);
  clearRectInMatrix(tiles, doorX - 2, doorY, 5, spawnY - doorY + 2, 0);

  // Add thematic obstacles inside zones
  zones.forEach((zone) => {
    const x0 = Math.floor(zone.rect[0] * w) + 2;
    const y0 = Math.floor(zone.rect[1] * h) + 2;
    const x1 = Math.floor(zone.rect[2] * w) - 2;
    const y1 = Math.floor(zone.rect[3] * h) - 2;
    const zoneW = x1 - x0;
    const zoneH = y1 - y0;
    if (zoneW < 3 || zoneH < 3) return;

    // Add thematic obstacles inside zones
    const obstacleCount = Math.floor(zoneW * zoneH * 0.12);
    for (let i = 0; i < obstacleCount; i += 1) {
      const ox = randomInt(rng, x0, x1);
      const oy = randomInt(rng, y0, y1);
      if (Math.abs(ox - spawnX) < 6 && Math.abs(oy - spawnY) < 5) continue;
      if (Math.abs(ox - doorX) < 3 && oy <= spawnY && oy >= doorY - 1) continue;

      const r = rng();
      if (r < 0.4) {
        tiles[oy][ox] = 1; // Standard wall/obstacle
      } else if (r < 0.6) {
        deco[oy][ox] = "computer";
        tiles[oy][ox] = 1; // Prop blocks movement
      } else if (r < 0.8) {
        deco[oy][ox] = "building";
        tiles[oy][ox] = 1; // Building blocks movement
      } else {
        deco[oy][ox] = "vehicle";
        tiles[oy][ox] = 1; // Vehicle blocks movement
      }
    }

    // Add decorative patches
    const decoCount = Math.floor(zoneW * zoneH * 0.15);
    for (let i = 0; i < decoCount; i += 1) {
      const dx = randomInt(rng, x0, x1);
      const dy = randomInt(rng, y0, y1);
      if (tiles[dy][dx] === 1 || deco[dy][dx]) continue;
      if (Math.abs(dx - spawnX) < 5 && Math.abs(dy - spawnY) < 4) continue;
      deco[dy][dx] = rng() < 0.7 ? "alt" : "liquid";
    }
  });

  // Add scattered decoration outside zones
  const scatterCount = 60;
  for (let i = 0; i < scatterCount; i += 1) {
    const x = randomInt(rng, 2, w - 3);
    const y = randomInt(rng, 2, h - 3);
    if (tiles[y][x] === 1 || deco[y][x]) continue;
    if (Math.abs(x - spawnX) < 5 && Math.abs(y - spawnY) < 4) continue;
    deco[y][x] = rng() < 0.8 ? "alt" : "liquid";
  }

  return { w, h, tiles, deco, themes, zoneNames: zones.map((z) => z.name), zones, spawnX, spawnY, doorX, doorY };
}


function getAdjacentInteractable() {
  const p = state.player;
  const front = p.dir === "up"
    ? { x: p.x, y: p.y - 1 }
    : p.dir === "down"
      ? { x: p.x, y: p.y + 1 }
      : p.dir === "left"
        ? { x: p.x - 1, y: p.y }
        : { x: p.x + 1, y: p.y };
  const neighbors = [
    front,
    { x: p.x, y: p.y - 1 },
    { x: p.x, y: p.y + 1 },
    { x: p.x - 1, y: p.y },
    { x: p.x + 1, y: p.y },
  ];
  return state.entities.find((e) => !e.removed && typeof e.interact === "function"
    && neighbors.some((n) => n.x === e.x && n.y === e.y));
}

function interactionLabel(entity) {
  if (!entity) return getText("interact_prompt");
  if (entity.type === "npc") return getText("prompt_talk");
  if (entity.type === "door") return getText("prompt_enter");
  if (entity.type === "altar") return getText("prompt_vote");
  if (entity.type === "insight") return getText("prompt_loot");
  if (entity.type === "computer") return getText("prompt_read");
  return getText("interact_prompt");
}

function resolveAvatarUrl(raw) {
  const value = safeText(raw);
  if (!value) return "../assets/avatar_architecte.png";
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:")) return value;
  if (value.startsWith("../") || value.startsWith("./")) return value;
  if (value.startsWith("assets/")) return `../${value}`;
  return `../assets/${value}`;
}

function setChatAvatar(url) {
  const safe = resolveAvatarUrl(url);
  if (uiChatAvatar) uiChatAvatar.src = safe;
  if (uiChatMiniAvatar) uiChatMiniAvatar.src = safe;
}

function openChatPanel() {
  state.chatOpen = true;
  if (uiChatContainer) uiChatContainer.classList.remove("collapsed");
  if (uiChatMinimized) uiChatMinimized.classList.add("hidden");
}

function collapseChatPanel() {
  state.chatOpen = false;
  state.isChatting = false;
  if (uiChatInput && document.activeElement === uiChatInput) uiChatInput.blur();
  if (uiChatContainer) uiChatContainer.classList.add("collapsed");
  if (uiChatMinimized) uiChatMinimized.classList.remove("hidden");
  markTutorialEvent("chat_collapse");
}

function parseLevelNumber(sceneId) {
  const m = String(sceneId || "").match(/level_(\d+)/i);
  return m ? Number(m[1]) : NaN;
}

function nextSceneFallback(fromSceneId = state.currentSceneId) {
  const n = parseLevelNumber(fromSceneId);
  if (!Number.isNaN(n)) {
    const candidate = `level_${n + 1}`;
    if (state.scenario?.scenes?.[candidate]) return candidate;
  }
  const keys = Object.keys(state.scenario?.scenes || {});
  if (!keys.length) return null;
  return keys.find((k) => k !== fromSceneId) || keys[0];
}

function saveGame() {
  const saveData = {
    currentSceneId: state.currentSceneId,
    choiceHistory: state.choiceHistory,
    // We could save globalHistory too, but it might get large
    intelPoints: state.meta.intelPoints,
    fastTrackCharges: state.meta.fastTrackCharges,
    tutorialCompleted: state.tutorial.completedLevel1,
  };
  localStorage.setItem("rpg_save", JSON.stringify(saveData));
  console.log("Game Saved:", state.currentSceneId);
}

function loadSavedGame() {
  const raw = localStorage.getItem("rpg_save");
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    state.currentSceneId = data.currentSceneId;
    state.choiceHistory = data.choiceHistory || [];
    state.meta.intelPoints = data.intelPoints || 0;
    state.meta.fastTrackCharges = data.fastTrackCharges || 0;
    state.tutorial.completedLevel1 = !!data.tutorialCompleted;
    return data.currentSceneId;
  } catch (e) {
    console.error("Load error:", e);
    return null;
  }
}

function buildTutorialScene() {
  const nextId = state.scenario?.scenes?.level_2 ? "level_2" : nextSceneFallback("level_1");
  return {
    id: "level_1",
    isTutorialLevel: true,
    theme: "nature",
    narrative: {
      visual_cues: "Zone d'entrainement de l'Observatoire: balises lumineuses, modules tactiques, couloir nord securise.",
      context: "Ici, tu apprends les outils du RPG avant les dilemmes philosophiques des niveaux narratifs.",
    },
    exits: [
      {
        id: "READY",
        description: "Tutoriel valide, passage vers le premier niveau narratif.",
        target: nextId,
      },
    ],
  };
}

function buildTutorialPersonas() {
  const mentor = {
    id: "mentor_guide",
    archetype: "A-1",
    displayName: "Iris Kade (Guide de simulation)",
    name: "Iris Kade",
    role: "Guide",
    bio: "Te forme aux commandes et a la boucle exploration -> argumentation -> decision.",
    avatar: "avatar_sibyl.png",
  };
  const tactician = {
    id: "tech_operateur",
    archetype: "B-2",
    displayName: "Noor Halim (Operateur tactique)",
    name: "Noor Halim",
    role: "Operateur",
    bio: "Explique les modules concrets: minimap, charges de synthese, progression de porte.",
    avatar: "avatar_neo_hacktivist.png",
  };
  ensureSession(mentor.id);
  ensureSession(tactician.id);
  return {
    current: {
      [mentor.id]: mentor,
      [tactician.id]: tactician,
    },
    narratorId: mentor.id,
  };
}

function ensureChatUI() {
  uiChatContainer = document.getElementById("chat-container");
  if (!uiChatContainer) {
    const container = document.createElement("div");
    container.id = "chat-container";
    container.innerHTML = `
      <div id="chat-header">
        <div id="chat-target-wrap">
          <img id="chat-target-avatar" src="../assets/avatar_architecte.png" alt="avatar">
          <div id="chat-target-meta">
            <div id="chat-target">Conseiller</div>
            <div id="chat-target-sub">E dans le champ = texte normal</div>
          </div>
        </div>
        <button id="chat-collapse" type="button" title="Reduire le chat">-</button>
      </div>
      <div id="chat-log"></div>
      <div id="chat-input-row">
        <input type="text" id="chat-input" placeholder="Explique ta decision..." autocomplete="off">
        <button id="chat-send" type="button">Envoyer</button>
      </div>
      <div id="chat-hint">Enter = envoyer | E (hors chat) = interagir</div>
    `;
    document.getElementById("game-container").appendChild(container);
    uiChatContainer = container;

    const mini = document.createElement("button");
    mini.id = "chat-minimized";
    mini.className = "hidden";
    mini.type = "button";
    mini.title = "Ouvrir le chat";
    mini.innerHTML = `<img id="chat-mini-avatar" src="../assets/avatar_architecte.png" alt="avatar">`;
    document.getElementById("game-container").appendChild(mini);
    uiChatMinimized = mini;
  }

  uiChatTarget = document.getElementById("chat-target");
  uiChatAvatar = document.getElementById("chat-target-avatar");
  uiChatLog = document.getElementById("chat-log");
  uiChatInput = document.getElementById("chat-input");
  uiChatSend = document.getElementById("chat-send");
  uiChatHint = document.getElementById("chat-hint");
  uiChatCollapse = document.getElementById("chat-collapse");
  uiChatMinimized = document.getElementById("chat-minimized");
  uiChatMiniAvatar = document.getElementById("chat-mini-avatar");

  const stopKeyPropagation = (ev) => {
    ev.stopPropagation();
  };

  uiChatInput.addEventListener("keydown", (ev) => {
    stopKeyPropagation(ev);
    if (ev.key === "Enter") {
      ev.preventDefault();
      sendPlayerAction();
    }
  });
  uiChatInput.addEventListener("keyup", stopKeyPropagation);
  uiChatInput.addEventListener("focus", () => {
    state.isChatting = true;
  });
  uiChatInput.addEventListener("blur", () => {
    setTimeout(() => {
      state.isChatting = document.activeElement === uiChatInput;
    }, 0);
  });

  uiChatSend.addEventListener("click", () => {
    sendPlayerAction();
    uiChatInput.focus();
  });

  uiChatCollapse.addEventListener("click", () => {
    collapseChatPanel();
  });

  uiChatMinimized.addEventListener("click", () => {
    markTutorialEvent("chat_reopen");
    openChatPanel();
    uiChatInput.focus();
  });

  if (state.chatOpen) openChatPanel();
  else collapseChatPanel();
}

function ensureObjectiveUI() {
  uiObjective = document.getElementById("objective-info");
  if (uiObjective) return;
  const box = document.createElement("div");
  box.id = "objective-info";
  document.getElementById("ui-layer").appendChild(box);
  uiObjective = box;
}

function ensureTutorialUI() {
  uiTutorialBox = document.getElementById("tutorial-box");
  if (!uiTutorialBox) {
    const box = document.createElement("div");
    box.id = "tutorial-box";
    box.className = "hidden";
    box.innerHTML = `
      <div id="tutorial-head">
        <span id="tutorial-step">Tutoriel</span>
        <button id="tutorial-skip" type="button">Passer</button>
      </div>
      <div id="tutorial-text"></div>
    `;
    document.getElementById("ui-layer").appendChild(box);
    uiTutorialBox = box;
  }
  uiTutorialStep = document.getElementById("tutorial-step");
  uiTutorialText = document.getElementById("tutorial-text");
  uiTutorialSkip = document.getElementById("tutorial-skip");
  if (uiTutorialSkip && !uiTutorialSkip.dataset.bound) {
    uiTutorialSkip.dataset.bound = "1";
    uiTutorialSkip.addEventListener("click", () => {
      completeTutorialLevel1(true);
      addMessage("system", "[SYSTEME] Tutoriel passe. Tu es libre d'explorer.", state.currentChatTarget, true);
    });
  }
}

function isTutorialActive() {
  return state.tutorial.active && state.currentSceneId === "level_1";
}

function tutorialCanUseAltar() {
  return !isTutorialActive() || state.tutorial.step >= 6;
}

function tutorialCanUseDoor() {
  return !isTutorialActive() || state.tutorial.step >= 7;
}

function resetTutorialFlags() {
  state.tutorial.step = 0;
  state.tutorial.movedTiles = 0;
  state.tutorial.lastTileX = state.player.x;
  state.tutorial.lastTileY = state.player.y;
  state.tutorial.awaitingChatReopen = false;
  state.tutorial.flags.npcInteracted = false;
  state.tutorial.flags.chatSent = false;
  state.tutorial.flags.chatCollapsed = false;
  state.tutorial.flags.chatReopenedAfterCollapse = false;
  state.tutorial.flags.terminalUsed = false;
  state.tutorial.flags.insightUsed = false;
  state.tutorial.flags.altarVoted = false;
  state.tutorial.flags.doorUsed = false;
}

function startTutorialLevel1() {
  state.tutorial.active = true;
  resetTutorialFlags();
  updateTutorialUI();
}

function completeTutorialLevel1(skipped = false) {
  state.tutorial.active = false;
  state.tutorial.completedLevel1 = true;
  if (uiTutorialBox) uiTutorialBox.classList.add("hidden");
  updateObjectiveInfo();
  if (!skipped) {
    addMessage("system", "[SYSTEME] Tutoriel termine. Jeu libre active.", state.currentChatTarget, true);
  }
}

function tutorialRequirementMet(step) {
  const t = state.tutorial;
  if (step === 0) return t.movedTiles >= 4;
  if (step === 1) return t.flags.npcInteracted;
  if (step === 2) return t.flags.chatCollapsed && t.flags.chatReopenedAfterCollapse;
  if (step === 3) return t.flags.chatSent;
  if (step === 4) return t.flags.terminalUsed;
  if (step === 5) return t.flags.insightUsed;
  if (step === 6) return t.flags.altarVoted;
  if (step === 7) return t.flags.doorUsed;
  return false;
}

function advanceTutorialIfNeeded() {
  if (!isTutorialActive()) return;
  let changed = false;
  while (state.tutorial.step < TUTORIAL_STEPS.length && tutorialRequirementMet(state.tutorial.step)) {
    state.tutorial.step += 1;
    changed = true;
  }
  if (state.tutorial.step >= TUTORIAL_STEPS.length) {
    completeTutorialLevel1(false);
    return;
  }
  if (changed) updateTutorialUI();
  updateObjectiveInfo();
}

function updateTutorialUI() {
  if (!uiTutorialBox || !uiTutorialStep || !uiTutorialText) return;
  if (!isTutorialActive()) {
    uiTutorialBox.classList.add("hidden");
    return;
  }
  const step = state.tutorial.step;
  const total = TUTORIAL_STEPS.length;
  uiTutorialStep.textContent = `Tutoriel ${step + 1}/${total}`;
  uiTutorialText.textContent = TUTORIAL_STEPS[step] || "Tutoriel termine.";
  uiTutorialBox.classList.remove("hidden");
}

function markTutorialEvent(eventName) {
  if (!isTutorialActive()) return;
  const t = state.tutorial;
  if (eventName === "move_tile") {
    t.movedTiles += 1;
  } else if (eventName === "npc_interact") {
    t.flags.npcInteracted = true;
  } else if (eventName === "chat_send") {
    t.flags.chatSent = true;
  } else if (eventName === "chat_collapse") {
    t.flags.chatCollapsed = true;
    t.awaitingChatReopen = true;
  } else if (eventName === "chat_reopen") {
    if (t.awaitingChatReopen) {
      t.flags.chatReopenedAfterCollapse = true;
      t.awaitingChatReopen = false;
    }
  } else if (eventName === "terminal_use") {
    t.flags.terminalUsed = true;
  } else if (eventName === "insight_use") {
    t.flags.insightUsed = true;
  } else if (eventName === "altar_vote") {
    t.flags.altarVoted = true;
  } else if (eventName === "door_use") {
    t.flags.doorUsed = true;
  }
  advanceTutorialIfNeeded();
}

function grantInsightReward() {
  state.meta.intelPoints += 1;
  const rewards = [];
  if (!state.meta.modules.minimap) {
    state.meta.modules.minimap = true;
    rewards.push("Mini-carte debloquee");
  } else {
    state.meta.fastTrackCharges += 1;
    rewards.push(`/trancher +1 (total ${state.meta.fastTrackCharges})`);
  }
  return rewards.join(" | ");
}

function tryUseFastTrackCommand(inputText) {
  const normalized = normalizeText(inputText);
  const isFastTrack = normalized === "trancher" || normalized.startsWith("trancher ");
  if (!isFastTrack) return false;

  if (isTutorialActive() && !tutorialCanUseAltar()) {
    addMessage("system", "[SYSTEME] Tutoriel: valide d'abord le vote a l'autel.", state.currentChatTarget, true);
    return true;
  }
  if (state.meta.fastTrackCharges <= 0) {
    addMessage("system", "[SYSTEME] Aucune charge disponible. Explore des modules pour gagner /trancher.", state.currentChatTarget, true);
    return true;
  }

  state.meta.fastTrackCharges -= 1;
  const exitId = chooseExitHeuristically(inputText);
  const exit = resolveExitById(exitId);
  unlockDoor(exit?.target || nextSceneFallback());
  addMessage(
    "system",
    `[SYSTEME] /trancher active. Decision rapide: ${exit?.id || "AUTO"}. Charges restantes: ${state.meta.fastTrackCharges}.`,
    state.currentChatTarget,
    true,
  );
  updateObjectiveInfo();
  return true;
}

function updateObjectiveInfo() {
  if (!uiObjective) return;
  const p = state.sceneProgress;
  const lockText = state.hasVoted ? "PORTE: OUVERTE" : "PORTE: VERROUILLEE";
  const turnText = `Debat ${p.userTurns}/${p.forceDecisionTurns}`;
  const insightText = `Indices ${p.insightsCollected}/${p.insightsRequired}`;
  const toolText = `Modules: ${state.meta.modules.minimap ? "Minimap" : "-"} | /trancher: ${state.meta.fastTrackCharges}`;
  const tutorialLabel = safeText(TUTORIAL_STEPS[state.tutorial.step]);
  const tutorialShort = tutorialLabel.length > 56 ? `${tutorialLabel.slice(0, 56)}...` : tutorialLabel;
  const targetText = isTutorialActive()
    ? `Tutoriel ${state.tutorial.step + 1}/${TUTORIAL_STEPS.length}: ${tutorialShort}`
    : state.hasVoted
      ? "Passe au nord"
      : "Vote a l'autel ou tranche dans le chat";
  uiObjective.textContent = `${turnText} | ${insightText} | ${toolText} | ${lockText} | ${targetText}`;
}

function setChatTarget(personaId) {
  state.currentChatTarget = personaId;
  const persona = state.currentPersonas[personaId] || state.personas[personaId];
  uiChatTarget.textContent = persona?.displayName || persona?.name || personaId || "Conseiller";
  uiChatHint.textContent = "Enter = envoyer | E (hors chat) = interagir";
  setChatAvatar(persona?.avatar);
  restoreChatHistory(personaId);
}

function ensureSession(personaId) {
  if (!state.chatSessions[personaId]) state.chatSessions[personaId] = [];
  return state.chatSessions[personaId];
}

function renderChatLine(role, text) {
  const row = document.createElement("div");
  row.className = `chat-row ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.textContent = text;
  row.appendChild(bubble);
  uiChatLog.appendChild(row);
  uiChatLog.scrollTop = uiChatLog.scrollHeight;
}

function restoreChatHistory(personaId) {
  uiChatLog.innerHTML = "";
  const history = ensureSession(personaId);
  for (const msg of history) {
    const role = msg.role === "user" ? "user" : msg.role === "system" ? "system" : "bot";
    renderChatLine(role, msg.content);
  }
}

function addMessage(role, text, personaId, save = true) {
  if (save && personaId) {
    ensureSession(personaId).push({ role, content: text });
  }
  if (personaId === state.currentChatTarget) {
    const visualRole = role === "assistant" ? "bot" : role;
    renderChatLine(visualRole, text);
  }
}

// --- Advanced Procedural Assets ---

function drawPixelPattern(ctx, pattern, colors) {
  const size = 32;
  const pixel = size / 8; // 8x8 grid for textures
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const char = pattern[y][x];
      if (char !== " " && colors[char]) {
        ctx.fillStyle = colors[char];
        ctx.fillRect(x * pixel, y * pixel, pixel, pixel);
      }
    }
  }
}

// Helper to recolor an existing sprite/canvas with a new palette
function recolorSprite(sourceCanvas, paletteMapping) {
  const c = document.createElement("canvas");
  c.width = sourceCanvas.width;
  c.height = sourceCanvas.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(sourceCanvas, 0, 0);

  const imageData = ctx.getImageData(0, 0, c.width, c.height);
  const data = imageData.data;

  // Create lookup for performance if palette is simple k->v
  // But here we might be strictly mapping hex colors. 
  // Ideally, `paletteMapping` is { "#oldHex": "#newHex" }.
  // For pixel art, exact match is usually fine.

  const hexMap = {};
  Object.keys(paletteMapping).forEach(k => {
    hexMap[k.toLowerCase()] = paletteMapping[k];
  });

  const rgbToHex = (r, g, b) => {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toLowerCase();
  };

  const hexToRgb = (hex) => {
    const bigint = parseInt(hex.replace("#", ""), 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  };

  // Pre-calculate RGB mappings
  const rbgMap = {};
  Object.keys(hexMap).forEach(oldHex => {
    rbgMap[oldHex] = hexToRgb(hexMap[oldHex]);
  });

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // Transparent
    const currentHex = rgbToHex(data[i], data[i + 1], data[i + 2]);
    if (rbgMap[currentHex]) {
      const [r, g, b] = rbgMap[currentHex];
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }

  return c;
}


function generateTexture(type, palette) {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d");

  // Fill base background
  ctx.fillStyle = palette.base || "#000";
  ctx.fillRect(0, 0, 32, 32);

  if (type === "grass") {
    // Advanced Grass: layered noise + tufts
    for (let i = 0; i < 64; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? palette.light : palette.shadow;
      const x = Math.random() * 32;
      const y = Math.random() * 32;
      ctx.fillRect(x, y, 2, 2);
    }
    // Grass tufts
    ctx.strokeStyle = palette.light;
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * 28 + 2;
      const y = Math.random() * 28 + 2;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x - 2, y - 3);
      ctx.moveTo(x, y); ctx.lineTo(x + 2, y - 3);
      ctx.stroke();
    }
  } else if (type === "bricks") {
    // Detailed Brick pattern with depth
    ctx.fillStyle = palette.mortar || "#333";
    for (let y = 0; y < 32; y += 8) ctx.fillRect(0, y, 32, 1);
    for (let y = 0; y < 32; y += 8) {
      let offset = (y / 8) % 2 === 0 ? 0 : 4;
      for (let x = offset; x < 32; x += 8) ctx.fillRect(x, y, 1, 8);
    }
    // Pixel shading on bricks
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (let y = 0; y < 32; y += 8) {
      let offset = (y / 8) % 2 === 0 ? 0 : 4;
      for (let x = offset; x < 32; x += 8) {
        ctx.fillRect(x + 1, y + 7, 7, 1); // Bottom shadow
        ctx.fillRect(x + 7, y + 1, 1, 7); // Right shadow
      }
    }
  } else if (type === "metal") {
    // Brushed metal with rivets
    ctx.strokeStyle = palette.highlight || "rgba(255,255,255,0.1)";
    for (let i = 0; i < 10; i++) {
      const y = Math.random() * 32;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(32, y + Math.random() * 2); ctx.stroke();
    }

    // Panel lines
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(32, 0); ctx.lineTo(32, 32); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(1, 1, 30, 1); ctx.fillRect(1, 1, 1, 30);

    // Rivets
    ctx.fillStyle = palette.shadow || "#000";
    ctx.beginPath();
    ctx.arc(3, 3, 1, 0, Math.PI * 2);
    ctx.arc(29, 3, 1, 0, Math.PI * 2);
    ctx.arc(3, 29, 1, 0, Math.PI * 2);
    ctx.arc(29, 29, 1, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "hazard") {
    // Clean hazard stripes
    ctx.fillStyle = palette.stripes || "#000";
    ctx.beginPath();
    for (let i = -32; i < 32; i += 8) {
      ctx.moveTo(i, 0); ctx.lineTo(i + 4, 0); ctx.lineTo(i + 36, 32); ctx.lineTo(i + 32, 32);
    }
    ctx.fill();
    // Gloss
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(0, 0, 32, 4);
  } else if (type === "carpet") {
    // Rich carpet pattern
    ctx.fillStyle = palette.pattern || "rgba(0,0,0,0.1)";
    for (let y = 0; y < 32; y += 2) {
      for (let x = 0; x < 32; x += 2) {
        if ((x + y) % 4 === 0) ctx.fillRect(x, y, 1, 1);
      }
    }
    // Border
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.strokeRect(0, 0, 32, 32);
  } else if (type === "tiles") {
    // Clean lab/hospital tiles
    ctx.fillStyle = palette.grout || "#ccc";
    ctx.fillRect(15, 0, 1, 32);
    ctx.fillRect(0, 15, 32, 1);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillRect(2, 2, 10, 2); ctx.fillRect(18, 18, 10, 2);
  } else if (type === "noise") {
    // Generic noise fallback
    for (let i = 0; i < 32; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? palette.light : palette.shadow;
      ctx.fillRect(Math.random() * 32, Math.random() * 32, 2, 2);
    }
  }

  return c;
}


function drawDetail(ctx, type, theme) {
  const p = theme === "nature" ? { main: "#2e7d32", sec: "#5d4037" } :
    theme === "urbain" ? { main: "#546e7a", sec: "#263238" } :
      theme === "laboratoire" ? { main: "#00acc1", sec: "#eceff1" } :
        theme === "espace" ? { main: "#ff6f00", sec: "#212121" } :
          { main: "#8d6e63", sec: "#d7ccc8" };

  // Draw based on type...
  if (type === "tree" || type === "column") {
    ctx.fillStyle = p.sec;
    ctx.fillRect(10, 20, 12, 12); // Trunk/Base
    ctx.fillStyle = p.main;
    ctx.beginPath(); ctx.arc(16, 16, 12, 0, Math.PI * 2); ctx.fill(); // Top
    // Highlight
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.beginPath(); ctx.arc(12, 12, 4, 0, Math.PI * 2); ctx.fill();
  } else if (type === "computer") {
    ctx.fillStyle = p.sec;
    ctx.fillRect(4, 12, 24, 18); // Desk
    ctx.fillStyle = "#111";
    ctx.fillRect(8, 6, 16, 12); // Monitor
    ctx.fillStyle = "#0f0";
    ctx.font = "8px monospace";
    ctx.fillText(">_", 9, 14);
  }
}

function drawBuilding(theme) {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 32;
  const ctx = c.getContext("2d");

  // Base Facade
  const isUrban = theme === "urbain";
  const isSpace = theme === "espace";

  ctx.fillStyle = isUrban ? "#a1887f" : isSpace ? "#37474f" : "#5d4037"; // Brick vs Metal vs Wood
  ctx.fillRect(2, 2, 28, 30);

  // Roof / Top trim
  ctx.fillStyle = isUrban ? "#5d4037" : isSpace ? "#263238" : "#3e2723";
  ctx.fillRect(0, 0, 32, 4);

  // Window
  ctx.fillStyle = isSpace ? "#0277bd" : "#81d4fa";
  ctx.fillRect(8, 10, 6, 8);
  ctx.fillRect(18, 10, 6, 8);

  // Door
  ctx.fillStyle = "#3e2723";
  ctx.fillRect(12, 22, 8, 10);

  return c;
}


function drawVehicle(theme) {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 32;
  const ctx = c.getContext("2d");

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath(); ctx.ellipse(16, 28, 12, 4, 0, 0, Math.PI * 2); ctx.fill();

  const isNature = theme === "nature";
  const isSpace = theme === "espace";
  const isLab = theme === "laboratoire";

  if (isNature) {
    // Wooden Cart
    ctx.fillStyle = "#5d4037";
    ctx.fillRect(4, 12, 24, 12);
    // Wheels
    ctx.fillStyle = "#3e2723";
    ctx.beginPath(); ctx.arc(8, 24, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(24, 24, 4, 0, Math.PI * 2); ctx.fill();
  } else if (isSpace || isLab) {
    // Rover / Bot
    ctx.fillStyle = isSpace ? "#ff6f00" : "#eceff1";
    ctx.beginPath();
    ctx.moveTo(4, 24); ctx.lineTo(16, 8); ctx.lineTo(28, 24); ctx.fill();
    // Eye
    ctx.fillStyle = "#00e5ff";
    ctx.fillRect(14, 14, 4, 2);
  } else {
    // Car (Urban/Bureau)
    ctx.fillStyle = theme === "urbain" ? "#c62828" : "#1a237e";
    ctx.fillRect(4, 16, 24, 8); // Body
    ctx.fillRect(8, 10, 16, 6); // Top
    // Windows
    ctx.fillStyle = "#81d4fa";
    ctx.fillRect(9, 11, 6, 4); ctx.fillRect(17, 11, 6, 4);
    // Wheels
    ctx.fillStyle = "#111";
    ctx.fillRect(6, 22, 4, 4); ctx.fillRect(22, 22, 4, 4);
  }

  return c;
}



function createProceduralAssets() {
  const pPal = { "1": "#e74c3c", "2": "#f1948a", "3": "#ffffff", "4": "#7b241c" };
  // Keep original players/NPCs for now
  state.assets.player_down = generateSprite("player", pPal);
  state.assets.player_up = generateSprite("player_up", pPal);
  state.assets.player_left = generateSprite("player_side", pPal);
  state.assets.player_right = generateSprite("player_side", pPal, true);

  state.assets["A-1"] = generateSprite("npc", { "1": "#154360", "2": "#2980b9", "3": "#00ffff", "4": "#1a5276" });
  state.assets["B-2"] = generateSprite("npc", { "1": "#145a32", "2": "#27ae60", "3": "#f1c40f", "4": "#1e8449" });
  state.assets["C-3"] = generateSprite("npc", { "1": "#6e2c00", "2": "#d35400", "3": "#111111", "4": "#a04000" });

  state.assets.themeTiles = {};

  // Helper to generate a full theme set
  const makeTheme = (themeName) => {
    const isNature = themeName === "nature";
    const isUrban = themeName === "urbain";
    const isLab = themeName === "laboratoire";
    const isSpace = themeName === "espace";

    // Palettes
    const floorPal = isNature ? { base: "#2e7d32", light: "#66bb6a", shadow: "#1b5e20" } :
      isUrban ? { base: "#455a64", mortar: "#37474f" } :
        isLab ? { base: "#eceff1", grout: "#b0bec5" } :
          isSpace ? { base: "#263238", highlight: "#37474f", shadow: "#102027" } :
            { base: "#5d4037", pattern: "#795548" }; // Bureau

    const wallPal = isNature ? { base: "#4e342e", mortar: "#3e2723" } :
      isUrban ? { base: "#a1887f", mortar: "#5d4037" } :
        isLab ? { base: "#b0bec5", highlight: "#fff", shadow: "#78909c" } :
          isSpace ? { base: "#3e2723", highlight: "#ff6f00", shadow: "#1b0000" } :
            { base: "#d7ccc8", grout: "#a1887f" };

    // Texture Types
    const floorType = isNature ? "grass" : isLab ? "tiles" : isSpace || isUrban ? "metal" : "carpet";
    const wallType = isNature || isUrban ? "bricks" : "metal";

    // Objects
    const computer = generateSprite("computer", isNature ? { "1": "#5d4037", "2": "#795548", "3": "#a5d6a7" } :
      isLab ? { "1": "#eceff1", "2": "#ffffff", "3": "#00bcd4" } :
        { "1": "#263238", "2": "#37474f", "3": "#ffca28" });

    // Helper to extract sprite from sheet
    const extractSprite = (sheet, index) => {
      if (!sheet) return null;
      const c = document.createElement("canvas");
      c.width = 32; c.height = 32;
      const ctx = c.getContext("2d");
      // Assume 32x32 grid, sheet width determines cols
      const cols = Math.floor(sheet.width / 32);
      const row = Math.floor(index / cols);
      const col = index % cols;
      ctx.drawImage(sheet, col * 32, row * 32, 32, 32, 0, 0, 32, 32);
      return c;
    };


    // Buildings: Try high-fidelity first
    let building;
    if (isNature && state.assets.sheets?.buildings_nature) building = extractSprite(state.assets.sheets.buildings_nature, Math.floor(Math.random() * 4));
    else if (isUrban && state.assets.sheets?.buildings_urbain) building = extractSprite(state.assets.sheets.buildings_urbain, Math.floor(Math.random() * 4));
    else if (isLab && state.assets.sheets?.buildings_laboratoire) building = extractSprite(state.assets.sheets.buildings.laboratoire, Math.floor(Math.random() * 4));

    if (!building) building = drawBuilding(themeName); // Fallback

    const vehicle = drawVehicle(themeName); // Vehicles still procedural for now

    // Theme NPCs
    // Map themes to rows in npcs_themes.png (assuming 5 themes * 3 npcs = 15 sprites)
    // Row 0: Nature, Row 1: Urban, Row 2: Lab, Row 3: Space, Row 4: Bureau
    const themeRow = isNature ? 0 : isUrban ? 1 : isLab ? 2 : isSpace ? 3 : 4;

    let npc1, npc2, npc3;
    if (state.assets.sheets?.npcs_themes) {
      npc1 = extractSprite(state.assets.sheets.npcs_themes, themeRow * 3 + 0);
      npc2 = extractSprite(state.assets.sheets.npcs_themes, themeRow * 3 + 1);
      npc3 = extractSprite(state.assets.sheets.npcs_themes, themeRow * 3 + 2);
    }

    // Fallback Procedural Palettes
    const npcPal1 = isNature ? { "1": "#33691e", "2": "#558b2f", "3": "#dcedc8", "4": "#1b5e20" } : // Ranger
      isLab ? { "1": "#ffffff", "2": "#eceff1", "3": "#00bcd4", "4": "#b0bec5" } : // Scientist
        isSpace ? { "1": "#ff6f00", "2": "#ff8f00", "3": "#212121", "4": "#bf360c" } : // Engineer
          isUrban ? { "1": "#607d8b", "2": "#78909c", "3": "#eceff1", "4": "#455a64" } : // Citizen
            { "1": "#5d4037", "2": "#795548", "3": "#d7ccc8", "4": "#3e2723" }; // Bureaucrat

    const npcPal2 = isNature ? { "1": "#5d4037", "2": "#795548", "3": "#a1887f", "4": "#3e2723" } : // Hiker
      isLab ? { "1": "#00acc1", "2": "#26c6da", "3": "#e0f7fa", "4": "#00838f" } : // Assistant
        isSpace ? { "1": "#212121", "2": "#424242", "3": "#76ff03", "4": "#000000" } : // Marine
          isUrban ? { "1": "#37474f", "2": "#546e7a", "3": "#cfd8dc", "4": "#263238" } : // Punk
            { "1": "#4e342e", "2": "#6d4c41", "3": "#ffe0b2", "4": "#3e2723" }; // Manager

    const npcPal3 = isNature ? { "1": "#1b5e20", "2": "#2e7d32", "3": "#81c784", "4": "#003300" } : // Spirit
      isLab ? { "1": "#e91e63", "2": "#f06292", "3": "#fce4ec", "4": "#880e4f" } : // Director
        isSpace ? { "1": "#0277bd", "2": "#29b6f6", "3": "#e1f5fe", "4": "#01579b" } : // Pilot
          isUrban ? { "1": "#212121", "2": "#000000", "3": "#ff5722", "4": "#3e2723" } : // Goth
            { "1": "#8d6e63", "2": "#a1887f", "3": "#ffffff", "4": "#5d4037" }; // Intern

    // Generate Base Textures
    const set = {
      floor: generateTexture(floorType, floorPal),
      wall: generateTexture(wallType, wallPal),
      door_closed: generateSprite("door", { "1": "#424242", "2": "#616161", "3": "#ef5350" }),
      door_open: generateSprite("door", { "1": "#424242", "2": "#616161", "3": "#66bb6a" }),
      computer: computer,
      building: building,
      vehicle: vehicle,
      npc_1: generateSprite("npc", npcPal1),
      npc_2: generateSprite("npc", npcPal2),
      npc_3: generateSprite("npc", npcPal3),
      alt: generateTexture("hazard", { stripes: isLab ? "#29b6f6" : "#fbc02d" }),
      liquid: generateTexture("noise", { base: isNature ? "#0277bd" : "#d32f2f", light: "#fff", shadow: "#000" }),
      altar: generateSprite("wall", { "1": "#607d8b", "2": "#78909c", "3": "#ffffff" })
    };

    // --- OVERRIDES FOR HIGH FIDELITY ASSETS ---
    if (isSpace && state.assets.sheets?.buildings_espace) {
      // Space Buildings
      set.building = extractSprite(state.assets.sheets.buildings_espace, randomInt(rng, 0, 8));
    }

    // Vehicles (Generic handling: row 0=Nature, 1=Urban, 2=Lab, 3=Space?? Checking sheet content is hard, assume grid)
    if (state.assets.sheets?.vehicles) {
      // let's just pick random vehicles for now as improved fallback
      const vRow = isNature ? 0 : isUrban ? 1 : isLab ? 2 : isSpace ? 3 : 4;
      // Assume 5 rows, 4 cols
      set.vehicle = extractSprite(state.assets.sheets.vehicles, vRow * 4 + randomInt(rng, 0, 3));
    }


    // Add Detailed Object Overlays
    // We create a composite canvas for specific complex objects if needed, 
    // but for now we'll just use the sprites we generated.
    // PRO TIP: We can draw *on top* of the generated sprites to add detail.

    const enhance = (baseSprite, type) => {
      const c = document.createElement("canvas");
      c.width = 32; c.height = 32;
      const ctx = c.getContext("2d");
      ctx.drawImage(baseSprite, 0, 0);
      drawDetail(ctx, type, themeName);
      return c;
    };


    // Enhance props
    set.computer = enhance(set.computer, "computer");
    // set.altar = enhance(set.altar, "column"); // Optional

    return set;
  };

  state.assets.themeTiles.nature = makeTheme("nature");
  state.assets.themeTiles.urbain = makeTheme("urbain");
  state.assets.themeTiles.laboratoire = makeTheme("laboratoire");
  state.assets.themeTiles.espace = makeTheme("espace");
  state.assets.themeTiles.bureaucratie = makeTheme("bureaucratie");

  // Set default
  Object.assign(state.assets, state.assets.themeTiles.nature);
}


// --- Enrich theme tile sets with building / vehicle / NPC sprites ---
// Called AFTER rebuildThemeTiles() in the external-assets path,
// so the draw loop can find themeSet.building, themeSet.vehicle, etc.
function enrichThemeTilesWithProps() {
  const sheets = state.assets.sheets || {};

  // Helper: extract a 32×32 sprite from a sheet image
  const extractSprite = (sheet, index) => {
    if (!sheet) return null;
    const c = document.createElement("canvas");
    c.width = 32; c.height = 32;
    const sctx = c.getContext("2d");
    const cols = Math.max(1, Math.floor(sheet.width / 32));
    const row = Math.floor(index / cols);
    const col = index % cols;
    sctx.drawImage(sheet, col * 32, row * 32, 32, 32, 0, 0, 32, 32);
    return c;
  };

  const themeList = [
    { name: "nature", buildingSheet: sheets.buildings_nature, vRow: 0, npcRow: 0 },
    { name: "urbain", buildingSheet: sheets.buildings_urbain, vRow: 1, npcRow: 1 },
    { name: "laboratoire", buildingSheet: sheets.buildings_laboratoire, vRow: 2, npcRow: 2 },
    { name: "espace", buildingSheet: sheets.buildings_espace, vRow: 3, npcRow: 3 },
    { name: "bureaucratie", buildingSheet: null, vRow: 4, npcRow: 4 },
  ];

  themeList.forEach(({ name, buildingSheet, vRow, npcRow }) => {
    const set = state.assets.themeTiles[name];
    if (!set) return;

    // --- Building ---
    if (buildingSheet) {
      set.building = extractSprite(buildingSheet, Math.floor(Math.random() * 4));
    }
    if (!set.building) set.building = drawBuilding(name);

    // --- Vehicle ---
    if (sheets.vehicles) {
      set.vehicle = extractSprite(sheets.vehicles, vRow * 4 + Math.floor(Math.random() * 4));
    }
    if (!set.vehicle) set.vehicle = drawVehicle(name);

    // --- NPCs ---
    if (sheets.npcs_themes) {
      set.npc_1 = extractSprite(sheets.npcs_themes, npcRow * 3 + 0);
      set.npc_2 = extractSprite(sheets.npcs_themes, npcRow * 3 + 1);
      set.npc_3 = extractSprite(sheets.npcs_themes, npcRow * 3 + 2);
    }
    // Procedural fallback NPCs
    if (!set.npc_1) set.npc_1 = generateSprite("npc", { "1": "#33691e", "2": "#558b2f", "3": "#dcedc8", "4": "#1b5e20" });
    if (!set.npc_2) set.npc_2 = generateSprite("npc", { "1": "#5d4037", "2": "#795548", "3": "#a1887f", "4": "#3e2723" });
    if (!set.npc_3) set.npc_3 = generateSprite("npc", { "1": "#1b5e20", "2": "#2e7d32", "3": "#81c784", "4": "#003300" });

    // --- Computer / alt / liquid / altar fallbacks ---
    if (!set.computer) set.computer = generateSprite("computer", { "1": "#263238", "2": "#37474f", "3": "#ffca28" });
    if (!set.alt) set.alt = generateTexture("hazard", { stripes: "#fbc02d" });
    if (!set.liquid) set.liquid = generateTexture("noise", { base: name === "nature" ? "#0277bd" : "#d32f2f", light: "#fff", shadow: "#000" });
    if (!set.altar) set.altar = generateSprite("wall", { "1": "#607d8b", "2": "#78909c", "3": "#ffffff" });
  });
}


// --- SLICED ASSETS LISTS ---
const ASSETS_BUILDINGS_SPACE = [
  "building_space_habitat_long.png",
  "building_space_observatory_01.png",
  "building_space_observatory_02.png",
  "building_space_complex_01.png",
  "building_space_observatory_03.png",
  "building_space_observatory_04.png",
  "building_space_gate_large.png",
  "building_space_blast_door_large_01.png",
  "building_space_blast_door_medium.png",
  "building_space_door_airlock.png",
  "building_space_door_vertical.png",
  "building_space_solar_angled.png",
  "building_space_solar_flat.png",
  "building_space_blast_door_small.png",
  "building_space_blast_door_large_02.png"
];

const ASSETS_VEHICLES_RUSTIC = [
  "vehicle_rustic_wagon_0_01.png", "vehicle_rustic_wagon_1_01.png", "vehicle_rustic_wagon_2_01.png", "vehicle_rustic_wagon_3_01.png", "vehicle_rustic_wagon_4_01.png",
  "vehicle_rustic_cart_5_01.png", "vehicle_rustic_cart_7_01.png", "vehicle_rustic_cart_8_01.png", "vehicle_rustic_cart_9_01.png",
  "vehicle_rustic_wagon_empty_10_01.png", "vehicle_rustic_wagon_empty_11_01.png", "vehicle_rustic_wagon_empty_12_01.png", "vehicle_rustic_wagon_empty_13_01.png", "vehicle_rustic_wagon_empty_14_01.png"
];

const ASSETS_VEHICLES_SCIFI = [
  "vehicle_scifi_heavy_15_01.png", "vehicle_scifi_heavy_16_01.png", "vehicle_scifi_heavy_19_01.png"
];

const ASSETS_VEHICLES_URBAN = [
  "vehicle_urban_buggy_20_01.png", "vehicle_urban_buggy_21_01.png", "vehicle_urban_buggy_22_01.png", "vehicle_urban_buggy_23_01.png", "vehicle_urban_buggy_24_01.png",
  "vehicle_urban_buggy_25_01.png", "vehicle_urban_buggy_26_01.png", "vehicle_urban_buggy_27_01.png", "vehicle_urban_buggy_28_01.png", "vehicle_urban_buggy_29_01.png",
  "vehicle_urban_transport_31_01.png", "vehicle_urban_transport_32_01.png", "vehicle_urban_transport_33_01.png", "vehicle_urban_transport_34_01.png", "vehicle_urban_transport_35_01.png",
  "vehicle_urban_transport_36_01.png", "vehicle_urban_transport_37_01.png", "vehicle_urban_transport_38_01.png", "vehicle_urban_transport_39_01.png"
];

const ASSETS_PROPS = [
  "prop_wind_turbine_40_01.png", "prop_wind_turbine_41_01.png"
];

async function createAssets() {
  try {
    const [
      playerManifest,
      npcManifest,
      tilesetsManifest,
      playerSheet,
      npcSheet,
      tilesNature,
      tilesUrbain,
      tilesLab,
      tilesEspace,
      tilesBureau,
      buildingsNature,
      buildingsUrban,
      buildingsLab,
      buildingsEspace, // New
      vehicles,        // New
      npcsThemes,
    ] = await Promise.all([

      loadJson("./assets/player_presets.json").catch(() => null),
      loadJson("./assets/npcs.json").catch(() => null),
      loadJson("./assets/tilesets_manifest.json").catch(() => null),
      loadImage("./assets/player_presets.png"),
      loadImage("./assets/npcs.png"),
      loadImage("./assets/tilesets_nature.png"),
      loadImage("./assets/tilesets_urbain.png"),
      loadImage("./assets/tilesets_laboratoire.png"),
      loadImage("./assets/tilesets_espace.png"),
      loadImage("./assets/tilesets_bureaucratie.png"),
      loadImage("./assets/buildings_nature.png").catch(() => null),
      loadImage("./assets/buildings_urban.png").catch(() => null),
      loadImage("./assets/buildings_lab.png").catch(() => null),
      loadImage("./assets/buildings_espace.png").catch(() => null),
      loadImage("./assets/vehicles.png").catch(() => null),
      loadImage("./assets/npcs_themes.png").catch(() => null),
    ]);

    console.log("[ASSETS] Promise.all resolved", { tilesetsManifest, buildingsNature });

    // --- LOAD SLICED ASSETS ---
    state.assets.buildings = state.assets.buildings || {};
    state.assets.buildings.space_sliced = await Promise.all(ASSETS_BUILDINGS_SPACE.map(f => loadImage(`./assets/buildings_space/${f}`).catch(e => { console.warn("Failed sliced build", f); return null; })));

    state.assets.vehicles = state.assets.vehicles || {};
    state.assets.vehicles.mixed_sliced = {
      rustic: await Promise.all(ASSETS_VEHICLES_RUSTIC.map(f => loadImage(`./assets/vehicles_mixed/${f}`).catch(e => null))),
      scifi: await Promise.all(ASSETS_VEHICLES_SCIFI.map(f => loadImage(`./assets/vehicles_mixed/${f}`).catch(e => null))),
      urban: await Promise.all(ASSETS_VEHICLES_URBAN.map(f => loadImage(`./assets/vehicles_mixed/${f}`).catch(e => null))),
      props: await Promise.all(ASSETS_PROPS.map(f => loadImage(`./assets/vehicles_mixed/${f}`).catch(e => null)))
    };



    state.assets.playerManifest = playerManifest;

    state.assets.npcManifest = npcManifest;
    state.assets.tilesetsManifest = tilesetsManifest;
    state.assets.player_sheet = playerSheet;
    state.assets.npc_sheet = npcSheet;
    state.assets.playerPresetIndex = 0;
    state.assets.tilesets = {
      nature: tilesNature,
      urbain: tilesUrbain,
      laboratoire: tilesLab,
      espace: tilesEspace,
      bureaucratie: tilesBureau,
    };

    state.assets.sheets = {
      buildings_nature: buildingsNature,
      buildings_urbain: buildingsUrban,
      buildings_laboratoire: buildingsLab,
      buildings_espace: buildingsEspace,
      vehicles: vehicles,
      npcs_themes: npcsThemes
    };





    rebuildThemeTiles();
    enrichThemeTilesWithProps();   // <-- NEW: add building/vehicle/NPC sprites
    applyThemeAssets("nature");
    state.assets.useExternal = true;
  } catch (err) {
    console.error("!!! ASSET LOADING ERROR !!!", err);
    console.warn("[ASSETS] External assets unavailable, using procedural fallback:", err.message || err);
    createProceduralAssets();
  }
}

function showPlayerSelection() {
  return new Promise((resolve) => {
    const overlay = document.getElementById("player-selection-overlay");
    const grid = document.getElementById("presets-grid");
    const startBtn = document.getElementById("start-game-btn");

    if (!overlay || !grid || !startBtn) {
      resolve();
      return;
    }

    overlay.classList.remove("hidden");
    grid.innerHTML = "";

    const presets = state.assets.playerManifest?.presets || Array.from({ length: 10 }, (_, i) => ({ id: i, label: `Preset ${i + 1}` }));
    let selectedIdx = null;

    presets.forEach((preset, i) => {
      const card = document.createElement("div");
      card.className = "preset-card";
      card.dataset.index = i;

      const canvasPreview = document.createElement("canvas");
      canvasPreview.className = "preset-preview-canvas";
      canvasPreview.width = SHEET_TILE;
      canvasPreview.height = SHEET_TILE;
      const pctx = canvasPreview.getContext("2d");
      pctx.imageSmoothingEnabled = false;

      // Draw down frame (first frame) of preset
      if (state.assets.player_sheet) {
        pctx.drawImage(
          state.assets.player_sheet,
          i * 3 * SHEET_TILE, 0, SHEET_TILE, SHEET_TILE,
          0, 0, SHEET_TILE, SHEET_TILE,
        );
      }

      const label = document.createElement("div");
      label.className = "preset-label";
      label.textContent = preset.label || `Preset ${i + 1}`;

      card.appendChild(canvasPreview);
      card.appendChild(label);

      card.onclick = () => {
        document.querySelectorAll(".preset-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        selectedIdx = i;
        startBtn.disabled = false;
      };

      grid.appendChild(card);
    });

    startBtn.onclick = () => {
      state.assets.playerPresetIndex = selectedIdx;
      overlay.classList.add("hidden");
      resolve();
    };
  });
}

async function loadJson(path) {
  console.log(`[LOAD] Loading JSON: ${path}`);
  const res = await fetch(path);
  if (!res.ok) {
    console.error(`[LOAD] Error 404 for ${path}`);
    throw new Error(`Missing file: ${path}`);
  }
  return res.json();
}

function resolveSceneId(sceneId) {
  if (state.scenario.scenes[sceneId]) return sceneId;
  const fallback = `level_${sceneId}`;
  if (state.scenario.scenes[fallback]) return fallback;
  return null;
}

function buildScenePersonas(scene) {
  const current = {};
  const chars = scene?.narrative?.characters || [];
  const fallbackArchetypes = ["A-1", "B-2", "C-3"];
  if (chars.length) {
    chars.forEach((char, idx) => {
      if (!char) return;
      const archetype = safeText(char.archetype) || fallbackArchetypes[idx % fallbackArchetypes.length];
      const base = state.personas[archetype] || {};
      const id = safeText(char.id) || `${scene.id}_char_${idx + 1}`;
      const name = safeText(char.name) || base.displayName || `Intervenant ${idx + 1}`;
      const role = safeText(char.role);
      current[id] = {
        id,
        archetype,
        displayName: role ? `${name} (${role})` : name,
        name,
        role,
        bio: safeText(char.bio) || safeText(base.bio) || "Intervenant du dilemme.",
        avatar: safeText(char.avatar) || safeText(base.avatar),
      };
      ensureSession(id);
    });
  } else {
    for (const [id, p] of Object.entries(state.personas)) {
      current[id] = {
        id,
        archetype: id,
        displayName: p.displayName || id,
        name: p.displayName || id,
        role: "",
        bio: p.bio || "",
        avatar: p.avatar || "",
      };
      ensureSession(id);
    }
  }

  const narratorId = Object.keys(current)[0] || Object.keys(state.personas)[0] || "A-1";
  return { current, narratorId };
}

function personaAssetKey(persona) {
  const a = safeText(persona?.archetype);
  if (a === "A-1" || a === "B-2" || a === "C-3") return a;
  if (safeText(persona?.id) in state.assets) return safeText(persona.id);
  return "A-1";
}

function resolveExitById(exitId) {
  const exits = Array.isArray(state.levelData?.exits) ? state.levelData.exits : [];
  if (!exits.length) return null;
  if (!exitId) return exits[0];
  const normalized = normalizeText(exitId).toUpperCase();
  return exits.find((e) => normalizeText(e.id).toUpperCase() === normalized) || exits[0];
}

function chooseExitHeuristically(text) {
  const exits = Array.isArray(state.levelData?.exits) ? state.levelData.exits : [];
  if (!exits.length) return null;
  const source = `${safeText(text)} ${state.globalHistory
    .filter((h) => h.sceneId === state.currentSceneId && h.role === "user")
    .map((h) => h.content).join(" ")}`;
  const sourceNorm = normalizeText(source);
  const explicit = exits.find((e) => sourceNorm.includes(normalizeText(e.id)));
  if (explicit) return explicit.id;

  let best = exits[0];
  let bestScore = -1;
  for (const e of exits) {
    const score = overlapScore(source, `${safeText(e.id)} ${safeText(e.description)}`);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best?.id || exits[0].id;
}

function maybeUnlockDoorByProgress(reason = "AUTO") {
  if (state.hasVoted) return false;
  if (isTutorialActive() && !tutorialCanUseAltar()) return false;
  const p = state.sceneProgress;
  const enoughInsights = p.insightsCollected >= p.insightsRequired;
  const enoughTurns = p.userTurns >= 4;

  if (enoughInsights && enoughTurns) {
    const exitId = chooseExitHeuristically(p.lastPlayerInput);
    const targetExit = resolveExitById(exitId);
    unlockDoor(targetExit?.target || nextSceneFallback());
    const label = targetExit?.id || "AUTO";
    addMessage("system", `[SYSTEME] Synthese ${reason}: ${label}. Porte deverrouillee.`, state.currentChatTarget, true);
    return true;
  }

  if (p.userTurns >= p.forceDecisionTurns) {
    const exitId = chooseExitHeuristically(p.lastPlayerInput);
    const targetExit = resolveExitById(exitId);
    unlockDoor(targetExit?.target || nextSceneFallback());
    const label = targetExit?.id || "AUTO";
    addMessage("system", `[SYSTEME] Limite de debat atteinte. Decision appliquee: ${label}. Porte deverrouillee.`, state.currentChatTarget, true);
    return true;
  }
  return false;
}

function getLastAssistantMessage(personaId) {
  const history = ensureSession(personaId).filter((m) => m.role === "assistant");
  return history.length ? history[history.length - 1].content : "";
}

function buildFreshAngleReply(targetId) {
  const persona = state.currentPersonas[targetId] || {};
  const roleName = persona.displayName || persona.name || "Conseiller";
  const templates = [
    `${roleName}: impact humain direct, a court terme, puis cout moral a long terme.`,
    `${roleName}: pense aux externalites invisibles et a qui porte vraiment le risque.`,
    `${roleName}: une solution legitime doit etre defendable publiquement et reversible.`,
    `${roleName}: compare les consequences irreversibles contre les benefices immediats.`,
    `${roleName}: decide avec un critere clair, puis applique-le sans exception opportuniste.`,
  ];
  const idx = state.sceneProgress.loopBreakerIndex % templates.length;
  state.sceneProgress.loopBreakerIndex += 1;
  return templates[idx];
}

function sanitizeReplyChunk(text, turnCount) {
  let out = safeText(text);
  if (!out) return out;
  if (turnCount >= 3) {
    let seenQuestion = false;
    out = out.replace(/\?/g, () => {
      if (seenQuestion) return ".";
      seenQuestion = true;
      return "?";
    });
  }
  if (out.length > 260) out = `${out.slice(0, 257)}...`;
  return out;
}

function avoidLoopReply(targetId, chunk) {
  const last = getLastAssistantMessage(targetId);
  const nowNorm = normalizeText(chunk);
  const lastNorm = normalizeText(last);
  if (!nowNorm) return buildFreshAngleReply(targetId);
  const tooClose = (nowNorm && lastNorm && (nowNorm === lastNorm || nowNorm.includes(lastNorm) || lastNorm.includes(nowNorm)))
    || overlapScore(nowNorm, lastNorm) > 0.84;
  if (!tooClose) return chunk;
  return buildFreshAngleReply(targetId);
}

async function loadLevel(sceneId) {
  const targetId = resolveSceneId(sceneId);
  if (!targetId) return;
  const isTutorialLevel = targetId === "level_1" && !state.tutorial.completedLevel1;
  const scene = isTutorialLevel ? buildTutorialScene() : state.scenario.scenes[targetId];
  state.currentSceneId = targetId;
  state.levelData = scene;
  if (state.assets.useExternal) {
    applyThemeAssets(inferThemeFromScene(scene));
  }
  const world = generateWorld(scene);
  state.world.w = world.w;
  state.world.h = world.h;
  state.world.tiles = world.tiles;
  state.world.deco = world.deco;
  state.world.themes = world.themes;
  state.world.zoneNames = world.zoneNames || [];
  state.camera.x = 0;
  state.camera.y = 0;

  state.entities = [];
  state.hasVoted = false;
  state.pendingDoorTarget = null;
  state.sceneProgress.userTurns = 0;
  state.sceneProgress.insightsCollected = 0;
  state.sceneProgress.loopBreakerIndex = 0;
  state.sceneProgress.lastPlayerInput = "";
  state.player.x = world.spawnX;
  state.player.y = world.spawnY;
  state.player.pixelX = world.spawnX * TILE_SIZE;
  state.player.pixelY = world.spawnY * TILE_SIZE;

  const levelNum = parseLevelNumber(targetId);
  uiLevel.textContent = Number.isNaN(levelNum) ? targetId : `${levelNum} / 50`;

  saveGame(); // Save progress at level start

  const { current, narratorId } = isTutorialLevel ? buildTutorialPersonas() : buildScenePersonas(scene);
  state.currentPersonas = current;
  setChatTarget(narratorId);
  if (isTutorialLevel) {
    startTutorialLevel1();
    addMessage(
      "system",
      "[SYSTEME] Tutoriel guide active sur ce niveau. Utilise 'Passer' si besoin.",
      narratorId,
      true,
    );
    if (ensureSession(narratorId).filter((m) => m.role === "assistant").length === 0) {
      addMessage(
        "assistant",
        "Bienvenue a l'Academie. Cette fenetre prend de la place volontairement: reduis-la avec '-' puis rouvre-la via l'avatar pour valider la premiere etape.",
        narratorId,
        true,
      );
    }
  } else {
    state.tutorial.active = false;
    updateTutorialUI();
  }

  const context = safeText(scene?.narrative?.context || scene?.theme || "");
  const introLines = [
    `Contexte: ${context || "Aucun contexte."}`,
    state.world.zoneNames?.length ? `Zones: ${state.world.zoneNames.join(" | ")}` : "",
    "Objectif: explorer, debattre puis trancher.",
  ].filter(Boolean).join("\n");
  startDialog("INTRO NIVEAU", introLines);

  const personaList = Object.values(current);
  const worldZones = world.zones || [];

  personaList.forEach((persona, idx) => {
    let nx, ny;

    // Place each NPC in a different zone if zones available
    if (worldZones.length > 0) {
      const zone = worldZones[idx % worldZones.length];
      const zoneX0 = Math.floor(zone.rect[0] * world.w) + 3;
      const zoneY0 = Math.floor(zone.rect[1] * world.h) + 3;
      const zoneX1 = Math.floor(zone.rect[2] * world.w) - 3;
      const zoneY1 = Math.floor(zone.rect[3] * world.h) - 3;
      nx = Math.floor((zoneX0 + zoneX1) / 2);
      ny = Math.floor((zoneY0 + zoneY1) / 2);
    } else {
      // Fallback: spread near spawn
      nx = world.spawnX - 5 + (idx % 3) * 5;
      ny = world.spawnY - 4 + Math.floor(idx / 3) * 2;
    }

    const pos = placeIfWalkable(nx, ny, world.spawnX, world.spawnY - 2);
    const zoneRect = worldZones.length > 0 ? worldZones[idx % worldZones.length].rect : null;

    state.entities.push({
      type: "npc",
      x: pos.x,
      y: pos.y,
      pixelX: pos.x * TILE_SIZE,
      pixelY: pos.y * TILE_SIZE,
      personaId: persona.id,
      asset: personaAssetKey(persona),
      blocking: true,
      allowedRect: zoneRect, // Store the zone rectangle for AI boundaries
      interact: async () => {
        markTutorialEvent("npc_interact");
        setChatTarget(persona.id);
        openChatPanel();
        if (uiChatInput) uiChatInput.focus();
        await checkAutoGreeting(persona.id);
      },
    });
  });


  const computerPos = placeIfWalkable(world.spawnX - 4, world.spawnY - 1, world.spawnX - 3, world.spawnY);
  state.entities.push({
    type: "computer",
    x: computerPos.x,
    y: computerPos.y,
    asset: "computer",
    blocking: true,
    interact: () => {
      markTutorialEvent("terminal_use");
      const c = `${safeText(scene?.narrative?.visual_cues)} ${safeText(scene?.narrative?.context)}`.trim();
      startDialog("TERMINAL", c || "Aucune donnee narrative.");
    },
  });

  const altarPos = placeIfWalkable(world.spawnX + 3, world.spawnY - 1, world.spawnX + 2, world.spawnY);
  state.entities.push({
    type: "altar",
    x: altarPos.x,
    y: altarPos.y,
    asset: "altar",
    blocking: true,
    interact: () => {
      if (!tutorialCanUseAltar()) {
        startDialog("TUTORIEL", TUTORIAL_STEPS[state.tutorial.step] || "Termine le tutoriel.");
        return;
      }
      openChoiceMenu(scene);
    },
  });

  const doorPos = placeIfWalkable(world.doorX, world.doorY, world.spawnX, world.spawnY - 12);
  state.entities.push({
    type: "door",
    x: doorPos.x,
    y: doorPos.y,
    asset: "door_closed",
    blocking: true,
    interact: () => {
      if (!tutorialCanUseDoor()) {
        startDialog("TUTORIEL", TUTORIAL_STEPS[state.tutorial.step] || "Termine le tutoriel.");
        return;
      }
      if (!state.hasVoted) {
        startDialog(
          "SYSTEM",
          "Porte verrouillee. Debats + indices ouvrent une synthese auto. Sinon vote manuel a l'autel.",
        );
        return;
      }
      markTutorialEvent("door_use");
      if (state.pendingDoorTarget) {
        loadLevel(state.pendingDoorTarget);
      } else {
        const next = nextSceneFallback();
        if (next) loadLevel(next);
      }
    },
  });

  const insightSpots = [
    placeIfWalkable(world.spawnX - 12, world.spawnY + 6, world.spawnX - 9, world.spawnY + 5),
    placeIfWalkable(world.spawnX + 11, world.spawnY + 5, world.spawnX + 8, world.spawnY + 4),
    placeIfWalkable(world.spawnX + 1, world.spawnY - 10, world.spawnX, world.spawnY - 9),
  ];
  insightSpots.forEach((pos, idx) => {
    state.entities.push({
      type: "insight",
      x: pos.x,
      y: pos.y,
      asset: idx % 2 === 0 ? "alt" : "computer",
      blocking: false,
      interact: () => {
        const self = state.entities.find((e) => e.type === "insight" && e.x === pos.x && e.y === pos.y && !e.removed);
        if (!self) return;
        self.removed = true;
        markTutorialEvent("insight_use");
        state.sceneProgress.insightsCollected += 1;
        const rewardText = grantInsightReward();
        addMessage(
          "system",
          `[SYSTEME] Module ${state.sceneProgress.insightsCollected}/${state.sceneProgress.insightsRequired} collecte. Recompense: ${rewardText}.`,
          state.currentChatTarget,
          true,
        );
        updateObjectiveInfo();
        maybeUnlockDoorByProgress("INDICE");
      },
    });
  });

  const propRng = createSeededRandom(hashStringSeed(`${targetId}|props|${state.currentTheme}`));
  const propCount = isTutorialLevel ? 52 : 40;
  for (let i = 0; i < propCount; i += 1) {
    const x = randomInt(propRng, 1, state.world.w - 2);
    const y = randomInt(propRng, 1, state.world.h - 2);
    if (!isTileWalkable(x, y)) continue;
    if (Math.abs(x - state.player.x) < 6 && Math.abs(y - state.player.y) < 5) continue;
    const nearCoreInteractable = state.entities.some((e) => Math.abs(e.x - x) + Math.abs(e.y - y) <= 1);
    if (nearCoreInteractable) continue;
    const roll = propRng();
    const asset = roll < 0.5 ? "alt" : roll < 0.82 ? "computer" : "liquid";
    state.entities.push({
      type: "prop",
      x,
      y,
      asset,
      blocking: false,
      interact: null,
    });
  }

  const narrativeText = `${safeText(scene?.narrative?.visual_cues)} ${safeText(scene?.narrative?.context)}`.trim();
  if (!isTutorialLevel && narrativeText && ensureSession(narratorId).length === 0) {
    addMessage("assistant", `*${narrativeText}*`, narratorId, true);
  }

  if (!isTutorialLevel && ensureSession(narratorId).length <= 1) {
    const introPrompt = `
ROLE: ${state.currentPersonas[narratorId].name || state.currentPersonas[narratorId].displayName}.
SCENE: "${safeText(scene?.narrative?.context) || safeText(scene?.theme)}".

TASK:
1) Welcome the mediator briefly.
2) Explain the conflict in a neutral and factual way.
3) Give one immediate decision axis.

FORMAT:
- French language.
- Max 65 words.
- One compact block.
`;
    await callBot(introPrompt, narratorId, true);
  }

  if (isTutorialLevel) {
    addMessage(
      "system",
      "[SYSTEME] Niveau tutoriel: maitrise commandes + modules, puis passe la porte nord.",
      narratorId,
      true,
    );
  } else {
    addMessage(
      "system",
      "[SYSTEME] Objectif: discuter, collecter des indices, puis trancher. Porte au nord.",
      narratorId,
      true,
    );
  }
  updateObjectiveInfo();
}

function startDialog(name, text) {
  state.isLocked = true;
  uiDialogName.textContent = name;
  uiDialogText.textContent = text;
  uiDialog.classList.remove("hidden");
}

function closeDialog() {
  state.isLocked = false;
  uiDialog.classList.add("hidden");
}

async function callAIInternal(systemPrompt) {
  let res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: CURRENT_MODEL, messages: [], system: systemPrompt }),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_e) {
    data = null;
  }

  if (!res.ok || !data?.reply) {
    res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [], system: systemPrompt }),
    });
    data = await res.json();
  }

  const reply = String(data?.reply || "").replace(/```json/g, "").replace(/```/g, "").trim();
  return reply;
}

async function callBot(systemPrompt, targetId, isIntro = false) {
  const history = ensureSession(targetId);
  const recentHistory = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-6);
  const messagesToSend = isIntro ? [] : recentHistory;
  const turnCount = state.sceneProgress.userTurns;

  const loadingId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  if (targetId === state.currentChatTarget) {
    renderChatLine("bot", "...");
    if (uiChatLog.lastElementChild) uiChatLog.lastElementChild.dataset.loadingId = loadingId;
  }

  try {
    let res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: CURRENT_MODEL, messages: messagesToSend, system: systemPrompt }),
    });
    let data = null;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch (_e) {
      data = null;
    }

    if (!res.ok || !data?.reply) {
      const fallbackRes = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: messagesToSend, system: systemPrompt }),
      });
      data = await fallbackRes.json();
    }

    const reply = safeText(data?.reply);
    const chunks = reply
      .split("###")
      .map((x) => x.trim())
      .filter((x) => x.replace(/[\s*]/g, "").length > 0)
      .slice(0, 2);

    if (targetId === state.currentChatTarget) {
      const loadingNode = [...uiChatLog.children].find((el) => el.dataset && el.dataset.loadingId === loadingId);
      if (loadingNode) loadingNode.remove();
    }

    if (!chunks.length) {
      addMessage("assistant", "Je reformule: precise ton choix moral et ses consequences.", targetId, true);
      return;
    }

    for (const rawChunk of chunks) {
      const cleaned = sanitizeReplyChunk(rawChunk, turnCount);
      const noLoop = avoidLoopReply(targetId, cleaned);
      addMessage("assistant", noLoop, targetId, true);
    }
  } catch (e) {
    if (targetId === state.currentChatTarget) {
      const loadingNode = [...uiChatLog.children].find((el) => el.dataset && el.dataset.loadingId === loadingId);
      if (loadingNode) loadingNode.remove();
    }
    addMessage("assistant", `Erreur IA: ${String(e.message || e)}`, targetId, true);
  }
}

async function checkDecisionMade(lastUserAction, theme, turnCount) {
  if (turnCount < 3) {
    return { status: "DEBATING" };
  }

  const lowerInput = safeText(lastUserAction).toLowerCase();
  const keywords = [
    "niveau suivant", "valid", "confirm", "choix fait", "decide", "decidee", "final",
    "passons", "oui", "ok", "daccord", "go", "je choisis", "cest bon", "allez",
    "refuse", "accepte", "accepter", "refuser", "je tranche", "ma decision",
  ];
  const hasKeyword = keywords.some((k) => lowerInput.includes(k));

  if (isTutorialActive() && !tutorialCanUseAltar()) {
    if (hasKeyword || turnCount >= state.sceneProgress.forceDecisionTurns - 1) {
      return {
        status: "TUTORIAL_BLOCK",
        reply: "Tutoriel actif: valide d'abord un vote a l'autel pour tester la fonction de decision.",
      };
    }
    return { status: "DEBATING" };
  }

  const scene = state.levelData || {};
  const exits = Array.isArray(scene.exits) ? scene.exits : [];
  const inferredExitId = chooseExitHeuristically(lastUserAction);

  const transcript = state.globalHistory
    .filter((h) => h.sceneId === state.currentSceneId)
    .map((h) => `${h.role}: ${h.content}`)
    .join("\n");

  if (!exits.length) {
    if (hasKeyword || turnCount >= state.sceneProgress.forceDecisionTurns) {
      return { status: "DECIDED", exitId: null };
    }
    try {
      const res = await callAIInternal(`
Analyze if the player has clearly made a final decision or is using an "ESQUIVE" (DODGE) strategy.
DODGE examples: refuses to choose, proposes a third way, asks a meta-question, tries to run away.

Theme: "${safeText(theme)}"
Player input: "${safeText(lastUserAction)}"
Transcript:
${transcript}

Reply ONLY JSON:
{"status":"DEBATING"} OR {"status":"DECIDED"} OR {"status":"DODGE", "reply": "Narrator comment on the dodge"}
`);
      const parsed = JSON.parse(res);
      return parsed;
    } catch (_e) {
      return { status: turnCount >= state.sceneProgress.forceDecisionTurns ? "DECIDED" : "DEBATING" };
    }
  }

  if (hasKeyword) {
    return { status: "DECIDED", exitId: inferredExitId || exits[0].id };
  }

  if (turnCount >= state.sceneProgress.forceDecisionTurns) {
    return { status: "DECIDED", exitId: inferredExitId || exits[0].id };
  }

  const exitPrompt = `POSSIBLE EXITS:\n${exits.map((e) => `- ID: "${e.id}" -> ${e.description}`).join("\n")}`;

  try {
    const res = await callAIInternal(`
ANALYZE PLAYER INPUT. Theme: "${safeText(theme)}"
PLAYER INPUT: "${safeText(lastUserAction)}"

${exitPrompt}

Has the player made a choice?
Or are they using an "ESQUIVE" (DODGE) strategy (refusal, creative alternative)?

Reply ONLY JSON:
{"status":"DECIDED","exitId":"ID"} OR {"status":"DODGE", "reply": "Narrator comment"} OR {"status":"DEBATING"}
`);
    const parsed = JSON.parse(res);
    if (parsed.status === "DECIDED") {
      const resolved = resolveExitById(parsed.exitId);
      return { status: "DECIDED", exitId: resolved?.id || inferredExitId || exits[0].id };
    }
    return parsed;
  } catch (_e) {
    return { status: "DEBATING" };
  }
}

function unlockDoor(targetSceneId) {
  state.hasVoted = true;
  state.pendingDoorTarget = targetSceneId || nextSceneFallback();
  const door = state.entities.find((e) => e.type === "door");
  if (door) door.asset = "door_open";
  updateObjectiveInfo();
  saveGame(); // Persist the unlocked state
}

async function checkAutoGreeting(personaId) {
  const session = ensureSession(personaId);
  if (session.length > 0) return;
  if (isTutorialActive()) {
    const scripted = personaId === "mentor_guide"
      ? "Etape active: reduis puis rouvre ce chat. Ensuite on passe au deplacement et aux modules."
      : "Modules concrets: le 1er debloque la minimap, les suivants donnent des charges /trancher.";
    addMessage("assistant", scripted, personaId, true);
    return;
  }
  const p = state.currentPersonas[personaId] || state.personas[personaId];
  const greetingPrompt = `
ROLE: ${p?.displayName || personaId}
CONTEXT: The mediator just turned to you in "${safeText(state.levelData?.theme)}".
ACTION: Introduce yourself briefly and give your first stance.
FORMAT: French, short (max 40 words).
`;
  await callBot(greetingPrompt, personaId, true);
}

async function sendPlayerAction(text) {
  if (!text) text = safeText(uiChatInput.value);
  if (!text) return;
  if (!state.currentChatTarget) {
    const first = Object.keys(state.currentPersonas)[0];
    if (!first) return;
    setChatTarget(first);
  }

  uiChatInput.value = "";
  addMessage("user", text, state.currentChatTarget, true);
  const normalizedInput = normalizeText(text);
  if (normalizedInput === "aide" || normalizedInput === "/aide") {
    addMessage(
      "system",
      "[SYSTEME] Commandes: /trancher (si charge dispo), E pour interagir, '-' pour reduire le chat.",
      state.currentChatTarget,
      true,
    );
    return;
  }
  if (normalizedInput === "trancher" || normalizedInput.startsWith("trancher ") || normalizedInput === "/trancher") {
    if (tryUseFastTrackCommand(normalizedInput.replace(/^\//, ""))) return;
  }
  markTutorialEvent("chat_send");
  state.globalHistory.push({
    sceneId: state.currentSceneId,
    role: "user",
    speakerName: "Joueur",
    content: text,
  });
  state.sceneProgress.userTurns += 1;
  state.sceneProgress.lastPlayerInput = text;
  updateObjectiveInfo();

  const turnCount = state.sceneProgress.userTurns;
  const activePersonas = state.currentPersonas;

  const decisionCheck = await checkDecisionMade(text, state.levelData?.theme, turnCount);

  if (decisionCheck.status === "DECIDED") {
    let target = null;
    const exits = Array.isArray(state.levelData?.exits) ? state.levelData.exits : [];
    if (exits.length) {
      const exit = exits.find((e) => e.id === decisionCheck.exitId) || exits[0];
      target = exit?.target || null;
      state.choiceHistory.push({ level: state.currentSceneId, decision: exit?.id || "AUTO" });
      addMessage("system", `[SYSTEME] Choix enregistre: ${exit?.id || "AUTO"}. Porte deverrouillee.`, state.currentChatTarget, true);
    } else {
      target = nextSceneFallback();
      state.choiceHistory.push({ level: state.currentSceneId, decision: "AUTO" });
      addMessage("system", "[SYSTEME] Decision enregistree. Porte deverrouillee.", state.currentChatTarget, true);
    }
    unlockDoor(target);
    return;
  }

  if (decisionCheck.status === "DODGE") {
    if (decisionCheck.reply) addMessage("system", decisionCheck.reply, state.currentChatTarget, true);
    const p = activePersonas[state.currentChatTarget];
    const dodgePrompt = `
CONTEXT: Player proposed a creative dodge: "${text}"
ROLE: ${p?.displayName || "Conseiller"}
React briefly to this unexpected approach, but keep focus on the dilemma.
French only. Max 40 words.
`;
    await callBot(dodgePrompt, state.currentChatTarget, false);
    return;
  }

  if (decisionCheck.status === "TUTORIAL_BLOCK") {
    if (decisionCheck.reply) addMessage("system", decisionCheck.reply, state.currentChatTarget, true);
    return;
  }

  const p = activePersonas[state.currentChatTarget];
  const debatePrompt = `
CONTEXT: Player said "${text}".
SCENE THEME: "${safeText(state.levelData?.theme)}"
CURRENT ROLE: ${p?.displayName || state.currentChatTarget}
BIO: ${safeText(p?.bio)}
OTHER ACTORS: ${Object.values(activePersonas).map((x) => x.name || x.displayName).join(", ")}
TURN: ${turnCount}

INSTRUCTIONS:
- Stay fully in character.
- If player digresses, refocus once, then provide a concrete argument.
- Add one NEW ethical angle (never repeat your previous framing).
- Prefer assertions over questions. At most one question every 3 turns.
- End with one actionable recommendation.
- French language.
FORMAT: Single compact block, max 60 words.
`;
  await callBot(debatePrompt, state.currentChatTarget, false);
  maybeUnlockDoorByProgress("PROGRESSION");
  updateObjectiveInfo();
}

function openChoiceMenu(scene) {
  if (!tutorialCanUseAltar()) {
    startDialog("TUTORIEL", TUTORIAL_STEPS[state.tutorial.step] || "Termine le tutoriel.");
    return;
  }

  const exits = Array.isArray(scene?.exits) ? scene.exits : [];
  if (!exits.length) {
    if (!state.hasVoted) {
      markTutorialEvent("altar_vote");
      unlockDoor(nextSceneFallback());
      addMessage("system", "[SYSTEME] Pas de vote explicite: synthese manuelle appliquee. Porte deverrouillee.", state.currentChatTarget, true);
    }
    startDialog("SYSTEM", "Synthese validee. La porte est ouverte.");
    return;
  }
  if (state.hasVoted) {
    startDialog("SYSTEM", "Vote deja enregistre.");
    return;
  }

  uiChoice.classList.remove("hidden");
  uiChoiceContainer.innerHTML = "";
  exits.forEach((exit) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.innerHTML = `<strong>${exit.id}</strong>${exit.description}`;
    btn.onclick = () => {
      uiChoice.classList.add("hidden");
      markTutorialEvent("altar_vote");
      unlockDoor(exit.target);
      addMessage("system", `[SYSTEME] Vote manuel: ${exit.id}. Porte deverrouillee.`, state.currentChatTarget, true);
      updateObjectiveInfo();
    };
    uiChoiceContainer.appendChild(btn);
  });
}

function setupInput() {
  window.addEventListener("keydown", (ev) => {
    if (document.activeElement === uiChatInput) return;
    state.input.keys[ev.key] = true;
    state.input.keys[ev.code] = true;
    if (ev.code === "Space" || ev.code === "KeyE") ev.preventDefault();
  });
  window.addEventListener("keyup", (ev) => {
    if (document.activeElement === uiChatInput) return;
    state.input.keys[ev.key] = false;
    state.input.keys[ev.code] = false;
  });
}

function updateEntities() {
  if (state.isChatting || state.isLocked) return;

  const now = Date.now();
  state.entities.forEach((e) => {
    if (e.type !== "npc" || e.removed) return;

    // Initialize AI state if missing
    if (!e.ai) e.ai = { nextMove: now + Math.random() * 2000 + 500, state: "idle" };
    if (e.pixelX === undefined) e.pixelX = e.x * TILE_SIZE;
    if (e.pixelY === undefined) e.pixelY = e.y * TILE_SIZE;

    // Smooth movement logic (like player)
    const tx = e.x * TILE_SIZE;
    const ty = e.y * TILE_SIZE;
    const speed = 2; // NPC walking speed

    if (e.pixelX !== tx || e.pixelY !== ty) {
      if (e.pixelX < tx) e.pixelX = Math.min(e.pixelX + speed, tx);
      if (e.pixelX > tx) e.pixelX = Math.max(e.pixelX - speed, tx);
      if (e.pixelY < ty) e.pixelY = Math.min(e.pixelY + speed, ty);
      if (e.pixelY > ty) e.pixelY = Math.max(e.pixelY - speed, ty);
      return; // Don't pick new move while moving
    }

    if (now > e.ai.nextMove) {
      // 30% chance to move, 70% to stay idle longer
      if (Math.random() < 0.3) {
        const dirs = [
          { dx: 0, dy: -1, dir: "up" },
          { dx: 0, dy: 1, dir: "down" },
          { dx: -1, dy: 0, dir: "left" },
          { dx: 1, dy: 0, dir: "right" }
        ];
        const dir = dirs[Math.floor(Math.random() * dirs.length)];
        const nx = e.x + dir.dx;
        const ny = e.y + dir.dy;

        // Check bounds, walls, and other entities
        if (worldInBounds(nx, ny) && isTileWalkable(nx, ny) && !isBlockingEntityAt(nx, ny)) {
          // Check zone boundary if assigned
          let inZone = true;
          if (e.allowedRect) {
            const z = e.allowedRect;
            const x0 = Math.floor(z[0] * state.world.w);
            const y0 = Math.floor(z[1] * state.world.h);
            const x1 = Math.floor(z[2] * state.world.w);
            const y1 = Math.floor(z[3] * state.world.h);
            if (nx < x0 || nx > x1 || ny < y0 || ny > y1) inZone = false;
          }

          if (inZone && (nx !== state.player.x || ny !== state.player.y)) {
            e.x = nx;
            e.y = ny;
            e.dir = dir.dir;
          }
        }
      }
      e.ai.nextMove = now + Math.random() * 4000 + 2000;
    }
  });
}

function tryInteract() {
  const target = getAdjacentInteractable();
  if (target?.interact) target.interact();
}

function update() {
  updateEntities();
  if (state.isLocked) {
    if (state.input.keys[" "]) {
      state.input.keys[" "] = false;
      closeDialog();
    }
    return;
  }
  if (state.isChatting) return;

  const p = state.player;
  const targetX = p.x * TILE_SIZE;
  const targetY = p.y * TILE_SIZE;

  if (p.pixelX !== targetX || p.pixelY !== targetY) {
    p.isMoving = true;
    if (p.pixelX < targetX) p.pixelX = Math.min(p.pixelX + MOVE_SPEED, targetX);
    if (p.pixelX > targetX) p.pixelX = Math.max(p.pixelX - MOVE_SPEED, targetX);
    if (p.pixelY < targetY) p.pixelY = Math.min(p.pixelY + MOVE_SPEED, targetY);
    if (p.pixelY > targetY) p.pixelY = Math.max(p.pixelY - MOVE_SPEED, targetY);
  } else {
    p.isMoving = false;
    let dx = 0;
    let dy = 0;
    if (state.input.keys.ArrowUp || state.input.keys.w) dy -= 1;
    if (state.input.keys.ArrowDown || state.input.keys.s) dy += 1;
    if (state.input.keys.ArrowLeft || state.input.keys.a) dx -= 1;
    if (state.input.keys.ArrowRight || state.input.keys.d) dx += 1;

    if (dx !== 0 || dy !== 0) {
      if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) p.dir = dx < 0 ? "left" : "right";
      else if (dy !== 0) p.dir = dy < 0 ? "up" : "down";
    }

    if (dx !== 0 || dy !== 0) {
      let moved = false;
      if (dx !== 0 && dy !== 0) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        const canDiag = worldInBounds(nx, ny)
          && isTileWalkable(nx, ny)
          && isTileWalkable(p.x + dx, p.y)
          && isTileWalkable(p.x, p.y + dy);

        if (canDiag) {
          p.x = nx;
          p.y = ny;
          moved = true;
        } else if (worldInBounds(p.x + dx, p.y) && isTileWalkable(p.x + dx, p.y)) {
          p.x += dx;
          moved = true;
        } else if (worldInBounds(p.x, p.y + dy) && isTileWalkable(p.x, p.y + dy)) {
          p.y += dy;
          moved = true;
        }
      } else {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (worldInBounds(nx, ny) && isTileWalkable(nx, ny)) {
          p.x = nx;
          p.y = ny;
          moved = true;
        }
      }

      if (moved) {
        markTutorialEvent("move_tile");
      }
    }
  }

  if ((state.input.keys.KeyE || state.input.keys.e || state.input.keys.E) && !p.isMoving) {
    state.input.keys.KeyE = false;
    state.input.keys.e = false;
    state.input.keys.E = false;
    tryInteract();
  }
}

function npcSheetIndex(entity) {
  const persona = state.currentPersonas[entity.personaId] || {};
  const archetype = safeText(persona.archetype).toUpperCase();
  const merged = normalizeText(`${persona.id || ""} ${persona.name || ""} ${persona.displayName || ""} ${persona.role || ""}`);

  let npcId = "";
  if (archetype === "A-1") npcId = "architecte";
  else if (archetype === "B-2") npcId = "poete";
  else if (archetype === "C-3") npcId = "sceptique";
  else if (merged.includes("architecte") || merged.includes("strateg")) npcId = "architecte";
  else if (merged.includes("poete") || merged.includes("idealiste")) npcId = "poete";
  else if (merged.includes("sceptique") || merged.includes("skeptic")) npcId = "sceptique";
  else npcId = "architecte";

  const npcList = Array.isArray(state.assets.npcManifest?.npcs) ? state.assets.npcManifest.npcs : [];
  if (npcList.length) {
    const idx = npcList.findIndex((n) => normalizeText(n.id) === normalizeText(npcId));
    if (idx >= 0) return idx;
  }
  if (npcId === "poete") return 1;
  if (npcId === "sceptique") return 2;
  return 0;
}

function drawNpcEntity(entity, camX, camY) {
  const bob = Math.sin(Date.now() * 0.005) * 2;
  const dx = (entity.pixelX ?? entity.x * TILE_SIZE) - camX;
  const dy = (entity.pixelY ?? entity.y * TILE_SIZE) - camY + bob;
  if (state.assets[entity.asset]) {
    // Prioritize theme-specific override if available (e.g. from applyThemeAssets)
    ctx.drawImage(state.assets[entity.asset], dx, dy, TILE_SIZE, TILE_SIZE);
    return;
  }

  if (!state.assets.useExternal || !state.assets.npc_sheet) {
    const fallback = state.assets[entity.asset];
    if (fallback) ctx.drawImage(fallback, dx, dy, TILE_SIZE, TILE_SIZE);
    return;
  }
  const idx = npcSheetIndex(entity);
  const sx = idx * 3 * SHEET_TILE;
  const sy = 0;
  ctx.drawImage(
    state.assets.npc_sheet,
    sx,
    sy,
    SHEET_TILE,
    SHEET_TILE,
    dx,
    dy,
    TILE_SIZE,
    TILE_SIZE,
  );
}

function drawPlayer(camX, camY) {
  const p = state.player;
  const drawX = p.pixelX - camX;
  const drawY = p.pixelY - camY;
  const bob = p.isMoving ? Math.sin(Date.now() / 50) * 2 : 0;

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(drawX + 20, drawY + 35, 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  if (state.assets.useExternal && state.assets.player_sheet) {
    const row = p.dir === "left" ? 1 : p.dir === "right" ? 2 : p.dir === "up" ? 3 : 0;
    const frame = p.isMoving ? Math.floor(Date.now() / 160) % 3 : 0;
    const preset = state.assets.playerPresetIndex || 0;
    const sx = (preset * 3 + frame) * SHEET_TILE;
    const sy = row * SHEET_TILE;
    ctx.drawImage(
      state.assets.player_sheet,
      sx,
      sy,
      SHEET_TILE,
      SHEET_TILE,
      drawX,
      drawY + bob,
      TILE_SIZE,
      TILE_SIZE,
    );
  } else {
    const pAsset = state.assets[`player_${p.dir}`] || state.assets.player_down;
    if (pAsset) ctx.drawImage(pAsset, drawX, drawY + bob, TILE_SIZE, TILE_SIZE);
  }
}

function drawMinimap() {
  if (!state.meta.modules.minimap) return;
  const mapW = 170;
  const mapH = 116;
  const ox = 12;
  const oy = canvas.height - mapH - 12;
  const sx = mapW / state.world.w;
  const sy = mapH / state.world.h;

  ctx.fillStyle = "rgba(4,10,16,0.86)";
  ctx.fillRect(ox, oy, mapW, mapH);
  ctx.strokeStyle = "#467099";
  ctx.lineWidth = 1;
  ctx.strokeRect(ox + 0.5, oy + 0.5, mapW - 1, mapH - 1);

  for (let y = 0; y < state.world.h; y += 1) {
    for (let x = 0; x < state.world.w; x += 1) {
      if (state.world.tiles[y]?.[x] === 1) {
        ctx.fillStyle = "rgba(94,130,160,0.55)";
        ctx.fillRect(ox + x * sx, oy + y * sy, Math.max(1, sx), Math.max(1, sy));
      }
    }
  }

  const visibleStartX = state.camera.x / TILE_SIZE;
  const visibleStartY = state.camera.y / TILE_SIZE;
  const visibleW = canvas.width / TILE_SIZE;
  const visibleH = canvas.height / TILE_SIZE;
  ctx.strokeStyle = "rgba(154,230,255,0.9)";
  ctx.strokeRect(
    ox + visibleStartX * sx,
    oy + visibleStartY * sy,
    visibleW * sx,
    visibleH * sy,
  );

  state.entities.filter((e) => !e.removed).forEach((e) => {
    if (e.type === "door") ctx.fillStyle = "#ffc857";
    else if (e.type === "npc") ctx.fillStyle = "#67e8f9";
    else if (e.type === "altar") ctx.fillStyle = "#d6a8ff";
    else if (e.type === "insight") ctx.fillStyle = "#86efac";
    else return;
    ctx.fillRect(ox + e.x * sx, oy + e.y * sy, Math.max(2, sx + 0.3), Math.max(2, sy + 0.3));
  });

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(ox + state.player.x * sx, oy + state.player.y * sy, Math.max(2, sx + 0.5), Math.max(2, sy + 0.5));
  ctx.fillStyle = "#9ec8eb";
  ctx.font = "11px Segoe UI";
  ctx.fillText("MINIMAP", ox + 6, oy + 12);
}

function draw() {
  updateCamera();
  const camX = state.camera.x;
  const camY = state.camera.y;

  ctx.fillStyle = "#020205";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  state.stars.forEach((s) => {
    const sx = ((s.x - (camX * 0.08)) % canvas.width + canvas.width) % canvas.width;
    const sy = ((s.y - (camY * 0.08)) % canvas.height + canvas.height) % canvas.height;
    ctx.fillRect(sx, sy, 1, 1);
    s.y = (s.y + s.speed) % canvas.height;
  });

  const startX = Math.max(0, Math.floor(camX / TILE_SIZE));
  const startY = Math.max(0, Math.floor(camY / TILE_SIZE));
  const endX = Math.min(state.world.w - 1, startX + VIEW_W + 1);
  const endY = Math.min(state.world.h - 1, startY + VIEW_H + 1);

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const dx = x * TILE_SIZE - camX;
      const dy = y * TILE_SIZE - camY;
      const isWall = state.world.tiles[y]?.[x] === 1;
      const cellTheme = state.world.themes?.[y]?.[x] || state.currentTheme;
      const themeSet = state.assets.themeTiles?.[cellTheme] || state.assets.themeTiles?.[state.currentTheme] || state.assets;
      const decoKey = state.world.deco[y]?.[x];

      if (decoKey && themeSet[decoKey]) {
        // Draw floor underneath decor
        if (themeSet.floor) ctx.drawImage(themeSet.floor, dx, dy, TILE_SIZE, TILE_SIZE);
        // Draw decor with bottom-center anchor to support larger assets
        const asset = themeSet[decoKey];
        if (asset) {
          const dw = asset.width;
          const dh = asset.height;
          // Align bottom-center of asset with bottom-center of tile
          const ox = dx + (TILE_SIZE - dw) / 2;
          const oy = dy + (TILE_SIZE - dh);
          ctx.drawImage(asset, ox, oy, dw, dh);
        }
      } else {
        const baseTile = isWall ? themeSet.wall : themeSet.floor;
        if (baseTile) ctx.drawImage(baseTile, dx, dy, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  const drawables = state.entities
    .filter((e) => !e.removed)
    .sort((a, b) => a.y - b.y);

  drawables.forEach((e) => {
    const ex = e.x * TILE_SIZE - camX;
    const ey = e.y * TILE_SIZE - camY;
    if (ex < -TILE_SIZE || ey < -TILE_SIZE || ex > canvas.width || ey > canvas.height) return;

    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(ex + 20, ey + 35, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (e.type === "npc") {
      drawNpcEntity(e, camX, camY);
    } else {
      const asset = state.assets[e.asset];
      if (asset) ctx.drawImage(asset, ex, ey, TILE_SIZE, TILE_SIZE);
    }
  });

  drawPlayer(camX, camY);

  if (state.currentTheme === "nature") {
    ctx.fillStyle = "rgba(20,60,20,0.08)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (state.currentTheme === "urbain") {
    ctx.fillStyle = "rgba(8,22,45,0.10)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (state.currentTheme === "laboratoire") {
    ctx.fillStyle = "rgba(28,40,48,0.08)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (state.currentTheme === "espace") {
    ctx.fillStyle = "rgba(40,20,16,0.10)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (state.currentTheme === "bureaucratie") {
    ctx.fillStyle = "rgba(48,38,14,0.08)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawMinimap();

  const target = getAdjacentInteractable();
  if (target && !state.isLocked && !state.isChatting) {
    uiPrompt.textContent = interactionLabel(target);
    uiPrompt.classList.remove("hidden");
    const px = target.x * TILE_SIZE - camX + (TILE_SIZE / 2);
    const py = target.y * TILE_SIZE - camY;
    uiPrompt.style.left = `${clamp(px, 70, canvas.width - 70)}px`;
    uiPrompt.style.top = `${clamp(py - 10, 35, canvas.height - 35)}px`;
  } else {
    uiPrompt.classList.add("hidden");
  }
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

async function init() {
  ensureChatUI();
  ensureObjectiveUI();
  ensureTutorialUI();
  setupInput();
  if (typeof collapseChatPanel === 'function') collapseChatPanel();

  // Load Language
  state.language = localStorage.getItem("rpg_lang") || "fr";
  const langSel = document.getElementById("language-select");
  if (langSel) langSel.value = state.language;
  // Apply language
  if (typeof window.changeLanguage === 'function') window.changeLanguage(state.language);


  await createAssets();

  if (state.assets.useExternal) {
    await showPlayerSelection();
  }

  for (let i = 0; i < 60; i += 1) {
    state.stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      speed: Math.random() * 0.5 + 0.1,
    });
  }

  try {
    const [scenario, personas] = await Promise.all([
      loadJson("../data/scenario.json"),
      loadJson("../data/personas.json"),
    ]);
    state.scenario = scenario;
    state.personas = mapPersonas(personas);
    Object.keys(state.personas).forEach((id) => ensureSession(id));

    const savedScene = loadSavedGame();
    await loadLevel(savedScene || state.scenario.start || "level_1");
    loop();
  } catch (e) {
    console.error("Init error:", e);
    uiChatLog.innerHTML = "";
    renderChatLine("system", `Erreur de chargement: ${String(e.message || e)}`);
  }
}

window.sendPlayerAction = sendPlayerAction;
window.sendUserMessage = sendPlayerAction;

// --- LANGUAGE ---
window.changeLanguage = (lang) => {
  state.language = lang;
  localStorage.setItem("rpg_lang", lang);

  // Refresh UI
  if (uiLevel) uiLevel.innerHTML = `${getText("level")}: ${state.levelData?.id || 1}`;

  // Refresh Tutorial if active
  if (state.tutorial.active) {
    const stepText = [getText("tutorial_move"), getText("tutorial_interact"), getText("tutorial_chat")];
    if (uiTutorialText) uiTutorialText.textContent = stepText[state.tutorial.step] || "...";
  }

  // Refresh Intro if visible
  const intro = document.getElementById("intro-overlay");
  if (intro && intro.style.display !== "none") {
    intro.querySelector("h1").textContent = getText("intro_title");
    intro.querySelector("p").innerText = getText("intro_continue");
  }

  // Refresh Player Selection if visible
  const selBtn = document.getElementById("start-game-btn");
  if (selBtn) selBtn.textContent = getText("start_game");

  const selTitle = document.querySelector(".selection-modal h2");
  if (selTitle) selTitle.textContent = getText("select_mediator");
};

// Expose state for debugging
window.state = state;

init();


