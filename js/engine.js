import { API_BASE } from "../assets/config.js";

// --- GAME STATE ---
let GAME_DATA = {};
let CURRENT_SCENE = null;
let SCENE_HISTORY = [];
let GAME_STATE = {};
let GAME_MODE = 'standard';

// --- MULTI-CHAT MANAGEMENT ---
let CHAT_SESSIONS = {};
let CURRENT_CHAT_TARGET = null;

// --- DOM ELEMENTS ---
const ui = {
    screen: document.getElementById('game-container'),
    teacherPanel: document.getElementById('teacher-controls'),
    teacherNote: document.getElementById('teacher-note-area'),
    roster: document.getElementById('roster-bar'),
    modal: document.getElementById('side-chat-modal'),
    modalScroll: document.getElementById('modal-chat-scroll'),
    modalTitle: document.getElementById('modal-title')
};

// 1. INITIALIZATION
async function init() {
    console.log("Starting Shogun Engine (Solo Router Version)...");
    if (ui.teacherNote) ui.teacherNote.innerText = "Initialization...";

    try {
        const loadFile = async (path) => {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`Missing file: ${path}`);
            return await res.json();
        };

        const [scenario, personas, world] = await Promise.all([
            loadFile('data/scenario.json'),
            loadFile('data/personas.json'),
            loadFile('data/world.json')
        ]);

        GAME_DATA = { scenario, personas: mapPersonas(personas), world };
        GAME_STATE = scenario.state || {};

        // Initialize chat sessions for all personas
        Object.keys(GAME_DATA.personas).forEach(id => CHAT_SESSIONS[id] = []);
        renderRoster();

        // Start the game directly
        loadScene(GAME_DATA.scenario.start);

    } catch (e) {
        console.error("Error:", e);
        if (ui.teacherNote) ui.teacherNote.innerHTML = `<span style="color:red">LOADING ERROR</span>`;
    }
}

function mapPersonas(list) {
    const map = {};
    list.forEach(p => map[p.id] = p);
    return map;
}

// 2. SCENE ENGINE
function loadScene(sceneId) {
    const scene = GAME_DATA.scenario.scenes[sceneId];
    if (!scene) return alert("ERROR : Scene not found -> " + sceneId);

    // --- History Management ---
    if (CURRENT_SCENE && CURRENT_SCENE.id !== sceneId && !window._isUndoing) {
        SCENE_HISTORY.push(CURRENT_SCENE.id);
    }
    window._isUndoing = false;

    // --- RANDOM EVENT LOGIC ---
    if (GAME_MODE === 'extended' && scene.allowEvents && !sceneId.startsWith('evt_') && Math.random() > 0.6) {
        const events = GAME_DATA.world.randomEvents;
        if (events && events.length > 0) {
             // ...
        }
    }

    CURRENT_SCENE = scene;

    // Set current chat target
    if (scene.persona) {
        CURRENT_CHAT_TARGET = scene.persona;
    } else {
        CURRENT_CHAT_TARGET = null;
    }

    updateScreen(scene);
    updateTeacherInterface(scene);

    // Initial Bot Message
    if (scene.type === 'chat' && scene.persona && scene.content && scene.content.text) {
         if (CHAT_SESSIONS[scene.persona].length === 0 && scene.prompt) {
            callBot(scene.prompt, scene.persona, true);
        }
    }
}
window.loadScene = loadScene; 

