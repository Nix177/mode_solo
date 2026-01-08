import { API_BASE } from "../assets/config.js";

// --- GAME STATE ---
let GAME_DATA = {};
let CURRENT_SCENE = null;
let SCENE_HISTORY = [];
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
    console.log("Starting Generative Engine...");
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
        
        // Init sessions
        Object.keys(GAME_DATA.personas).forEach(id => CHAT_SESSIONS[id] = []);
        renderRoster();

        // Start
        loadScene(GAME_DATA.scenario.start);

    } catch (e) {
        console.error("Critical Error:", e);
        alert("Erreur de chargement. Vérifiez la console.");
    }
}

function mapPersonas(list) {
    const map = {};
    list.forEach(p => map[p.id] = p);
    return map;
}

// 2. SCENE ENGINE (MODIFIÉ POUR GÉNÉRATION)
async function loadScene(sceneId) {
    const scene = GAME_DATA.scenario.scenes[sceneId];
    if (!scene) {
        alert("FIN DE L'AVENTURE (ou erreur: scène introuvable)");
        return;
    }

    CURRENT_SCENE = scene;
    
    // Mise à jour visuelle immédiate (Fond d'écran)
    updateBackground(scene.background);
    
    // Sélection par défaut du Persona "A-1" (Maître du Jeu Principal)
    // Vous pouvez changer pour un autre si vous voulez varier
    const gmPersonaId = "A-1"; 
    CURRENT_CHAT_TARGET = gmPersonaId;

    // Affiche l'interface vide en attendant l'IA
    renderInterface(scene, "Connexion au Maître du Jeu...", gmPersonaId);

    // --- MAGIE GÉNÉRATIVE ---
    // On demande à l'IA de créer le contexte du niveau
    const generationPrompt = `
    TU ES LE MAÎTRE DU JEU.
    NOUS SOMMES AU NIVEAU ${CURRENT_LEVEL_NUMBER}.
    THÈME DU NIVEAU : "${scene.theme}".
    
    TA TÂCHE :
    1. Décris la scène de manière immersive, dangereuse et visuelle (max 3 phrases).
    2. Explique clairement le problème immédiat ou le dilemme.
    3. Termine par une question ouverte : "Que faites-vous ?"
    
    Ne donne pas de choix A/B. C'est un jeu de rôle libre.
    `;

    // On efface l'historique de chat pour ce nouveau niveau (nouvelle scène)
    CHAT_SESSIONS[gmPersonaId] = []; 
    
    // Appel IA pour générer l'intro
    await callBot(generationPrompt, gmPersonaId, true);
}

window.loadScene = loadScene; // Pour le debug

// 3. DISPLAY
function updateBackground(bgUrl) {
    const container = document.getElementById('game-container');
    if (bgUrl) {
        // Fallback si l'image n'existe pas encore
        const img = new Image();
        img.src = bgUrl;
        img.onload = () => document.body.style.backgroundImage = `url('${bgUrl}')`;
        img.onerror = () => document.body.style.background = "#111"; // Fond noir si pas d'image
    }
}

function renderInterface(scene, placeholderText, personaId) {
    const p = GAME_DATA.personas[personaId];
    const avatarUrl = p ? p.avatar : 'assets/avatar_architecte.png';
    const name = p ? p.displayName : 'Système';

    let html = `
        <div class="slide-content" style="margin-bottom: 20px;">
            <h1 style="font-size:1.5em; color:#888;">NIVEAU ${CURRENT_LEVEL_NUMBER}</h1>
            <p style="font-style:italic; color:#aaa;">Thème : ${scene.theme}</p>
        </div>

        <div class="chat-box">
            <div id="chat-scroll" class="chat-messages">
                </div>
        </div>
    `;
    
    ui.screen.innerHTML = html;
}

