import { API_BASE } from "../assets/config.js";

// --- GAME STATE ---
let GAME_DATA = {};
let CURRENT_SCENE = null;
let CHAT_SESSIONS = {};
let CURRENT_CHAT_TARGET = null;

// New non-linear state
let PLAYED_SCENES = [];
let GLOBAL_HISTORY = []; // Stores { sceneId, role, speakerName, content }
window.GLOBAL_HISTORY = GLOBAL_HISTORY;
window.CHAT_SESSIONS = CHAT_SESSIONS;
window.CURRENT_CHAT_TARGET = CURRENT_CHAT_TARGET;

let CURRENT_MODEL = localStorage.getItem('game_model') || "gpt-4o-mini";
let PLAYER_PROFILE = {
    summary: "Nouveau venu curieux.",
    traits: {}
};

window.GAME_DATA = {}; // Placeholder until init

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
        window.GAME_DATA = GAME_DATA; // Expose for debug
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
    // Only if first time loading this scene
    if (!CHAT_SESSIONS[narratorId] || CHAT_SESSIONS[narratorId].length === 0) {
        const contextMsg = `*${scene.narrative ? scene.narrative.visual_cues : ""} ${scene.narrative ? scene.narrative.context : scene.theme}*`;
        // Store narrative in narrator's history so it persists
        if (!CHAT_SESSIONS[narratorId]) CHAT_SESSIONS[narratorId] = [];
        CHAT_SESSIONS[narratorId].push({ role: "assistant", content: contextMsg });
    }

    // 2. Load History for the Narrator
    restoreChatHistory(narratorId);

    // 3. Trigger Greeting ONLY if new
    if (CHAT_SESSIONS[narratorId].length <= 1) { // <= 1 because we just added the contextMsg
        const introPrompt = `
        RÔLE : ${GAME_DATA.currentPersonas[narratorId].name} (${GAME_DATA.currentPersonas[narratorId].role}).
        SCÉNARIO : "${scene.narrative ? scene.narrative.context : scene.theme}".
        MISSION : Souhaite la bienvenue au "Médiateur". Ouvre la conversation. NE DEMANDE PAS DE DÉCISION.
        FORMAT : Blocs courts séparés par "###". Descriptions 3ème personne en *italique* et AU PRÉSENT (ex: "Il regarde" NON "Il regarda").
        `;
        await callBot(introPrompt, narratorId, true);
    }
}

// --- AJOUT : FONCTION ADMIN POUR SAUTER DE NIVEAU ---
window.manualLevelJump = function () {
    const target = prompt("ADMIN - Aller à la scène ID (ex: level_2) :");
    if (target) loadScene(target);
}

window.loadScene = loadScene;

// --- FULLSCREEN LOGIC ---
window.toggleFullscreen = function () {
    // Detect iOS (iPhone/iPad)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    // iOS doesn't support requestFullscreen on elements (only video), so we give a hint.
    if (isIOS) {
        alert("Sur iOS, pour le plein écran : Appuyez sur 'Partager' puis 'Sur l'écran d'accueil'.");
        return;
    }

    if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            // Vendor prefixes fallback
            const el = document.documentElement;
            const rfs = el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
            if (rfs) {
                rfs.call(el);
            } else {
                alert("Le mode plein écran n'est pas supporté par ce navigateur.");
            }
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
};

// --- AJOUT : FONCTIONS SETTINGS (Model Selector) ---
window.openSettings = function () {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.style.display = 'flex';
        const select = document.getElementById('model-select');
        if (select) select.value = CURRENT_MODEL;
    }
}

window.saveSettings = function () {
    const select = document.getElementById('model-select');
    if (select) {
        CURRENT_MODEL = select.value;
        localStorage.setItem('game_model', CURRENT_MODEL);
        alert("Modèle IA changé pour : " + CURRENT_MODEL);
        document.getElementById('settings-modal').style.display = 'none';
    }
}