// 3. DISPLAY
function updateScreen(scene) {
    const videoContainer = document.getElementById('video-bg-container');

    // Background handling
    if (scene.video) {
         // ... 
    } else {
        if (videoContainer) videoContainer.remove();
        if (scene.background) document.body.style.backgroundImage = `url('${scene.background}')`;
    }

    let html = '';

    // Narrative Content Slide (INTRO / STORY)
    if (scene.content && (scene.type === 'intro' || scene.type === 'story')) {
        html += `
            <div class="slide-content">
                <h1>${scene.content.title}</h1>
                <p>${scene.content.text.replace(/\n/g, '<br>')}</p>
                 ${scene.next ? `<button onclick="loadScene('${scene.next}')" style="margin-top:20px; padding:10px 20px; font-size:1.2em; cursor:pointer; background:#28a745; color:white; border:none; border-radius:5px;">CONTINUER</button>` : ''}
            </div>
        `;
        if(document.getElementById('teacher-ui')) document.getElementById('teacher-ui').style.display = 'none'; 
    }

    // Chat Scene
    if (scene.type === 'chat' || (scene.type !== 'intro' && scene.type !== 'story' && scene.persona)) {
        if(document.getElementById('teacher-ui')) document.getElementById('teacher-ui').style.display = 'flex';
        
        const p = GAME_DATA.personas[scene.persona];
        const avatarUrl = (p && p.avatar) ? p.avatar : 'assets/avatar_esprit.png';
        const name = p ? p.displayName : 'Inconnu';

        // --- GESTION DU CONTEXTE (Récupération de l'intro précédente) ---
        let contextText = "";
        
        // On regarde si la scène précédente était une intro pour récupérer son texte
        if (SCENE_HISTORY.length > 0) {
            const lastSceneId = SCENE_HISTORY[SCENE_HISTORY.length - 1];
            const lastScene = GAME_DATA.scenario.scenes[lastSceneId];
            // Si la scène d'avant était une intro, on prend son texte
            if (lastScene && lastScene.type === 'intro' && lastScene.content) {
                contextText = lastScene.content.text;
            }
        }

        // Texte actuel de la scène (ex: "A-1 analyse...")
        const currentText = (scene.content && scene.content.text) ? scene.content.text : "";

        // Construction de la boîte de contexte affichée au-dessus du chat
        html += `
            <div class="slide-content" style="margin-bottom: 20px; max-height: 35vh; overflow-y: auto; text-align: left;">
                ${contextText ? `
                    <div style="font-size: 0.95em; color: #bbb; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 15px; line-height: 1.6;">
                        <strong style="color: #fff; text-transform:uppercase; letter-spacing:1px; display:block; margin-bottom:5px;">Contexte :</strong> 
                        ${contextText.replace(/\n/g, '<br>')}
                    </div>` : ''
                }
                ${currentText ? `<p style="color: #fff; font-style: italic; font-weight: 500;">${currentText}</p>` : ''}
            </div>
        `;

        html += `
            <div class="chat-box">
                <div class="avatar-header">
                    <img src="${avatarUrl}" class="header-avatar-img" onerror="this.style.display='none'">
                    <div class="header-name">${name}</div>
                </div>
                <div id="chat-scroll" class="chat-messages"></div>
            </div>
        `;
    }
    ui.screen.innerHTML = html;

    if (scene.persona) {
        renderChatHistory(scene.persona, document.getElementById('chat-scroll'));
    }
}

// 4. TEACHER INTERFACE
function updateTeacherInterface(scene) {
    ui.teacherPanel.innerHTML = '';
    if (ui.teacherNote) ui.teacherNote.innerText = scene.teacherNote || "Narrative Phase.";
}

function applyEffects(effects) {
    if (!effects) return;
    for (let key in effects) {
        if (GAME_STATE[key] !== undefined) {
            GAME_STATE[key] += effects[key];
        }
    }
}

// --- 5. ROSTER AND MODAL MANAGEMENT ---

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
    if (!p) return;

    CURRENT_CHAT_TARGET = personaId;
    if (ui.modal) ui.modal.style.display = 'flex';
    renderChatHistory(personaId, ui.modalScroll);
}

window.closeSideChat = function() {
    if (ui.modal) ui.modal.style.display = 'none';
    if (CURRENT_SCENE && CURRENT_SCENE.persona) {
        CURRENT_CHAT_TARGET = CURRENT_SCENE.persona;
    } else {
        CURRENT_CHAT_TARGET = null;
    }
}

// --- UNIFIED DISPLAY FUNCTION ---
function buildMsgHTML(role, text, personaId) {
    const isUser = role === 'user';
    let avatarImg = '';

    if (!isUser) {
        const p = GAME_DATA.personas[personaId];
        const url = (p && p.avatar) ? p.avatar : 'assets/avatar_esprit.png';
        avatarImg = `<img src="${url}" class="chat-avatar-img" alt="${personaId}">`;
    }

    return `
    <div class="msg-row ${isUser ? 'user' : 'bot'}">
        ${!isUser ? avatarImg : ''} 
        <div class="msg-bubble">${text}</div>
    </div>`;
}

function renderChatHistory(personaId, container) {
    if (!container) return;
    container.innerHTML = '';
    const history = CHAT_SESSIONS[personaId] || [];
    history.forEach(msg => {
        container.innerHTML += buildMsgHTML(msg.role, msg.content, personaId);
    });
    container.scrollTop = container.scrollHeight;
}

// --- 6. MESSAGE MANAGEMENT ---

