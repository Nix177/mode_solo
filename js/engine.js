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
    traits: {}
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

        // Start with the defined start scene, or pick one dynamically
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
    // Petit fix pour gérer le saut manuel par numéro (ex: "2" -> "level_2")
    let targetId = sceneId;
    if (!GAME_DATA.scenario.scenes[targetId] && GAME_DATA.scenario.scenes[`level_${targetId}`]) {
        targetId = `level_${targetId}`;
    }

    const scene = GAME_DATA.scenario.scenes[targetId];
    if (!scene) return alert("FIN DE LA SIMULATION (ou Scène introuvable)");

    console.log(`Loading scene: ${targetId}`);
    CURRENT_SCENE = scene;
    if (!PLAYED_SCENES.includes(targetId)) PLAYED_SCENES.push(targetId);

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

// --- AJOUT : FONCTION ADMIN POUR SAUTER DE NIVEAU ---
window.manualLevelJump = function() {
    const target = prompt("ADMIN - Aller à la scène ID (ex: level_2) :");
    if (target) loadScene(target);
}

window.loadScene = loadScene;

// 3. DISPLAY
function updateBackground(bgUrl) {
    if (ui.screen && bgUrl) {
        ui.screen.style.background = `
            linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.8) 100%),
            url('${bgUrl}') center/cover no-repeat
        `;
    }
}

