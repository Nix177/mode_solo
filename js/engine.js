import { API_BASE } from "../assets/config.js";

// --- GAME STATE ---
let GAME_DATA = {};
let CURRENT_SCENE = null;
let CHAT_SESSIONS = {};
let CURRENT_CHAT_TARGET = null;

// New non-linear state
let PLAYED_SCENES = [];
let GLOBAL_HISTORY = []; // Stores { sceneId, role, speakerName, content }
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

    // --- CLEANUP CHAT ---
    const chatContainer = document.getElementById('chat-scroll');
    if (chatContainer) chatContainer.innerHTML = '';

    // --- DETECT ACTIVE CHARACTERS ---
    // If scene has specific characters, use them. Otherwise default to generic personas.
    if (scene.narrative && scene.narrative.characters) {
        GAME_DATA.currentPersonas = {}; // Temporary override
        scene.narrative.characters.forEach(c => {
            GAME_DATA.currentPersonas[c.id] = { ...c, displayName: c.name + " (" + c.role + ")" };
        });

        // Define default speaker (first in list)
        var narratorId = scene.narrative.characters[0].id;
    } else {
        // Fallback to global personas
        GAME_DATA.currentPersonas = GAME_DATA.personas;
        var narratorId = "A-1";
    }

    CURRENT_CHAT_TARGET = narratorId;
    renderRoster(); // Re-render roster with new characters
    renderInterface(scene);

    // Narrative Intro Logic:
    // 1. Manually inject the Context + Visual Cues as a "System Narrative" message (no speaker)
    const contextMsg = `*${scene.narrative ? scene.narrative.visual_cues : ""} ${scene.narrative ? scene.narrative.context : scene.theme}*`;
    addMessageToUI('bot', contextMsg, null);

    // 2. Trigger the Character's Welcoming Speech
    const introPrompt = `
    RÔLE : ${GAME_DATA.currentPersonas[narratorId].name} (${GAME_DATA.currentPersonas[narratorId].role}).
    
    SCÉNARIO : "${scene.narrative ? scene.narrative.context : scene.theme}".
    PLAN NARRATIF : ${scene.narrative ? JSON.stringify(scene.narrative.steps) : "Improvise based on theme"}.
    
    MISSION DE DÉPART :
    1. Souhaite la bienvenue au "Médiateur" (le Joueur).
    2. Ouvre la conversation. Tu attends ses questions.
    3. NE DEMANDE PAS DE DÉCISION TOUT DE SUITE.
    
    TON : Immersif, cinématique, mais interactif.
    FORMAT : 
    - COUPE tes réponses en petits blocs (max 60 mots).
    - Sépare chaque bloc/bulle par le symbole "###".
    - POUR LES DESCRIPTIONS : Utilise la 3ème personne ("Il regarde...", "La foule crie...").
    - STRICTEMENT SÉPARER PAROLE ET NARRATION avec "###".
    - Pour la narration, entoure le texte d'étoiles *comme ceci* (ce sera affiché hors bulle).
    `;

    CHAT_SESSIONS[narratorId] = [];
    await callBot(introPrompt, narratorId, true);
}