window.sendPlayerAction = async function(text) { 
    // Correction ici : Utilisation du bon ID 'player-input' au lieu de 'prof-chat-input'
    if (!text) {
         const inputEl = document.getElementById('player-input'); 
         text = inputEl ? inputEl.value.trim() : "";
         if(inputEl) inputEl.value = '';
    }

    if (!text || !CURRENT_CHAT_TARGET) return;

    // 1. DISPLAY PLAYER ACTION
    const container = (ui.modal && ui.modal.style.display === 'flex') 
        ? ui.modalScroll 
        : document.getElementById('chat-scroll');

    if (container) {
        container.innerHTML += buildMsgHTML('user', text, null);
        container.scrollTop = container.scrollHeight;
    }

    // History
    if (!CHAT_SESSIONS[CURRENT_CHAT_TARGET]) CHAT_SESSIONS[CURRENT_CHAT_TARGET] = [];
    CHAT_SESSIONS[CURRENT_CHAT_TARGET].push({ role: "user", content: text });

    // 2. CHARACTER RESPONSE (ROLEPLAY)
    const p = GAME_DATA.personas[CURRENT_CHAT_TARGET];
    
    let sceneContext = "";
    if (CURRENT_SCENE && CURRENT_SCENE.persona === CURRENT_CHAT_TARGET) {
        sceneContext = `SITUATION: ${CURRENT_SCENE.prompt}`;
    }

    const systemPrompt = `
    TON RÔLE: ${p.bio}
    CONTEXTE SCÉNARIO: ${sceneContext}
    ACTION DU JOUEUR: "${text}"
    
    CONSIGNES:
    - Réponds directement à l'action du joueur.
    - Reste parfaitement dans ton personnage (A-1, B-2, C-3).
    - Sois bref et percutant (max 2 phrases).
    `;

    await callBot(systemPrompt, CURRENT_CHAT_TARGET);

    // 3. GAME BRAIN (AUTO ROUTING)
    if (CURRENT_SCENE && CURRENT_SCENE.router) {
        checkAutoRouting(text, CURRENT_SCENE.router);
    }
};

window.sendUserMessage = window.sendPlayerAction;

// --- AI ROUTER ---
async function checkAutoRouting(userText, routerConfig) {
    console.log("🕵️ Analyzing destiny...");

    try {
        const res = await fetch(`${API_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "gpt-4o-mini", 
                messages: [],
                system: `You are the logic engine of a choose-your-own-adventure game.
                
                ANALYZE PLAYER ACTION: "${userText}"
                
                DECISION INSTRUCTIONS:
                ${routerConfig.prompt}
                
                ABSOLUTE RULE: Reply ONLY with one of the defined keywords. 
                If the action matches nothing decisive, reply "CONTINUE".`
            })
        });

        const data = await res.json();
        const decision = data.reply.trim().replace(/[^A-Z_]/g, ''); 

        console.log(`🤖 Decision : ${decision}`);

        if (routerConfig.paths[decision]) {
            const nextSceneId = routerConfig.paths[decision];
            setTimeout(() => {
                console.log(`🚀 Transition to : ${nextSceneId}`);
                loadScene(nextSceneId);
            }, 3000);
        }

    } catch (e) {
        console.error("Router Error:", e);
    }
}

async function callBot(systemPrompt, targetId, isIntro = false) {
    const container = (ui.modal && ui.modal.style.display === 'flex' && CURRENT_CHAT_TARGET === targetId)
        ? ui.modalScroll
        : (CURRENT_SCENE.persona === targetId ? document.getElementById('chat-scroll') : null);

    let loadingId = null;
    if (container) {
        loadingId = 'loading-' + Date.now();
        const loaderHTML = buildMsgHTML('assistant', '...', targetId).replace('class="msg-row bot"', `id="${loadingId}" class="msg-row bot"`);
        container.innerHTML += loaderHTML;
        container.scrollTop = container.scrollHeight;
    }

    try {
        const history = CHAT_SESSIONS[targetId] || [];
        const res = await fetch(`${API_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: isIntro ? [] : history,
                system: systemPrompt,
                model: "gpt-4o-mini"
            })
        });
        const data = await res.json();

        if (loadingId) {
            const loader = document.getElementById(loadingId);
            if (loader) loader.remove();
        }

        const reply = data.reply;

        if (container) {
            container.innerHTML += buildMsgHTML('assistant', reply, targetId);
            container.scrollTop = container.scrollHeight;
        }

        if (!CHAT_SESSIONS[targetId]) CHAT_SESSIONS[targetId] = [];
        CHAT_SESSIONS[targetId].push({ role: "assistant", content: reply });

    } catch (e) {
        console.error(e);
        if(loadingId) document.getElementById(loadingId).innerText = "Error...";
    }
}

window.toggleFullScreen = function() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else if (document.exitFullscreen) document.exitFullscreen();
}

window.undoLastScene = function() {
    if (SCENE_HISTORY.length === 0) return alert("Cannot undo further.");
    const prevId = SCENE_HISTORY.pop();
    window._isUndoing = true;
    loadScene(prevId);
};

window.downloadSave = function() {
    const saveObj = {
        date: new Date().toISOString(),
        sceneId: CURRENT_SCENE.id,
        state: GAME_STATE,
        history: SCENE_HISTORY,
        chats: CHAT_SESSIONS
    };
    const blob = new Blob([JSON.stringify(saveObj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `shogun_save_${new Date().toLocaleTimeString().replace(/:/g, '-')}.json`;
    a.click();
};

window.uploadSave = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            GAME_STATE = data.state || {};
            SCENE_HISTORY = data.history || [];
            CHAT_SESSIONS = data.chats || {};
            loadScene(data.sceneId);
            alert("Game Loaded!");
        } catch (err) { alert("Invalid File"); }
    };
    reader.readAsText(file);
};

init();
