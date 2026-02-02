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

// --- TTS MANAGER (TEXT-TO-SPEECH) ---
const TTSManager = {
    enabled: true,
    voices: [],
    preferredVoiceURI: localStorage.getItem('game_voice_uri') || null,
    elevenLabsKey: localStorage.getItem('game_eleven_key') || null,

    init: function () {
        if ('speechSynthesis' in window) {
            const load = () => {
                this.voices = window.speechSynthesis.getVoices();
            };
            window.speechSynthesis.onvoiceschanged = load;
            load();
        } else {
            console.warn("Web Speech API not supported.");
            this.enabled = false;
        }
    },

    toggle: function () {
        this.enabled = !this.enabled;
        if (!this.enabled) window.speechSynthesis.cancel();
        return this.enabled;
    },

    stop: function () {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },

    speak: function (text, personaId, isNarrative) {
        if (!this.enabled) return;

        console.log(`TTS Speak: "${text.substring(0, 20)}..." | Persona: ${personaId} | Narrative: ${isNarrative}`);

        const cleanText = text.replace(/\*/g, '').replace(/["«»]/g, '').trim();
        if (!cleanText) return;

        // --- OPTION C: ELEVENLABS (High Quality) ---
        if (this.elevenLabsKey) {
            this.speakEleven(cleanText, personaId, isNarrative);
            return;
        }

        if (!('speechSynthesis' in window)) return;

        const utter = new SpeechSynthesisUtterance(cleanText);
        let selectedVoice = null;

        // --- 1. VOICE SELECTION ---
        // Priority: User Preference
        if (this.preferredVoiceURI) {
            selectedVoice = this.voices.find(v => v.voiceURI === this.preferredVoiceURI);
        }
        // Fallback: Best French Voice
        if (!selectedVoice) {
            selectedVoice = this.voices.find(v => v.lang.startsWith('fr') && v.name.includes('Google')) ||
                this.voices.find(v => v.lang.startsWith('fr') && v.name.includes('Natural')) ||
                this.voices.find(v => v.lang.startsWith('fr'));
        }
        if (selectedVoice) utter.voice = selectedVoice;

        // --- 2. GENDER & PERSONA LOGIC ---
        let pitch = 1.0;
        let rate = 1.0;

        if (isNarrative) {
            // NARRATOR: FIXED MALE VOICE
            // Decrease pitch to enforce masculine tone if voice is gender-neutral
            pitch = 0.85;
            rate = 0.95;
        } else if (personaId) {
            // Retrieve Persona Gender
            const personas = window.GAME_DATA.currentPersonas || window.GAME_DATA.personas || {};
            const p = personas[personaId];
            const gender = p ? p.gender : 'male'; // Default male

            // Calculate a unique hash for variation
            const idSum = personaId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

            if (gender === 'female') {
                // FEMALE: Higher pitch
                pitch = 1.2 + ((idSum % 3) * 0.05); // 1.2 to 1.3
            } else {
                // MALE: Lower pitch
                pitch = 0.85 + ((idSum % 3) * 0.05); // 0.85 to 0.95
            }

            rate = 1.05;
        }

        utter.pitch = pitch;
        utter.rate = rate;

        window.speechSynthesis.speak(utter);
    },

    speakEleven: async function (text, personaId, isNarrative) {
        // Mapping ElevenLabs Voices (Examples - Replace with valid IDs if known or generic)
        let voiceId = 'ErXwobaYiN019PkySvjV'; // Default Male (Antoni) for Narrator/Neutral

        if (personaId) {
            const personas = window.GAME_DATA.currentPersonas || window.GAME_DATA.personas || {};
            const p = personas[personaId];
            const gender = p ? p.gender : 'male';

            if (gender === 'female') {
                voiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel
            } else {
                voiceId = 'TxGEqnHWrfWFTfGW9XjX'; // Josh
            }
        }

        try {
            const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
                method: 'POST',
                headers: {
                    'xi-api-key': this.elevenLabsKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    model_id: "eleven_multilingual_v2", // Better for French
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                })
            });

            if (!response.ok) throw new Error("ElevenLabs Error");

            const blob = await response.blob();
            const audio = new Audio(URL.createObjectURL(blob));
            audio.play();

        } catch (e) {
            console.error(e);
            console.warn("Falling back to Browser TTS");
            // Temporarily disable key to prevent loop if quota exceeded
            const keyBak = this.elevenLabsKey;
            this.elevenLabsKey = null;
            this.speak(text, personaId, isNarrative);
            this.elevenLabsKey = keyBak;
        }
    }
};

