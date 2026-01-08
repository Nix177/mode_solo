import { API_BASE } from "../assets/config.js";

// --- GAME STATE ---
let GAME_DATA = {};
let CURRENT_SCENE = null;
let CHAT_SESSIONS = {};
let CURRENT_CHAT_TARGET = null;
let CURRENT_LEVEL_NUMBER = 1;

// --- DOM ELEMENTS ---
const ui = {
    screen: document.getElementById('game-container'),
    roster: document.getElementById('roster-bar'),
    modal: document.getElementById('side-chat-modal'),
    modalScroll: document.getElementById('modal-chat-scroll'),
    modalTitle: document.getElementById('modal-title')
};

// 1. INITIALIZATION
async function init() {
    console.log("Starting Philosophical Engine (Concise Mode)...");
    try {
        const loadFile = async (path) => {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`Missing file: ${path}`);
            return await res.json();
        };

        const [scenario, personas] = await Promise.all([
            loadFile('data/scenario.json'),
            loadFile('data/personas.json')
        ]);

        GAME_DATA = { scenario, personas: mapPersonas(personas) };
        Object.keys(GAME_DATA.personas).forEach(id => CHAT_SESSIONS[id] = []);
        renderRoster();
        loadScene(GAME_DATA.scenario.start);

    } catch (e) {
        console.error("Error:", e);
    }
}

function mapPersonas(list) {
    const map = {};
    list.forEach(p => map[p.id] = p);
    return map;
}

// 2. SCENE ENGINE
async function loadScene(sceneId) {
    const scene = GAME_DATA.scenario.scenes[sceneId];
    if (!scene) return alert("FIN DE LA SIMULATION");

    CURRENT_SCENE = scene;
    updateBackground(scene.background);
    
    // On utilise A-1 par défaut pour poser le problème
    const gmPersonaId = "A-1"; 
    CURRENT_CHAT_TARGET = gmPersonaId;

    renderInterface(scene, gmPersonaId);

    // --- PROMPT DE GÉNÉRATION (CONCIS) ---
    const generationPrompt = `
    TU ES UN SIMULATEUR DE DILEMMES ÉTHIQUES.
    NIVEAU ${CURRENT_LEVEL_NUMBER}. THÈME : "${scene.theme}".
    
    TA MISSION :
    1. Pose le décor en 2 phrases maximum.
    2. Souligne l'incertitude ou le conflit (on ne sait pas qui a raison).
    3. Termine par une question courte : "Quelle est votre position ?"
    
    CONTRAINTES STRICTES :
    - Sois très CONCIS (max 40 mots). Comme un message de chat.
    - Ne donne PAS tous les arguments maintenant. Garde-les pour la discussion.
    - Ton ton est neutre et interrogatif.
    `;

    CHAT_SESSIONS[gmPersonaId] = []; 
    await callBot(generationPrompt, gmPersonaId, true);
}

window.loadScene = loadScene; 

// 3. DISPLAY
function updateBackground(bgUrl) {
    const img = new Image();
    img.src = bgUrl;
    img.onload = () => document.body.style.backgroundImage = `url('${bgUrl}')`;
}

function renderInterface(scene, personaId) {
    // Affiche juste le titre du dossier, pas de texte introductif long
    let html = `
        <div class="slide-content" style="margin-bottom: 20px; padding: 20px;">
            <h1 style="font-size:1.2em; color:#ddd; text-transform:uppercase; margin:0;">Dossier N°${CURRENT_LEVEL_NUMBER}</h1>
        </div>

        <div class="chat-box">
            <div id="chat-scroll" class="chat-messages"></div>
        </div>
    `;
    ui.screen.innerHTML = html;
}