// 4. ACTION DU JOUEUR & ROUTER "INTELLIGENT"
window.sendPlayerAction = async function(text) {
    if (!text) {
         const inputEl = document.getElementById('player-input'); 
         text = inputEl ? inputEl.value.trim() : "";
         if(inputEl) inputEl.value = '';
    }
    if (!text || !CURRENT_CHAT_TARGET) return;

    // Affiche le message du joueur
    addMessageToUI('user', text, null);
    
    // Ajoute à l'historique
    if (!CHAT_SESSIONS[CURRENT_CHAT_TARGET]) CHAT_SESSIONS[CURRENT_CHAT_TARGET] = [];
    CHAT_SESSIONS[CURRENT_CHAT_TARGET].push({ role: "user", content: text });

    // --- ANALYSE DE LA RÉUSSITE (ROUTER INVISIBLE) ---
    // On demande à l'IA si le joueur a résolu le niveau AVANT de répondre
    const routerCheck = await checkLevelCompletion(text, CURRENT_SCENE.theme);
    
    if (routerCheck.status === "SOLVED") {
        // Niveau réussi !
        addMessageToUI('bot', `[SYSTÈME] : Situation résolue. Transition... (${routerCheck.reason})`, CURRENT_CHAT_TARGET);
        setTimeout(() => {
            CURRENT_LEVEL_NUMBER++;
            const nextLevelId = `level_${CURRENT_LEVEL_NUMBER}`;
            loadScene(nextLevelId);
        }, 3000);
        return;
    } 
    
    // Si pas résolu, on continue le RP
    const gmPrompt = `
    Tu es le Maître du Jeu (Style: ${GAME_DATA.personas[CURRENT_CHAT_TARGET].bio}).
    Le joueur a dit : "${text}".
    La situation est : "${CURRENT_SCENE.theme}".
    
    Réagis à son action. 
    - Si c'est stupide, fais-le échouer ou souffrir.
    - Si c'est malin, décris le progrès.
    - Relance toujours avec une conséquence ou un nouveau danger.
    - Sois bref (max 2 phrases).
    `;

    await callBot(gmPrompt, CURRENT_CHAT_TARGET);
};
window.sendUserMessage = window.sendPlayerAction;

// --- FONCTIONS IA ---

async function checkLevelCompletion(lastUserAction, theme) {
    // Cette fonction demande à l'IA si l'action du joueur conclut logiquement la scène
    try {
        const res = await fetch(`${API_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [],
                system: `
                You are a Logic Engine judging a Roleplay game.
                The Scene Theme is: "${theme}".
                The Player just said: "${lastUserAction}".
                
                Did the player successfully solve the problem, escape, or decisively change the situation to a stable state?
                or did they die/fail irreversibly?
                
                Reply ONLY JSON:
                { "status": "SOLVED" | "CONTINUE", "reason": "short explanation" }
                `
            })
        });
        const data = await res.json();
        // Nettoyage sommaire du JSON retourné (parfois l'IA ajoute des backticks)
        let cleanJson = data.reply.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error("Router Error", e);
        return { status: "CONTINUE" }; // En cas d'erreur, on continue
    }
}

async function callBot(systemPrompt, targetId, isIntro = false) {
    const container = document.getElementById('chat-scroll');
    
    // Indicateur de chargement
    const loadingId = 'loading-' + Date.now();
    if (container) {
        container.innerHTML += buildMsgHTML('bot', '...', targetId).replace('msg-bubble', 'msg-bubble loading').replace('class="msg-row bot"', `id="${loadingId}" class="msg-row bot"`);
        container.scrollTop = container.scrollHeight;
    }

    try {
        const history = CHAT_SESSIONS[targetId] || [];
        // Pour l'intro, on n'envoie pas d'historique pour ne pas polluer
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
        
        // Retirer loader
        const loader = document.getElementById(loadingId);
        if(loader) loader.remove();

        const reply = data.reply;
        addMessageToUI('bot', reply, targetId);
        
        // Sauvegarde mémoire
        if (!CHAT_SESSIONS[targetId]) CHAT_SESSIONS[targetId] = [];
        CHAT_SESSIONS[targetId].push({ role: "assistant", content: reply });

    } catch (e) {
        console.error(e);
    }
}

// --- UI UTILS ---
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

// Roster (Optionnel maintenant)
function renderRoster() {
    if (!ui.roster) return;
    ui.roster.innerHTML = '';
    // On pourrait afficher les PV ou l'état ici
}

init();