function renderInterface(scene) {
    const stepCount = PLAYED_SCENES.length;
    
    // Récupération Avatar pour le Header
    const p = GAME_DATA.personas[CURRENT_CHAT_TARGET];
    const avatarUrl = (p && p.avatar) ? p.avatar : 'assets/avatar_architecte.png';
    const name = p ? p.displayName : 'Système';

    // MODIFICATION : Header avec Avatar + Titre cliquable (Admin)
    let html = `
        <div class="slide-content" style="margin-bottom: 20px; padding: 20px; cursor:pointer;" onclick="window.manualLevelJump()" title="Admin: Changer de scène">
            <h1 style="font-size:1.2em; color:#ddd; text-transform:uppercase; margin:0;">
                Séquence ${stepCount} <span style="font-size:0.8em; opacity:0.5;">(⚙️)</span>
            </h1>
        </div>

        <div class="chat-box">
            <div class="avatar-header" style="display:flex; align-items:center; gap:15px; padding:15px; border-bottom:1px solid rgba(255,255,255,0.1);">
                <img src="${avatarUrl}" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border:2px solid #ff8800;">
                <h3 style="margin:0; color:#ff8800; font-size:1.2em;">${name}</h3>
            </div>
            <div id="chat-scroll" class="chat-messages" style="padding:15px;"></div>
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
                showGameSummary();
            }
        }, 3000);
        return;
    }

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

// --- END GAME SUMMARY ---
async function showGameSummary() {
    ui.screen.innerHTML = `
        <div class="slide-content" style="text-align:center;">
            <h1>COMPILATION DES RÉSULTATS...</h1>
            <p>L'IA interprète vos choix et les statistiques...</p>
        </div>`;

    const prompt = `
    RÔLE : OBSERVATEUR ANALYTIQUE DE DONNÉES.
    DONNÉES DE SESSION :
    - Profil des choix enregistrés : "${PLAYER_PROFILE.summary}".
    - Nombre de scénarios joués : ${PLAYED_SCENES.length}.
    
    TÂCHE : Rédige une synthèse interprétative de la partie (150 mots max) pour le joueur.
    1. Résume les grandes tendances de ses réponses (ex: "préférence pour le collectif", "pragmatisme inflexible", etc.).
    2. Mentionne comment ses choix ont évolué au fil des scénarios.
    3. Utilise un ton neutre, factuel et légèrement ludique. Ce n'est PAS un diagnostic psychologique, mais un bilan de jeu.
    
    Format : HTML simple (sans balises <html>, juste <p>, <h2>, etc).
    `;

    try {
        const report = await callAIInternal(prompt);
        ui.screen.innerHTML = `
            <div class="slide-content" style="max-width: 800px; text-align: left; overflow-y:auto; max-height:80vh;">
                <h1 style="color: #4cd137;">Synthèse de la Session</h1>
                <div style="background: rgba(0,0,0,0.3); padding: 25px; border-radius: 8px; margin-top:20px; line-height: 1.6; font-size: 1.1em;">
                    ${report}
                </div>
                <div style="text-align:center; margin-top:30px;">
                    <button onclick="location.reload()" style="padding: 15px 30px; cursor:pointer; background:#ddd; color:#000; border:none; border-radius:4px; font-weight:bold;">Recommencer</button>
                </div>
            </div>
        `;
    } catch (e) {
        ui.screen.innerHTML = "<div class='slide-content'><h1>Erreur de génération du rapport.</h1></div>";
    }
}

// --- AI FUNCTIONS ---

async function checkDecisionMade(lastUserAction, theme, turnCount) {
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
        return { status: turnCount > 6 ? "DECIDED" : "DEBATING" };
    }
}

async function updatePlayerProfile(lastArgument, theme) {
    const prompt = `
    SUIVI DES CHOIX DU JOUEUR.
    Historique des choix : "${PLAYER_PROFILE.summary}"
    Thème du scénario : "${theme}"
    Décision/Position du joueur : "${lastArgument}"
    
    Tâche : Mets à jour le résumé narratif des choix du joueur.
    Sois factuel. Décris la tendance qui se dégage (ex: "Tend à privilégier la sécurité sur la liberté").
    
    Réponds UNIQUEMENT le nouveau résumé texte (max 1 phrase).
    `;

    try {
        const newSummary = await callAIInternal(prompt);
        console.log("Updated Profile:", newSummary);
        PLAYER_PROFILE.summary = newSummary;
    } catch (e) { console.error(e); }
}

async function pickNextScene() {
    const allIds = Object.keys(GAME_DATA.scenario.scenes);
    const available = allIds.filter(id => !PLAYED_SCENES.includes(id));

    if (available.length === 0) return null;

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
        if (!APP_EXISTS(bestId, available)) return available[0].id;
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
        // Chargement AVEC Avatar
        const loadingHTML = buildMsgHTML('bot', '...', targetId)
            .replace('msg-bubble', 'msg-bubble loading')
            .replace('class="msg-row bot"', `id="${loadingId}" class="msg-row bot"`);
        container.innerHTML += loadingHTML;
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

// MODIFICATION : Style CSS-in-JS pour alignement Avatar + Bulle
function buildMsgHTML(role, text, personaId) {
    const isUser = role === 'user';
    let avatarImg = '';
    
    if (!isUser && personaId) {
        const p = GAME_DATA.personas[personaId];
        const url = (p && p.avatar) ? p.avatar : 'assets/avatar_architecte.png';
        avatarImg = `<img src="${url}" style="width:40px; height:40px; border-radius:50%; margin-right:10px; border:2px solid #ff8800; object-fit:cover; flex-shrink:0;">`;
    }
    
    return `
    <div class="msg-row ${isUser ? 'user' : 'bot'}" style="display:flex; align-items:flex-start; margin-bottom:10px; ${isUser ? 'justify-content:flex-end;' : ''}">
        ${!isUser ? avatarImg : ''} 
        <div class="msg-bubble" style="${!isUser ? 'background:#4a3b2a; border-left:4px solid #ff8800; color:white; padding:10px; border-radius:10px; max-width:80%;' : 'background:#333; color:#ddd; padding:10px; border-radius:10px; max-width:80%;'}">${text}</div>
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

// MODIFICATION : Avatar dans le titre de la modale
window.openSideChat = function (personaId) {
    const p = GAME_DATA.personas[personaId];
    CURRENT_CHAT_TARGET = personaId;
    if (ui.modal) {
        const avatarUrl = (p && p.avatar) ? p.avatar : 'assets/avatar_architecte.png';
        ui.modalTitle.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${avatarUrl}" style="width:30px; height:30px; border-radius:50%; border:1px solid #ff8800; object-fit:cover;">
                <span>${p.displayName}</span>
            </div>
        `;
        ui.modal.style.display = 'flex';
    }
}

window.closeSideChat = function () {
    if (ui.modal) ui.modal.style.display = 'none';
    CURRENT_CHAT_TARGET = "A-1";
}

init();