// 4. ACTION JOUEUR & ANALYSE
window.sendPlayerAction = async function(text) {
    if (!text) {
         const inputEl = document.getElementById('player-input'); 
         text = inputEl ? inputEl.value.trim() : "";
         if(inputEl) inputEl.value = '';
    }
    if (!text || !CURRENT_CHAT_TARGET) return;

    addMessageToUI('user', text, null);
    
    if (!CHAT_SESSIONS[CURRENT_CHAT_TARGET]) CHAT_SESSIONS[CURRENT_CHAT_TARGET] = [];
    CHAT_SESSIONS[CURRENT_CHAT_TARGET].push({ role: "user", content: text });

    // --- ANALYSE DE DÉCISION ---
    const routerCheck = await checkDecisionMade(text, CURRENT_SCENE.theme);
    
    if (routerCheck.status === "DECIDED") {
        addMessageToUI('bot', `[SYSTÈME] : Choix enregistré. Conséquence estimée : ${routerCheck.reason}`, CURRENT_CHAT_TARGET);
        setTimeout(() => {
            CURRENT_LEVEL_NUMBER++;
            const nextLevelId = `level_${CURRENT_LEVEL_NUMBER}`;
            loadScene(nextLevelId);
        }, 4000);
        return;
    } 
    
    // --- DÉBAT (CONCIS) ---
    const debatePrompt = `
    Le joueur a dit : "${text}".
    Sujet : "${CURRENT_SCENE.theme}".
    Ton Rôle : ${GAME_DATA.personas[CURRENT_CHAT_TARGET].bio}
    
    CONSIGNES DE RÉPONSE :
    - Réponds en 1 ou 2 phrases maximum (style SMS/Chat).
    - Ne fais pas de longs discours.
    - Lance juste UN SEUL nouvel argument ou une question pour relancer le doute.
    - Si le joueur a un avis tranché, sème le doute sur l'efficacité réelle de sa solution.
    `;

    await callBot(debatePrompt, CURRENT_CHAT_TARGET);
};
window.sendUserMessage = window.sendPlayerAction;

// --- FONCTIONS IA ---

async function checkDecisionMade(lastUserAction, theme) {
    try {
        const res = await fetch(`${API_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [],
                system: `
                ANALYZE PLAYER INPUT. Theme: "${theme}". Input: "${lastUserAction}".
                Did the player make a FINAL DECISION to resolve the dilemma?
                Reply ONLY JSON: { "status": "DECIDED" | "DEBATING", "reason": "very short consequence" }
                `
            })
        });
        const data = await res.json();
        let cleanJson = data.reply.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        return { status: "DEBATING" };
    }
}

async function callBot(systemPrompt, targetId, isIntro = false) {
    const container = document.getElementById('chat-scroll');
    const loadingId = 'loading-' + Date.now();
    if (container) {
        container.innerHTML += buildMsgHTML('bot', '...', targetId).replace('msg-bubble', 'msg-bubble loading').replace('class="msg-row bot"', `id="${loadingId}" class="msg-row bot"`);
        container.scrollTop = container.scrollHeight;
    }

    try {
        const history = CHAT_SESSIONS[targetId] || [];
        // On garde un historique court pour éviter que l'IA ne radote
        const recentHistory = history.slice(-4); 
        const messagesToSend = isIntro ? [] : recentHistory;

        const res = await fetch(`${API_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: messagesToSend,
                system: systemPrompt,
                model: "gpt-4o-mini"
            })
        });
        const data = await res.json();
        
        const loader = document.getElementById(loadingId);
        if(loader) loader.remove();

        const reply = data.reply;
        addMessageToUI('bot', reply, targetId);
        
        if (!CHAT_SESSIONS[targetId]) CHAT_SESSIONS[targetId] = [];
        CHAT_SESSIONS[targetId].push({ role: "assistant", content: reply });

    } catch (e) {
        console.error(e);
    }
}

function addMessageToUI(role, text, personaId) {
    const container = document.getElementById('chat-scroll');
    if (!container) return;
    container.innerHTML += buildMsgHTML(role, text, personaId);
    container.scrollTop = container.scrollHeight;
}

function buildMsgHTML(role, text, personaId) {
    const isUser = role === 'user';
    let avatarImg = '';
    if (!isUser && personaId) {
        const p = GAME_DATA.personas[personaId];
        const url = (p && p.avatar) ? p.avatar : 'assets/avatar_architecte.png';
        avatarImg = `<img src="${url}" class="chat-avatar-img">`;
    }
    return `
    <div class="msg-row ${isUser ? 'user' : 'bot'}">
        ${!isUser ? avatarImg : ''} 
        <div class="msg-bubble">${text}</div>
    </div>`;
}

function renderRoster() {
    if (!ui.roster) return;
    ui.roster.innerHTML = '';
    Object.values(GAME_DATA.personas).forEach(p => {
        const div = document.createElement('div');
        div.className = 'roster-btn';
        div.style.backgroundImage = `url('${p.avatar}')`;
        div.onclick = () => openSideChat(p.id);
        div.innerHTML = `<div class="roster-tooltip">${p.displayName}</div>`;
        ui.roster.appendChild(div);
    });
}
window.openSideChat = function(personaId) {
    const p = GAME_DATA.personas[personaId];
    CURRENT_CHAT_TARGET = personaId;
    if (ui.modal) ui.modal.style.display = 'flex';
}
window.closeSideChat = function() {
    if (ui.modal) ui.modal.style.display = 'none';
    CURRENT_CHAT_TARGET = "A-1"; 
}

init();