// --- AJOUT : FONCTION ADMIN POUR SAUTER DE NIVEAU ---
window.manualLevelJump = function () {
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
    // Récupération Personas (Global ou Local)
    const activePersonas = GAME_DATA.currentPersonas || GAME_DATA.personas;
    const p = activePersonas[CURRENT_CHAT_TARGET];

    const avatarUrl = (p && p.avatar) ? p.avatar : 'assets/avatar_architecte.png';
    const name = p ? p.displayName : 'Système';

    // MODIFICATION : Header avec Avatar + Titre cliquable (Admin)
    let html = `
        <div class="header-bar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; padding: 0 20px;">
            <div onclick="window.manualLevelJump()" style="cursor:pointer;" title="Admin: Changer de scène">
                <h1 style="font-size:1.2em; color:#ddd; text-transform:uppercase; margin:0;">
                    Séquence ${stepCount} <span style="font-size:0.8em; opacity:0.5;">(⚙️)</span>
                </h1>
            </div>
            <div>
                <button onclick="window.viewProfile()" style="background:transparent; border:1px solid #ff8800; color:#ff8800; padding:5px 15px; cursor:pointer; font-size:0.8em; border-radius:20px;">
                    👁️ Voir ma synthèse
                </button>
            </div>
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

    // --- RECORD HISTORY ---
    GLOBAL_HISTORY.push({
        sceneId: CURRENT_SCENE.id,
        role: "user",
        speakerName: "Joueur",
        content: text
    });

    const turnCount = CHAT_SESSIONS[CURRENT_CHAT_TARGET].filter(m => m.role === 'user').length;

    const activePersonas = GAME_DATA.currentPersonas || GAME_DATA.personas;

    // --- CHECK FOR END OF LEVEL ---
    // Pass the narrative steps to the checker to see if we are deep enough
    const decisionCheck = await checkDecisionMade(text, CURRENT_SCENE.theme, turnCount);

    if (decisionCheck.status === "DECIDED") {
        addMessageToUI('bot', `[SYSTÈME] : Choix enregistré. Fin de séquence.`, CURRENT_CHAT_TARGET);

        await updatePlayerProfile(CURRENT_SCENE.theme);
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

    const isLateGame = turnCount >= 5;
    const debatePrompt = `
    CONTEXTE : Le joueur a dit : "${text}".
    SCÉNARIO : "${CURRENT_SCENE.theme}".
    RÔLE ACTUEL : ${activePersonas[CURRENT_CHAT_TARGET].displayName} (${activePersonas[CURRENT_CHAT_TARGET].bio}).
    AUTRES PERSOS PRÉSENTS : ${Object.values(activePersonas).map(p => p.name).join(', ')}.
    
    INSTRUCTIONS DYNAMIQUES :
    - Tu es ce personnage. Réagis avec TON caractère (Archetype).
    - MAÏEUTIQUE : Aide le joueur à développer sa pensée. Pose des questions ouvertes ("Pourquoi pensez-vous cela ?", "Et pour les locaux ?").
    - Ne sois pas juste "contre" ou "pour". Sois nuancé.
    - Si le joueur s'adresse à un autre personnage (ex: "Je demande à Elara"), mentionne-le brièvement (ex: "*Elara s'avance...*") ###.
    - Si le débat s'enlise (plus de 6 tours), alors rappelle l'urgence.
    ${isLateGame ? "- C'est la fin du temps imparti. Exige une décision." : "- Continue de creuser la position du joueur."}
    
    FORMAT :
    - Sépare tes idées en blocs courts (max 80 mots) avec "###".
    - Utilise *italique* de la 3ème personne pour les descriptions (hors bulle), séparées des dialogues par "###".
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
    DONNÉES DE SESSION COMPLÈTES (TRANSCRIPTION) :
    ${JSON.stringify(GLOBAL_HISTORY)}
    
    TÂCHE : Rédige une synthèse interprétative de la partie (200 mots max) pour le joueur.
    1. Analyse la cohérence de ses choix à travers les différents scénarios.
    2. Détecte ses contradictions ou ses évolutions morales.
    3. Cite des moments précis ("Dans la vallée de Kymal, vous avez dit...").
    
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
    // INCREASED THRESHOLD: Don't check too early. Let the conversation flow.
    if (turnCount < 4) return { status: "DEBATING" };

    // Only become lenient very late
    const leniency = turnCount > 8 ? "VERY LENIENT" : "STRICT";

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

async function updatePlayerProfile(theme) {
    // Get transcript for THIS scene only
    const sceneTranscript = GLOBAL_HISTORY.filter(h => h.sceneId === CURRENT_SCENE.id);

    const prompt = `
    SUIVI DES CHOIX DU JOUEUR.
    ANCIEN PROFIL : "${PLAYER_PROFILE.summary}"
    TRANSCRIPTION SCÉNARIO "${theme}" :
    ${JSON.stringify(sceneTranscript)}
    
    Tâche : Mets à jour le résumé narratif du joueur en intégrant ses décisions récentes.
    Sois précis sur ses valeurs (ex: "A sacrifié la forêt pour l'économie").
    
    Réponds UNIQUEMENT le nouveau résumé texte (max 2 phrases).
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

    // Initial loading state (only if container exists)
    if (container) {
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

        // Remove initial loader immediately as we will process chunks
        const loader = document.getElementById(loadingId);
        if (loader) loader.remove();

        const reply = data.reply;

        // --- SPLIT MESSAGES BY DELIMITER ### ---
        const chunks = reply.split('###').map(s => s.trim()).filter(s => s.length > 0);

        for (const chunk of chunks) {
            // CALCULATE DELAY: ~200 words/min = ~3 words/sec => ~300ms per word.
            const wordCount = chunk.split(' ').length;
            const delayMs = Math.min(Math.max(wordCount * 300, 1500), 5000);

            // Show new typing indicator for THIS chunk
            let chunkLoadingId = null;
            // Improved Regex to catch *Text* even with spaces like " * Text * "
            const isNarrative = /^\s*\*.*\*\s*$/.test(chunk);

            if (!isNarrative && container) {
                chunkLoadingId = 'chunk-loading-' + Date.now() + Math.random();
                container.innerHTML += buildMsgHTML('bot', '...', targetId)
                    .replace('msg-bubble', 'msg-bubble loading')
                    .replace('class="msg-row bot"', `id="${chunkLoadingId}" class="msg-row bot"`);
                container.scrollTop = container.scrollHeight;
            }

            // Wait for reading/typing time
            await new Promise(r => setTimeout(r, delayMs));

            // Remove chunk loader
            if (chunkLoadingId) {
                const l = document.getElementById(chunkLoadingId);
                if (l) l.remove();
            }

            addMessageToUI('bot', chunk, targetId);

            // Add to history
            if (!CHAT_SESSIONS[targetId]) CHAT_SESSIONS[targetId] = [];
            CHAT_SESSIONS[targetId].push({ role: "assistant", content: chunk });

            // Add to GLOBAL HISTORY
            const activePersonas = GAME_DATA.currentPersonas || GAME_DATA.personas;
            const speakerName = activePersonas[targetId] ? activePersonas[targetId].name : "Système";
            GLOBAL_HISTORY.push({
                sceneId: CURRENT_SCENE.id,
                role: "bot",
                speakerName: speakerName,
                content: chunk
            });
        }

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

// MODIFICATION : Style CSS-in-JS pour alignement Avatar + Bulle + Narratif
function buildMsgHTML(role, text, personaId) {
    const isUser = role === 'user';
    const isNarrative = !isUser && /^\s*\*.*\*\s*$/.test(text);

    if (isNarrative) {
        // STYLE NARRATIF (Hors bulle, italique, centré ou discret)
        const cleanText = text.replace(/\*/g, '').trim();
        return `
        <div class="msg-row narrative" style="display:flex; justify-content:center; margin: 15px 0; opacity:0; animation:fadeIn 0.5s forwards;">
            <div style="color: #aaa; font-style: italic; font-size: 0.95em; text-align:center; max-width:90%;">
                ${cleanText}
            </div>
        </div>`;
    }

    let avatarImg = '';

    if (!isUser && personaId) {
        // Use local or global personas
        const activePersonas = GAME_DATA.currentPersonas || GAME_DATA.personas;
        const p = activePersonas[personaId];
        const url = (p && p.avatar) ? p.avatar : 'assets/avatar_architecte.png';
        avatarImg = `<img src="${url}" style="width:40px; height:40px; border-radius:50%; margin-right:10px; border:2px solid #ff8800; object-fit:cover; flex-shrink:0;">`;
    }

    return `
    <div class="msg-row ${isUser ? 'user' : 'bot'}" style="display:flex; align-items:flex-start; margin-bottom:10px; ${isUser ? 'justify-content:flex-end;' : ''}">
        ${!isUser ? avatarImg : ''} 
        <div class="msg-bubble" style="${!isUser ? 'background:#4a3b2a; border-left:4px solid #ff8800; color:white; padding:10px; border-radius:10px; max-width:80%; box-shadow:0 2px 5px rgba(0,0,0,0.2);' : 'background:#333; color:#ddd; padding:10px; border-radius:10px; max-width:80%; box-shadow:0 2px 5px rgba(0,0,0,0.2);'}">${text}</div>
    </div>`;
}

function renderRoster() {
    if (!ui.roster) return;
    ui.roster.innerHTML = '';
    const activePersonas = GAME_DATA.currentPersonas || GAME_DATA.personas;
    Object.values(activePersonas).forEach(p => {
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
    const activePersonas = GAME_DATA.currentPersonas || GAME_DATA.personas;
    const p = activePersonas[personaId];
    CURRENT_CHAT_TARGET = personaId;

    // Update main header too to show who we are talking to now
    renderInterface(CURRENT_SCENE);

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

// --- AJOUT : FONCTION VOIR PROFIL ---
window.viewProfile = function () {
    alert(`📜 SYNTHÈSE ACTUELLE DE L'IA :\n\n${PLAYER_PROFILE.summary || "Aucune donnée..."}\n\n(Ce résumé s'affine à chaque décision)`);
}

init();