// 3. DISPLAY
function updateBackground(bgUrl) {
    if (ui.screen && bgUrl) {
        ui.screen.style.background = `
            linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.8) 100%),
            url('${bgUrl}') center/cover no-repeat
        `;
    }
}

// --- RESTORE HISTORY ---
function restoreChatHistory(personaId) {
    const chatContainer = document.getElementById('chat-scroll');
    if (!chatContainer) return;
    chatContainer.innerHTML = ''; // Clear previous

    const history = CHAT_SESSIONS[personaId] || [];
    history.forEach(msg => {
        addMessageToUI(msg.role === 'assistant' ? 'bot' : 'user', msg.content, personaId);
    });
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// --- CHECK AUTO GREETING ---
async function checkAutoGreeting(personaId) {
    if (!CHAT_SESSIONS[personaId] || CHAT_SESSIONS[personaId].length === 0) {
        const p = (GAME_DATA.currentPersonas || GAME_DATA.personas)[personaId];
        const greetingPrompt = `
        RÔLE : ${p.displayName}.
        CONTEXTE : Le joueur "Médiateur" vient de se tourner vers toi pour la première fois.
        ACTION : Présente-toi brièvement et donne ton avis sur la situation ("${CURRENT_SCENE.theme}").
        FORMAT : Court (max 40 mots). Descriptions *italique* et AU PRÉSENT.
        `;
        // Init array
        CHAT_SESSIONS[personaId] = [];
        await callBot(greetingPrompt, personaId, true);
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

    // IMPORTANT: Restore history for the current target after rendering container
    restoreChatHistory(CURRENT_CHAT_TARGET);
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

    // --- DYNAMIC BACKGROUND PHASE ---
    if (CURRENT_SCENE.phases) {
        // Find the matching phase for this turn
        const phase = CURRENT_SCENE.phases.find(p => p.turn === turnCount);
        if (phase && phase.image) {
            updateBackground(phase.image);
        }
    }

    // --- CHECK FOR END OF LEVEL ---
    // Pass the narrative steps to the checker to see if we are deep enough
    const decisionCheck = await checkDecisionMade(text, CURRENT_SCENE.theme, turnCount);

    if (decisionCheck.status === "DECIDED") {
        addMessageToUI('bot', `[SYSTÈME] : Choix enregistré. Fin de séquence.`, CURRENT_CHAT_TARGET);

        await updatePlayerProfile(CURRENT_SCENE.theme);
        if (decisionCheck.exitId) {
             const exit = CURRENT_SCENE.exits.find(e => e.id === decisionCheck.exitId);
             if (exit && exit.target) {
                 console.log("Branching to:", exit.target);
                 loadScene(exit.target);
             } else {
                 // Fallback if exit invalid
                 loadScene(await pickNextScene());
             }
        } else {
             // Fallback legacy behavior
             const nextSceneId = await pickNextScene();
             if (nextSceneId) loadScene(nextSceneId);
             else showGameSummary();
        }
        }, 3000);
        return;
    }

    // --- DETECT SILENT PERSONAS ---
    // Who has spoken in this scene?
    const sceneHistory = GLOBAL_HISTORY.filter(h => h.sceneId === CURRENT_SCENE.id && h.role !== 'user');
    const spokenIds = new Set(sceneHistory.map(h => h.speakerId || '')); // speakerId needs to be added to history push if not present, but we can infer from content context or track separately.
    // Actually, GLOBAL_HISTORY currently stores `speakerName`. Let's assume names are unique or mapped.
    // Better: let's track active IDs in CHAT_SESSIONS or similar.
    // Workaround: We know `activePersonas` keys are IDs.

    // Identify silent personas based on `activePersonas`
    const silentPersonas = Object.keys(activePersonas).filter(id => {
        // Check if this ID appears in `sceneHistory` names or IDs? 
        // Currently `callBot` doesn't explicitly save `speakerId` to GLOBAL_HISTORY, only `speakerName`.
        // We'll trust the AI to respect the instructions, but we can force it.
        // Let's just add a generic "Wake up" if turnCount is 2 or 3.
        return true; // We will handle this in the prompt via "If X hasn't spoken..."
    });

    const isLateGame = turnCount >= 5;
    const debatePrompt = `
    CONTEXTE : Le joueur a dit : "${text}".
    SCÉNARIO : "${CURRENT_SCENE.theme}".
    RÔLE ACTUEL : ${activePersonas[CURRENT_CHAT_TARGET].displayName} (${activePersonas[CURRENT_CHAT_TARGET].bio}).
    AUTRES PERSOS PRÉSENTS : ${Object.values(activePersonas).map(p => p.name).join(', ')}.
    
    INSTRUCTIONS DYNAMIQUES DE JEU :
    1. **MAÏEUTIQUE** : Pose des questions, ne conclus pas vite.
    2. **INTERVENTION** : Si le joueur semble avoir choisi, DEMANDE-LUI EXPLICITEMENT : "Est-ce votre dernier mot ?". NE CONCLUE PAS SANS SA CONFIRMATION.
    3. **ROULEMENT** : Si un personnage n'a pas encore parlé, FAIS-LE INTERVENIR (ex: "*X s'interpose...*"). Tous les 3 doivent donner leur avis.
    4. **TON** : ${isLateGame ? "Presse le joueur de décider." : "Explre les nuances."}
    
    NB: UTILISE LE PRÉSENT DE NARRATION (ex: "Il sourit" et NON "Il a souri").
    
    FORMAT :
    - Sépare tes idées en blocs courts (max 80 mots) avec "###".
    - Dialogue libre, mais *actions en italique*.
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
        let exitPrompt = "";
        if (CURRENT_SCENE.exits) {
            exitPrompt = "POSSIBLE EXITS:\n" + CURRENT_SCENE.exits.map(e => `- ID: "${e.id}" -> ${e.description}`).join('\n');
        }

        const res = await callAIInternal(`
            ANALYZE PLAYER INPUT. Theme: "${theme}". Input: "${lastUserAction}".
            Mode: ${leniency}
            
            ${exitPrompt}

            Did the player EXPLICITLY CONFIRM their final choice matching one of these exits?
            If they merely express an opinion or a tendency, it is NOT "DECIDED".
            They must say "Confirmed", "Final word", "Yes, I'm sure", or repeat their choice EMPHATICALLY after being asked "Is this your final choice?".
            
            Reply ONLY JSON: { "status": "DECIDED", "exitId": "ID_OF_EXIT" } OR { "status": "DEBATING" }
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
    let res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: CURRENT_MODEL,
            messages: [],
            system: systemPrompt
        })
    });

    let data;
    try {
        const text = await res.text();
        data = JSON.parse(text);
    } catch (e) {
        console.error("AI Internal Parse Error", e);
    }

    if (!res.ok || !data || !data.reply) {
        console.warn("AI Internal Failed with model " + CURRENT_MODEL + ". Retrying with gpt-4o-mini.");
        res = await fetch(`${API_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [],
                system: systemPrompt
            })
        });
        data = await res.json();
    }

    if (!data.reply) return '{ "status": "DEBATING" }'; // Fail-safe default

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
                model: CURRENT_MODEL
            })
        });

        let data;
        const textResp = await res.text();
        try {
            data = JSON.parse(textResp);
        } catch (e) {
            console.error("Invalid JSON:", textResp);
            throw new Error("API returned non-JSON: " + res.status);
        }

        if (!res.ok || !data.reply) {
            console.warn(`Model ${CURRENT_MODEL} failed (Status ${res.status}). Retrying with gpt-4o-mini...`);
            // Fallback to gpt-4o-mini
            const fallbackRes = await fetch(`${API_BASE}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: messagesToSend,
                    system: systemPrompt,
                    model: "gpt-4o-mini"
                })
            });
            const fallbackData = await fallbackRes.json();
            if (!fallbackData.reply) throw new Error("Fallback failed");
            data = fallbackData;
        }

        // Remove initial loader immediately as we will process chunks
        const loader = document.getElementById(loadingId);
        if (loader) loader.remove();

        const reply = data.reply || ""; // Safety check

        // --- SPLIT MESSAGES BY DELIMITER ### ---
        const chunks = reply.split('###').map(s => s.trim()).filter(s => s.length > 0);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const isLast = (i === chunks.length - 1);

            // Show new typing indicator for THIS chunk
            let chunkLoadingId = null;
            // Improved Regex to catch *Text* even with spaces like " * Text * "
            const isNarrative = /^\s*\*.*\*\s*$/.test(chunk);

            // Artificial delay for feeling (shorter than before because we have the button)
            // Just a small 1s-1.5s typing feel
            if (!isNarrative && container) {
                chunkLoadingId = 'chunk-loading-' + Date.now() + Math.random();
                container.innerHTML += buildMsgHTML('bot', '...', targetId)
                    .replace('msg-bubble', 'msg-bubble loading')
                    .replace('class="msg-row bot"', `id="${chunkLoadingId}" class="msg-row bot"`);
                container.scrollTop = container.scrollHeight;
                await new Promise(r => setTimeout(r, 800 + Math.random() * 500));
            } else {
                // Narrative pause (shorter)
                await new Promise(r => setTimeout(r, 600));
            }

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

            // WAITING FOR USER "NEXT" (SUITE)
            // Only if NOT the last chunk
            if (!isLast && container) {
                const btnId = 'next-btn-' + Date.now();
                const btnHTML = `
                    <div id="${btnId}" style="display:flex; justify-content:flex-start; margin: 10px 0 20px 0; animation: fadeIn 0.5s;">
                        <button style="background:transparent; border:1px solid #ff8800; color:#ff8800; padding:5px 15px; border-radius:20px; cursor:pointer; font-size:0.9em;">
                            Suite ➜
                        </button>
                    </div>
                `;
                container.innerHTML += btnHTML;
                container.scrollTop = container.scrollHeight;

                // Promisify the click
                await new Promise(resolve => {
                    const btnEl = document.getElementById(btnId);
                    if (btnEl) {
                        btnEl.onclick = function () {
                            btnEl.remove();
                            resolve();
                        }
                    } else {
                        resolve(); // Fallback
                    }
                });
            }
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
            <div style="color: #aaa; font-style: italic; font-size: 0.95em; text-align:justify; max-width:90%;">
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
        <div class="msg-bubble" style="${!isUser ? 'background:#4a3b2a; border-left:4px solid #ff8800; color:white; padding:10px; border-radius:10px; max-width:80%; box-shadow:0 2px 5px rgba(0,0,0,0.2); text-align:justify;' : 'background:#333; color:#ddd; padding:10px; border-radius:10px; max-width:80%; box-shadow:0 2px 5px rgba(0,0,0,0.2); text-align:justify;'}">${text}</div>
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

    // Switch Target
    CURRENT_CHAT_TARGET = personaId;

    // Close Modal if open (since we are switching the MAIN view now, or we can keep it as is? User asked for clicking bubbles to switch chat)
    // Actually the user request says "cliquer dessus... et quand on revient... reprend".
    // Let's make the Side Bubbles switch the MAIN view instead of a modal, OR keep the modal but with history.
    // The previous implementation used a modal. Let's stick to the user's request: "switch de chat comme si on l'avait sélectionné".
    // So distinct chat windows.
    // Let's RE-RENDER the main interface with the new target.

    renderInterface(CURRENT_SCENE);
    if (ui.modal) ui.modal.style.display = 'none'; // Close modal if it was used before

    // Trigger Auto-Greeting if empty
    checkAutoGreeting(personaId);
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
