import { API_BASE } from "../assets/config.js";

// --- GAME STATE ---
let GAME_DATA = {};
let CURRENT_SCENE = null;
let CHAT_SESSIONS = {};
let CURRENT_CHAT_TARGET = null;

// New non-linear state
let PLAYED_SCENES = [];
let PLAYER_PROFILE = {
    summary: "Nouveau venu curieux.",
    traits: {} // ex: { "authority": -2, "technology": 5 }
};

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
    console.log("Starting Philosophical Engine (Dynamic Mode)...");
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
        
        // Start with the defined start scene, or pick one dynamically if start is generic
        const startId = GAME_DATA.scenario.start || "level_1";
        loadScene(startId);

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

    console.log(`Loading scene: ${sceneId}`);
    CURRENT_SCENE = scene;
    PLAYED_SCENES.push(sceneId);
    updateBackground(scene.background);
    
    // Default GM persona
    const gmPersonaId = "A-1"; 
    CURRENT_CHAT_TARGET = gmPersonaId;

    renderInterface(scene);

    // Dynamic Intro Generation based on Profile
    const introPrompt = `
    TU ES LE "DIRECTEUR" (A-1).
    CONTEXTE : Le joueur arrive dans le scénario : "${scene.theme}".
    PROFIL JOUEUR ACTUEL : "${PLAYER_PROFILE.summary}".
    
    TA MISSION :
    1. Présente le dilemme en 2 phrases max.
    2. Adapte ton ton au profil du joueur (ex: s'il est rebelle, sois plus autoritaire ou complice, selon ta stratégie).
    3. Termine par : "Quelle est votre position ?"
    
    CONTRAINTES :
    - Format court (Chat).
    - Pas de long monologue.
    `;

    CHAT_SESSIONS[gmPersonaId] = []; 
    await callBot(introPrompt, gmPersonaId, true);
}

window.loadScene = loadScene; 

// 3. DISPLAY
function updateBackground(bgUrl) {
    const img = new Image();
    img.src = bgUrl;
    img.onload = () => document.body.style.backgroundImage = `url('${bgUrl}')`;
}

function renderInterface(scene) {
    // Show Scene Count instead of Level Number since it's non-linear
    const stepCount = PLAYED_SCENES.length;
    let html = `
        <div class="slide-content" style="margin-bottom: 20px; padding: 20px;">
            <h1 style="font-size:1.2em; color:#ddd; text-transform:uppercase; margin:0;">
                Séquence ${stepCount} <span style="font-weight:normal; opacity:0.6;">// ${scene.id}</span>
            </h1>
        </div>

        <div class="chat-box">
            <div id="chat-scroll" class="chat-messages"></div>
        </div>
    `;
    ui.screen.innerHTML = html;
}

// 4. PLAYER ACTION & AI ROUTER
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

    // --- CHECK FOR END OF LEVEL ---
    // We check if the player has expressed a clear stance OR if they are stuck/asking to move on.
    const decisionCheck = await checkDecisionMade(text, CURRENT_SCENE.theme);
    
    if (decisionCheck.status === "DECIDED") {
        addMessageToUI('bot', `[SYSTÈME] : Analyse en cours...`, CURRENT_CHAT_TARGET);
        
        // 1. Analyze Moral Profile update
        await updatePlayerProfile(text, CURRENT_SCENE.theme);

        // 2. Pick next scene
        const nextSceneId = await pickNextScene();
        
        setTimeout(() => {
            if (nextSceneId) {
                loadScene(nextSceneId);
            } else {
                alert("Fin de la simulation. Merci.");
            }
        }, 3000);
        return;
    } 
    
    // --- DEBATE (Socratic) ---
    const debatePrompt = `
    JOUEUR : "${text}".
    SCENARIO : "${CURRENT_SCENE.theme}".
    PERSONA : ${GAME_DATA.personas[CURRENT_CHAT_TARGET].bio}
    PROFIL JOUEUR CONNU : "${PLAYER_PROFILE.summary}"
    
    OBJECTIF :
    - Challenge la position du joueur. Cherche la faille éthique.
    - Si le joueur est trop sûr de lui, introduis un doute.
    - Sois court (1-2 phrases). Style naturel.
    `;

    await callBot(debatePrompt, CURRENT_CHAT_TARGET);
};
window.sendUserMessage = window.sendPlayerAction;

// --- AI FUNCTIONS ---

async function checkDecisionMade(lastUserAction, theme) {
    try {
        const res = await callAIInternal(`
            ANALYZE PLAYER INPUT. Theme: "${theme}". Input: "${lastUserAction}".
            Did the player make a clear decision or express a firm stance that resolves the dilemma for them?
            Reply ONLY JSON: { "status": "DECIDED" | "DEBATING" }
        `);
        return JSON.parse(res);
    } catch (e) {
        return { status: "DEBATING" };
    }
}

async function updatePlayerProfile(lastArgument, theme) {
    // Analyze the whole conversation or just the conclusion to update the profile
    const prompt = `
    ANALYSE PSYCHO-PHILOSOPHIQUE.
    Ancien Profil: "${PLAYER_PROFILE.summary}"
    Thème : "${theme}"
    Dernière position du joueur : "${lastArgument}"
    
    Tâche : Mets à jour le résumé du profil du joueur en 1 phrase courte.
    Concentre-toi sur ses valeurs (ex: "Privilégie la sécurité collective au détriment de la liberté individuelle").
    
    Réponds UNIQUEMENT le nouveau résumé texte.
    `;
    
    try {
        const newSummary = await callAIInternal(prompt);
        console.log("Updated Profile:", newSummary);
        PLAYER_PROFILE.summary = newSummary;
    } catch(e) { console.error(e); }
}

async function pickNextScene() {
    // Get list of unplayed scenes
    const allIds = Object.keys(GAME_DATA.scenario.scenes);
    const available = allIds.filter(id => !PLAYED_SCENES.includes(id));
    
    if (available.length === 0) return null;

    // Pick a subset to avoid token limits if list is huge, or send all IDs + themes
    // We will send a simplified list to the AI
    const options = available.map(id => {
        return { id: id, theme: GAME_DATA.scenario.scenes[id].theme };
    }).slice(0, 15); // Limit to 15 options for analysis to be fast

    const prompt = `
    MAÎTRE DU JEU.
    Profil Joueur : "${PLAYER_PROFILE.summary}".
    Scénarios Déjà Joués : ${PLAYED_SCENES.length}.
    
    Options disponibles :
    ${JSON.stringify(options)}
    
    MISSION : Choisis le prochain scénario pour CHALLENGER ce joueur.
    - Si le joueur est trop utilitariste, trouve un scénario qui montre les limites de l'utilitarisme.
    - Cherche la variété thématique.
    
    Réponds UNIQUEMENT l'ID du scénario (ex: "level_12").
    `;

    try {
        let bestId = await callAIInternal(prompt);
        bestId = bestId.trim().replace(/['"]/g, '');
        // Fallback if AI hallucinates an ID
        if (!APP_EXISTS(bestId, available)) return available[0];
        return bestId;
    } catch (e) {
        console.error(e);
        return available[0]; // Fallback random/linear
    }
}

function APP_EXISTS(id, list) {
    return list.find(x => x.id === id);
}

// Low-level API call wrapper
async function callAIInternal(systemPrompt) {
    const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [],
            system: systemPrompt
        })
    });
    const data = await res.json();
    return data.reply.replace(/```json/g, '').replace(/```/g, '').trim();
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
        const recentHistory = history.slice(-6); 
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
