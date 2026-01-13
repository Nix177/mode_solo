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
    if (!PLAYED_SCENES.includes(sceneId)) PLAYED_SCENES.push(sceneId);

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
    2. Adapte ton ton au profil du joueur.
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
    // Apply to game-container with a dark overlay for text readability
    // Note: The browser handles mismatched extensions (jpg inside png) fine mostly.
    if (ui.screen) {
        ui.screen.style.background = `
            linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.8) 100%),
            url('${bgUrl}') center/cover no-repeat
        `;
    }
}

function renderInterface(scene) {
    // Show Scene Count instead of Level Number since it's non-linear
    const stepCount = PLAYED_SCENES.length;
    let html = `
        <div class="slide-content" style="margin-bottom: 20px; padding: 20px;">
            <h1 style="font-size:1.2em; color:#ddd; text-transform:uppercase; margin:0;">
                Séquence ${stepCount}
            </h1>
        </div>

        <div class="chat-box">
            <div id="chat-scroll" class="chat-messages"></div>
        </div>
    `;
    ui.screen.innerHTML = html;
}

// 4. PLAYER ACTION & AI ROUTER
window.sendPlayerAction = async function (text) {
    if (!text) {
        const inputEl = document.getElementById('player-input');
        text = inputEl ? inputEl.value.trim() : "";
        if (inputEl) inputEl.value = '';
    }
    if (!text || !CURRENT_CHAT_TARGET) return;

    addMessageToUI('user', text, null);

    if (!CHAT_SESSIONS[CURRENT_CHAT_TARGET]) CHAT_SESSIONS[CURRENT_CHAT_TARGET] = [];
    CHAT_SESSIONS[CURRENT_CHAT_TARGET].push({ role: "user", content: text });

    // SAFETY MECHANISM: If debate is too long (> 3 turns), force decision check to be very lenient
    const turnCount = CHAT_SESSIONS[CURRENT_CHAT_TARGET].filter(m => m.role === 'user').length;

    // --- CHECK FOR END OF LEVEL ---
    const decisionCheck = await checkDecisionMade(text, CURRENT_SCENE.theme, turnCount);

    if (decisionCheck.status === "DECIDED") {
        addMessageToUI('bot', `[SYSTÈME] : Choix enregistré.`, CURRENT_CHAT_TARGET);

        await updatePlayerProfile(text, CURRENT_SCENE.theme);
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
    const isLateGame = turnCount >= 3;
    const debatePrompt = `
    JOUEUR : "${text}".
    SCENARIO : "${CURRENT_SCENE.theme}".
    PERSONA : ${GAME_DATA.personas[CURRENT_CHAT_TARGET].bio}
    PROFIL JOUEUR : "${PLAYER_PROFILE.summary}"
    
    OBJECTIF :
    ${isLateGame ? "- Le débat s'éternise. Sois plus tranchant : demande une décision finale." : "- Challenge la position du joueur. Cherche la faille."}
    - Sois court (1-2 phrases). Style naturel.
    `;

    await callBot(debatePrompt, CURRENT_CHAT_TARGET);
};
window.sendUserMessage = window.sendPlayerAction;

// --- AI FUNCTIONS ---

async function checkDecisionMade(lastUserAction, theme, turnCount) {
    // If turns > 4, almost anything counts as a decision to avoid getting stuck
    const leniency = turnCount > 4 ? "VERY LENIENT: If the player seems tired, repeats themselves, or gives ANY opinion, count as DECIDED." : "NORMAL";

    try {
        const res = await callAIInternal(`
            ANALYZE PLAYER INPUT. Theme: "${theme}". Input: "${lastUserAction}".
            Mode: ${leniency}
            
            Did the player make a choice, express a preference, OR reject the premise?
            Even if they just say "I agree", "No", "Do it", "Impossible", it is a DECISION.
            Only return "DEBATING" if they are explicitly asking a question to the bot.
            
            Reply ONLY JSON: { "status": "DECIDED" | "DEBATING" }
        `);
        return JSON.parse(res);
    } catch (e) {
        // If API fails, default to debating unless very late game
        return { status: turnCount > 6 ? "DECIDED" : "DEBATING" };
    }
}

async function updatePlayerProfile(lastArgument, theme) {
    const prompt = `
    ANALYSE PSYCHO-PHILOSOPHIQUE.
    Ancien Profil: "${PLAYER_PROFILE.summary}"
    Thème : "${theme}"
    Dernière position du joueur : "${lastArgument}"
    
    Tâche : Mets à jour le résumé du profil du joueur en 1 phrase courte.
    Concentre-toi sur ses valeurs.
    
    Réponds UNIQUEMENT le nouveau résumé texte.
    `;

    try {
        const newSummary = await callAIInternal(prompt);
        console.log("Updated Profile:", newSummary);
        PLAYER_PROFILE.summary = newSummary;
    } catch (e) { console.error(e); }
}

async function pickNextScene() {
    // Get list of unplayed scenes
    const allIds = Object.keys(GAME_DATA.scenario.scenes);
    const available = allIds.filter(id => !PLAYED_SCENES.includes(id));

    if (available.length === 0) return null;

    // Send a simplified list to the AI
    const options = available.map(id => {
        return { id: id, theme: GAME_DATA.scenario.scenes[id].theme };
    }).slice(0, 15);

    const prompt = `
    MAÎTRE DU JEU.
    Profil Joueur : "${PLAYER_PROFILE.summary}".
    Scénarios Déjà Joués : ${PLAYED_SCENES.length}.
    
    Options disponibles :
    ${JSON.stringify(options)}
    
    MISSION : Choisis le prochain scénario pour CHALLENGER ce joueur.
    - Cherche la variété thématique.
    
    Réponds UNIQUEMENT l'ID du scénario (ex: "level_12").
    `;

    try {
        let bestId = await callAIInternal(prompt);
        bestId = bestId.trim().replace(/['"]/g, '');
        if (!APP_EXISTS(bestId, available)) return available[0].id; // Fix: Access .id property
        return bestId;
    } catch (e) {
        console.error(e);
        return available[0].id;
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
        if (loader) loader.remove();

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
window.openSideChat = function (personaId) {
    const p = GAME_DATA.personas[personaId];
    CURRENT_CHAT_TARGET = personaId;
    if (ui.modal) ui.modal.style.display = 'flex';
}
window.closeSideChat = function () {
    if (ui.modal) ui.modal.style.display = 'none';
    CURRENT_CHAT_TARGET = "A-1";
}

init();