TTSManager.init();

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
    // Only if first time loading this scene
    if (!CHAT_SESSIONS[narratorId] || CHAT_SESSIONS[narratorId].length === 0) {
        const text = (scene.narrative ? (scene.narrative.visual_cues + " " + scene.narrative.context) : scene.theme).trim();
        if (text) {
            const contextMsg = `*${text}*`;
            // Store narrative in narrator's history so it persists
            if (!CHAT_SESSIONS[narratorId]) CHAT_SESSIONS[narratorId] = [];
            CHAT_SESSIONS[narratorId].push({ role: "assistant", content: contextMsg });
        }
    }

    // 2. Load History for the Narrator
    restoreChatHistory(narratorId);

    // 3. Trigger Greeting ONLY if new
    // 3. Trigger Greeting Sequence (TOUR) ONLY if new
    if (CHAT_SESSIONS[narratorId].length <= 1) {
        // A. Narrator Intro
        const otherPersonasNames = Object.values(GAME_DATA.currentPersonas)
            .filter(p => p.id !== narratorId)
            .map(p => p.displayName)
            .join(' et ');

        const introPrompt = `
        RÔLE : ${GAME_DATA.currentPersonas[narratorId].name} (${GAME_DATA.currentPersonas[narratorId].role}).
        SCÉNARIO : "${scene.narrative ? scene.narrative.context : scene.theme}".
        
        MISSION CRITIQUE :
        1. Souhaite la bienvenue au "Médiateur".
        2. Expose brièvement le cœur du conflit de manière NEUTRE et FACTUELLE.
        3. Annonce que tu vas laisser la parole aux deux parties prenantes pour qu'elles se présentent.
        
        FORMAT : Blocs courts séparés par "###". Descriptions 3ème personne en *italique* et AU PRÉSENT.
        `;
        await callBot(introPrompt, narratorId, true);

        // Wait for reading (approx 4s per chunk? actually callBot awaits generation but not reading)
        await new Promise(r => setTimeout(r, 2000));

        // B. Tour Loop
        const extras = Object.values(GAME_DATA.currentPersonas).filter(p => p.id !== narratorId);
        for (const p of extras) {
            // Switch View
            window.setCurrentChatTarget(p.id);
            // Trigger Greeting
            await checkAutoGreeting(p.id);
            // Wait for user to read/hear a bit (e.g. 5s)
            await new Promise(r => setTimeout(r, 6000));
        }

        // C. Return to Narrator
        window.setCurrentChatTarget(narratorId);

        // D. Final instruction
        await callBot(`
        CONTEXTE : Les parties se sont présentées.
        ACTION : Invite maintenant le joueur à poser des questions ou à approfondir avec chacun avant de trancher.
        Rappelle que tu es là pour arbitrer.
        `, narratorId);

        // Flash Roster to draw attention
        const roster = document.getElementById('roster-bar');
        if (roster) {
            roster.style.animation = 'pulse 2s infinite';
            setTimeout(() => roster.style.animation = '', 6000);
        }
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

        // Model Select
        const select = document.getElementById('model-select');
        if (select) select.value = CURRENT_MODEL;

        // Voice Select Populate
        const voiceSelect = document.getElementById('voice-select');
        if (voiceSelect) {
            voiceSelect.innerHTML = '<option value="">-- Automatique (Défaut) --</option>';

            // Sort voices: French First, then Google/Microsoft, then others
            const sortedVoices = TTSManager.voices.sort((a, b) => {
                const aFr = a.lang.startsWith('fr');
                const bFr = b.lang.startsWith('fr');
                if (aFr && !bFr) return -1;
                if (!aFr && bFr) return 1;
                return a.name.localeCompare(b.name);
            });

            sortedVoices.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.voiceURI;
                opt.textContent = `${v.name} (${v.lang})`;
                if (v.voiceURI === TTSManager.preferredVoiceURI) {
                    opt.selected = true;
                }
                voiceSelect.appendChild(opt);
            });
        }

        // ElevenLabs Key Populate
        const elInput = document.getElementById('eleven-key');
        if (elInput && TTSManager.elevenLabsKey) {
            elInput.value = TTSManager.elevenLabsKey;
        }
    }
}

