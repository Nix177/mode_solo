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
    console.log("Starting Philosophical Engine...");
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

    renderInterface(scene, "Chargement du dossier...", gmPersonaId);

    // --- PROMPT DE GÉNÉRATION DE DILEMME (PAS D'AVENTURE) ---
    const generationPrompt = `
    TU ES UN SIMULATEUR DE GESTION ET D'ÉTHIQUE.
    NIVEAU ${CURRENT_LEVEL_NUMBER}. THÈME : "${scene.theme}".
    
    TA MISSION :
    1. Présente la situation comme un dossier politique ou social complexe.
    2. Expose le conflit : il y a deux "bonnes" raisons qui s'opposent (ex: Progrès vs Tradition, Sécurité vs Liberté).
    3. Il ne doit PAS y avoir de "bonne" réponse évidente.
    4. Ne demande pas "Que faites-vous ?" comme dans un RPG d'action.
    5. Demande plutôt : "Quelle est votre position ?" ou "Comment tranchez-vous ce conflit ?"
    
    INTERDIT : Ne parle pas de monstres, d'armes, ou de survie physique immédiate. Parle de conséquences à long terme, de sociologie et de morale.
    `;

    CHAT_SESSIONS[gmPersonaId] = []; 
    await callBot(generationPrompt, gmPersonaId, true);
}

window.loadScene = loadScene; 

// 3. DISPLAY
function updateBackground(bgUrl) {
    const bg = document.getElementById('game-container');
    // On garde l'image précédente si la nouvelle n'existe pas encore pour éviter le clignotement noir
    const img = new Image();
    img.src = bgUrl;
    img.onload = () => document.body.style.backgroundImage = `url('${bgUrl}')`;
}

function renderInterface(scene, placeholderText, personaId) {
    const p = GAME_DATA.personas[personaId];
    const avatarUrl = p ? p.avatar : 'assets/avatar_architecte.png';

    let html = `
        <div class="slide-content" style="margin-bottom: 20px;">
            <h1 style="font-size:1.5em; color:#ddd; text-transform:uppercase;">Dossier N°${CURRENT_LEVEL_NUMBER}</h1>
            <p style="font-style:italic; color:#aaa;">Sujet : ${scene.theme}</p>
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

    // --- ANALYSE : EST-CE UNE DÉCISION TRANCHÉE ? ---
    const routerCheck = await checkDecisionMade(text, CURRENT_SCENE.theme);
    
    if (routerCheck.status === "DECIDED") {
        addMessageToUI('bot', `[SIMULATION] : Choix enregistré. Conséquence : ${routerCheck.reason}`, CURRENT_CHAT_TARGET);
        setTimeout(() => {
            CURRENT_LEVEL_NUMBER++;
            const nextLevelId = `level_${CURRENT_LEVEL_NUMBER}`;
            loadScene(nextLevelId);
        }, 4000);
        return;
    } 
    
    // Si débat en cours
    const debatePrompt = `
    Le joueur a dit : "${text}".
    Sujet : "${CURRENT_SCENE.theme}".
    Ton Rôle : ${GAME_DATA.personas[CURRENT_CHAT_TARGET].bio}
    
    Réponds sur le fond.
    - Si l'argument du joueur est simpliste, montre la complexité (effets pervers, coût humain).
    - Si l'argument est solide, challenge-le sur une autre valeur (ex: "C'est efficace, mais est-ce juste ?").
    - Reste un conseiller. Ne prends pas la décision à sa place.
    `;

    await callBot(debatePrompt, CURRENT_CHAT_TARGET);
};
window.sendUserMessage = window.sendPlayerAction;

// --- FONCTIONS IA ---

async function checkDecisionMade(lastUserAction, theme) {
    // Vérifie si le joueur a tranché le débat ou s'il pose encore des questions
    try {
        const res = await fetch(`${API_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [],
                system: `
                ANALYZE PLAYER INPUT in a Debate Context.
                Theme: "${theme}".
                Input: "${lastUserAction}".
                
                Did the player make a FINAL DECISION or TAKE A CLEAR STANCE to resolve the dilemma?
                OR are they still arguing, asking questions, or deliberating?
                
                Reply ONLY JSON:
                { "status": "DECIDED" | "DEBATING", "reason": "1 sentence consequence prediction" }
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
        const messagesToSend = isIntro ? [] : history;

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
// Modal logic same as before...
window.openSideChat = function(personaId) {
    const p = GAME_DATA.personas[personaId];
    CURRENT_CHAT_TARGET = personaId;
    if (ui.modal) ui.modal.style.display = 'flex';
    // Clean history for modal if needed or sync
}
window.closeSideChat = function() {
    if (ui.modal) ui.modal.style.display = 'none';
    CURRENT_CHAT_TARGET = "A-1"; // Retour au main speaker
}

init();