window.saveSettings = function () {
    const select = document.getElementById('model-select');
    const voiceSelect = document.getElementById('voice-select');

    if (select) {
        CURRENT_MODEL = select.value;
        localStorage.setItem('game_model', CURRENT_MODEL);
    }

    if (voiceSelect) {
        const uri = voiceSelect.value;
        TTSManager.preferredVoiceURI = uri;
        localStorage.setItem('game_voice_uri', uri);
    }

    const elInput = document.getElementById('eleven-key');
    if (elInput) {
        const key = elInput.value.trim();
        TTSManager.elevenLabsKey = key;
        if (key) localStorage.setItem('game_eleven_key', key);
        else localStorage.removeItem('game_eleven_key');
    }

    alert("Paramètres enregistrés !");
    document.getElementById('settings-modal').style.display = 'none';
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
            <div style="display:flex; gap:10px;">
                <button onclick="
                    const isMuted = !TTSManager.toggle(); 
                    this.textContent = isMuted ? '🔇' : '🔊'; 
                    this.style.borderColor = isMuted ? '#666' : '#ff8800';
                    this.style.color = isMuted ? '#666' : '#ff8800';
                " style="background:transparent; border:1px solid #ff8800; color:#ff8800; padding:5px 10px; cursor:pointer; font-size:0.9em; border-radius:20px;">
                    🔊
                </button>
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

        // Show Transition
        showLoadingTransition();

        setTimeout(async () => {
            if (decisionCheck.exitId) {
                const exit = CURRENT_SCENE.exits.find(e => e.id === decisionCheck.exitId);
                if (exit && exit.target) {
                    console.log("Branching to:", exit.target);
                    // Remove overlay just before loading (loadScene handles its own intro)
                    // Actually, let loadScene remove it or replace it.
                    loadScene(exit.target);
                } else {
                    loadScene(await pickNextScene());
                }
            } else {
                const nextSceneId = await pickNextScene();
                if (nextSceneId) loadScene(nextSceneId);
                else showGameSummary();
            }

            // Clean up overlays
            const overlays = document.querySelectorAll('div[style*="z-index: 9999"]');
            overlays.forEach(o => o.remove());

        }, 1500); // Short delay to read the "Choix enregistré" message
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
    const isNarrator = CURRENT_CHAT_TARGET.startsWith('char_l') && GAME_DATA.currentPersonas[CURRENT_CHAT_TARGET].role.includes('Médiateur') === false;
    // Actually typically the narrator IS 'char_lX_something'. But we define neutrality by ID or role.
    // Simpler: The narrator is defined in loadScene as the first char usually.
    // Let's rely on the Role description in the prompt.

    const debatePrompt = `
    CONTEXTE : Le joueur a dit : "${text}".
    SCÉNARIO : "${CURRENT_SCENE.theme}".
    RÔLE ACTUEL : ${activePersonas[CURRENT_CHAT_TARGET].displayName} (${activePersonas[CURRENT_CHAT_TARGET].bio}).
    TON SECRET AGENDA : "${activePersonas[CURRENT_CHAT_TARGET].secret_agenda || 'Aucun'}".
    AUTRES PERSOS PRÉSENTS : ${Object.values(activePersonas).map(p => p.name).join(', ')}.
    
    INSTRUCTIONS DE COMPORTEMENT :
    - SI TU ES LE NARRATEUR/MÉDIATEUR LOCAL (ex: Préfet, IA Neutre...) : SOIS STRICTEMENT NEUTRE. Ne pousse pas au choix. Pose des questions pour approfondir. Fais le lien avec les autres.
    - SI TU ES UNE PARTIE PRENANTE (ex: PDG, Activiste...) : DÉFENDS TA POSITION AVEC PASSION. Utilise ton "secret agenda". Tu veux convaincre le joueur que TU as raison.
    
    INSTRUCTIONS DYNAMIQUES :
    1. **MAÏEUTIQUE** : Si le joueur est vague, creuse.
    2. **INTERVENTION** : Si le joueur semble avoir choisi, DEMANDE-LUI EXPLICITEMENT : "Est-ce votre dernier mot ?".
    3. **ROULEMENT** : Si un autre personnage n'a pas parlé, suggère au joueur de l'interroger.
    
    NB: UTILISE LE PRÉSENT DE NARRATION (ex: "Il sourit").
    
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

    // Get the last AI message to understand the context (e.g., did the AI ask "Is this your final choice?")
    const lastAIMessage = HISTORY.length > 0 && HISTORY[HISTORY.length - 1].role === 'assistant'
        ? HISTORY[HISTORY.length - 1].content
        : "No context available.";

    // Only become lenient very late
    const leniency = turnCount > 8 ? "VERY LENIENT" : "STRICT";

    try {
        let exitPrompt = "";
        if (CURRENT_SCENE.exits) {
            exitPrompt = "POSSIBLE EXITS:\n" + CURRENT_SCENE.exits.map(e => `- ID: "${e.id}" -> ${e.description}`).join('\n');
        }

        // KEYWORDS FORCE CHECK
        const lowerInput = lastUserAction.toLowerCase();
        if (lowerInput.includes('niveau suivant') || lowerInput.includes('valid') || lowerInput.includes('confirm') || lowerInput.includes('choix fait')) {
            // Force decision mode
            return { status: "DECIDED", exitId: null };
            // We let the AI decide WHICH exit in a second pass or just default if unclear, 
            // but here we want to trigger the end.
            // Actually, we need the EXIT ID.
            // Let's ask the AI specifically for the exit ID in this forced mode.
        }

        const res = await callAIInternal(`
            ANALYZE PLAYER INPUT. Theme: "${theme}". 
            CONTEXT (LAST AI MESSAGE): "${lastAIMessage}"
            PLAYER INPUT: "${lastUserAction}"
            Mode: FORCE_DECISION_IF_CLOSE
            
            ${exitPrompt}

            Has the player made a choice?
            If they say "next level", "I confirm", "let's go", "it's decided", etc., MARK AS DECIDED.
            If they argue for a specific side (e.g. "Kill the forest"), assume they want that exit.

            Reply ONLY JSON: { "status": "DECIDED", "exitId": "ID_OF_EXIT" } OR { "status": "DEBATING" }
        `);
        return JSON.parse(res);
    } catch (e) {
        return { status: turnCount > 6 ? "DECIDED" : "DEBATING" };
    }
}

function showLoadingTransition(targetId) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: black; color: white; display: flex; flex-direction: column;
        justify-content: center; align-items: center; z-index: 9999;
        animation: fadeIn 0.5s;
    `;
    overlay.innerHTML = `
        <h1 style="font-family:'Playfair Display'; font-size: 2em; margin-bottom: 20px;">Choix Enregistré</h1>
        <div style="width: 50px; height: 50px; border: 5px solid #333; border-top-color: #ff8800; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <p style="margin-top: 20px; color: #888;">Chargement de la séquence...</p>
        <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    `;
    document.body.appendChild(overlay);

    // Fallback remove after 5s if stuck
    setTimeout(() => overlay.remove(), 5000);
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
        // Also filter out noise chunks (just "*" or empty)
        const chunks = reply.split('###')
            .map(s => s.trim())
            .filter(s => s.length > 2 || (s.length > 0 && !/^[\*]+$/.test(s)));

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

    // Create DOM element from HTML string
    const htmlString = buildMsgHTML(role, text, personaId);
    const template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    const messageRow = template.content.firstChild;

    container.appendChild(messageRow);
    container.scrollTop = container.scrollHeight;

    // TYPEWRITER EFFECT (Only for Bot & Non-Narrative)
    const isUser = role === 'user';
    const isNarrative = !isUser && /^\s*\*.*\*\s*$/.test(text);

    if (!isUser && !isNarrative) {
        const bubble = messageRow.querySelector('.msg-bubble');
        if (bubble) {
            // clear text initially
            bubble.textContent = '';

            // Calculate delay for ~200 wpm (slower)
            const speedMs = 55;
            let i = 0;

            function type() {
                if (i < text.length) {
                    bubble.textContent += text.charAt(i);
                    i++;
                    container.scrollTop = container.scrollHeight; // Keep scrolling
                    setTimeout(type, speedMs);
                }
            }
            type();
        }
    }

    // Trigger TTS (Concurrent with typing)
    if (!isUser) {
        if (isNarrative || personaId) {
            TTSManager.speak(text, personaId, isNarrative);
        }
    }
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

    // Return HTML string, but note that for Typewriter we will clear the bubble content in addMessageToUI
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
    // Switch Target
    // IMMEDIATE AUDIO CUTOFF
    TTSManager.stop();
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
