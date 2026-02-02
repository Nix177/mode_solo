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
window.TTSManager = TTSManager;

// --- MUSIC MANAGER (BACKGROUND MUSIC) ---
const MusicManager = {
    enabled: true,
    audio: null,
    tracks: {
        contemplation: 'assets/music/contemplation.mp3',
        thought: 'assets/music/thought.mp3',
        tension: 'assets/music/tension.mp3',
        resolution: 'assets/music/resolution.mp3',
        uplifting: 'assets/music/uplifting.mp3',
        cosmic: 'assets/music/cosmic.mp3',
        grove: 'assets/music/grove.mp3',
        sunlight: 'assets/music/sunlight.mp3',
        drift: 'assets/music/drift.mp3'
    },
    currentTrack: null,
    shuffledOrder: [],
    shuffleIndex: 0,

    shuffle: function () {
        const names = Object.keys(this.tracks);
        // Fisher-Yates shuffle
        for (let i = names.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [names[i], names[j]] = [names[j], names[i]];
        }
        this.shuffledOrder = names;
        this.shuffleIndex = 0;
    },

    play: function (trackName) {
        if (!this.enabled) return;
        const src = this.tracks[trackName] || this.tracks.contemplation;
        if (this.currentTrack === src && this.audio && !this.audio.paused) return;

        this.stop();
        this.audio = new Audio(src);
        this.audio.loop = false; // No loop, we use shuffle
        this.audio.volume = 0.05;
        this.audio.onended = () => this.nextTrack();
        this.audio.play().catch(e => console.warn('Music autoplay blocked:', e));
        this.currentTrack = src;

        // Update label if exists
        const label = document.getElementById('music-track-name');
        if (label) label.textContent = trackName;
    },

    playRandom: function () {
        if (this.shuffledOrder.length === 0) this.shuffle();
        const track = this.shuffledOrder[this.shuffleIndex];
        this.play(track);
    },

    stop: function () {
        if (this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
            this.audio = null;
        }
        this.currentTrack = null;
    },

    toggle: function () {
        this.enabled = !this.enabled;
        if (this.audio) {
            if (!this.enabled) {
                this.audio.pause();
            } else {
                this.audio.play().catch(e => console.warn('Music resume blocked:', e));
            }
        }
        return this.enabled;
    },

    setVolume: function (vol) {
        if (this.audio) this.audio.volume = vol;
    },

    getTrackNames: function () {
        return this.shuffledOrder.length > 0 ? this.shuffledOrder : Object.keys(this.tracks);
    },

    getCurrentTrackName: function () {
        const names = Object.keys(this.tracks);
        for (const name of names) {
            if (this.tracks[name] === this.currentTrack) return name;
        }
        return 'contemplation';
    },

    nextTrack: function () {
        if (this.shuffledOrder.length === 0) this.shuffle();
        this.shuffleIndex = (this.shuffleIndex + 1) % this.shuffledOrder.length;
        const next = this.shuffledOrder[this.shuffleIndex];
        this.play(next);
    },

    prevTrack: function () {
        if (this.shuffledOrder.length === 0) this.shuffle();
        this.shuffleIndex = (this.shuffleIndex - 1 + this.shuffledOrder.length) % this.shuffledOrder.length;
        const prev = this.shuffledOrder[this.shuffleIndex];
        this.play(prev);
    }
};

window.MusicManager = MusicManager;

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
    TTSManager.stop(); // Stop previous TTS

    // --- BACKGROUND MUSIC WILL START AFTER FIRST USER CLICK ---
    // (Browser autoplay policy blocks audio until interaction)

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

    // Extended delay to ensure DOM is ready and avoid race conditions
    await new Promise(r => setTimeout(r, 800));

    // 3. Trigger Greeting Sequence (BUTTON-CONTROLLED TOUR)
    console.log(`[loadScene] Intro check: History len = ${CHAT_SESSIONS[narratorId] ? CHAT_SESSIONS[narratorId].length : 0}`);
    if (CHAT_SESSIONS[narratorId].length <= 1) {
        // A. Narrator Intro
        const introPrompt = `
        RÔLE : ${GAME_DATA.currentPersonas[narratorId].name} (${GAME_DATA.currentPersonas[narratorId].role}).
        SCÉNARIO : "${scene.narrative ? scene.narrative.context : scene.theme}".
        
        MISSION CRITIQUE :
        1. Souhaite la bienvenue au "Médiateur".
        2. Expose brièvement le cœur du conflit de manière NEUTRE et FACTUELLE.
        3. Annonce que tu vas laisser la parole aux parties prenantes.
        
        FORMAT : Blocs courts séparés par "###". Descriptions 3ème personne en *italique* et AU PRÉSENT.
        `;
        await callBot(introPrompt, narratorId, true);

        // B. Button-controlled Tour Loop
        const extras = Object.values(GAME_DATA.currentPersonas).filter(p => p.id !== narratorId);

        for (let i = 0; i < extras.length; i++) {
            const p = extras[i];
            const isLast = (i === extras.length - 1);
            const buttonLabel = isLast ? "Retour au Médiateur ➜" : `Écouter ${p.name} ➜`;

            // Show button prompting to next persona
            const container = document.getElementById('chat-scroll');
            if (container) {
                const btnId = 'tour-btn-' + Date.now();
                const btnHTML = `
                    <div id="${btnId}" style="display:flex; justify-content:center; margin: 20px 0; animation: fadeIn 0.5s;">
                        <button style="background:#ff8800; border:none; color:white; padding:10px 25px; border-radius:25px; cursor:pointer; font-size:1em; font-weight:bold;">
                            ${buttonLabel}
                        </button>
                    </div>
                `;
                container.innerHTML += btnHTML;
                container.scrollTop = container.scrollHeight;

                // Wait for click
                await new Promise(resolve => {
                    const btnEl = document.getElementById(btnId);
                    if (btnEl) {
                        btnEl.onclick = function () {
                            btnEl.remove();
                            // Start music on first user interaction
                            if (!MusicManager.audio) MusicManager.playRandom();
                            resolve();
                        };
                    } else {
                        resolve();
                    }
                });
            }

            // Switch to persona and trigger greeting
            window.openSideChat(p.id);
            await checkAutoGreeting(p.id);
        }

        // C. Final button to return to narrator
        const container = document.getElementById('chat-scroll');
        if (container) {
            const btnId = 'tour-final-' + Date.now();
            const btnHTML = `
                <div id="${btnId}" style="display:flex; justify-content:center; margin: 20px 0; animation: fadeIn 0.5s;">
                    <button style="background:#ff8800; border:none; color:white; padding:10px 25px; border-radius:25px; cursor:pointer; font-size:1em; font-weight:bold;">
                        Commencer le débat ➜
                    </button>
                </div>
            `;
            container.innerHTML += btnHTML;
            container.scrollTop = container.scrollHeight;

            await new Promise(resolve => {
                const btnEl = document.getElementById(btnId);
                if (btnEl) {
                    btnEl.onclick = function () {
                        btnEl.remove();
                        resolve();
                    };
                } else {
                    resolve();
                }
            });
        }

        // D. Return to Narrator with final instruction
        window.openSideChat(narratorId);
        await callBot(`
        CONTEXTE : Les parties se sont présentées.
        ACTION : Invite le joueur à poser des questions ou approfondir avec chacun avant de trancher.
        Rappelle que tu es là pour arbitrer.
        `, narratorId);

        // Flash Roster
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
                console.error(`Error attempting to enable fullscreen: ${err.message} `);
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
                linear-gradient(to bottom, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.8) 100%),
                    url('${bgUrl}') center / cover no-repeat
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
        // Skip typewriter for restored history - display instantly
        addMessageToUI(msg.role === 'assistant' ? 'bot' : 'user', msg.content, personaId, true);
    });
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// --- CHECK AUTO GREETING ---
async function checkAutoGreeting(personaId) {
    if (!CHAT_SESSIONS[personaId] || CHAT_SESSIONS[personaId].length === 0) {
        const p = (GAME_DATA.currentPersonas || GAME_DATA.personas)[personaId];
        const greetingPrompt = `
                RÔLE: ${p.displayName}.
                CONTEXTE: Le joueur "Médiateur" vient de se tourner vers toi pour la première fois.
                    ACTION : Présente - toi brièvement et donne ton avis sur la situation("${CURRENT_SCENE.theme}").
                        FORMAT : Court(max 40 mots).Descriptions * italique * et AU PRÉSENT.
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
                <button id="btn-music" onclick="
                    const isOn = MusicManager.toggle();
                    this.textContent = isOn ? '🎵' : '🔇';
                    this.style.borderColor = isOn ? '#ff8800' : '#666';
                    this.style.color = isOn ? '#ff8800' : '#666';
                " title="Musique" style="background:transparent; border:1px solid #ff8800; color:#ff8800; padding:5px 10px; cursor:pointer; font-size:0.9em; border-radius:20px;">
                    🎵
                </button>
                <button id="btn-voice" onclick="
                    const isOn = TTSManager.toggle();
                    this.textContent = isOn ? '🗣️' : '🙊';
                    this.style.borderColor = isOn ? '#ff8800' : '#666';
                    this.style.color = isOn ? '#ff8800' : '#666';
                " title="Voix" style="background:transparent; border:1px solid #ff8800; color:#ff8800; padding:5px 10px; cursor:pointer; font-size:0.9em; border-radius:20px;">
                    🗣️
                </button>
                <button onclick="window.viewProfile()" style="background:transparent; border:1px solid #ff8800; color:#ff8800; padding:5px 15px; cursor:pointer; font-size:0.8em; border-radius:20px;">
                    👁️ Synthèse
                </button>
            </div>
        </div >

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
        addMessageToUI('bot', `[SYSTÈME] : Choix enregistré.Fin de séquence.`, CURRENT_CHAT_TARGET);

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
                // Only show summary every 5 levels, otherwise pick next scene
                if (PLAYED_SCENES.length > 0 && PLAYED_SCENES.length % 5 === 0) {
                    showGameSummary(true); // true = intermediate summary, not end
                } else {
                    const nextSceneId = await pickNextScene();
                    if (nextSceneId) loadScene(nextSceneId);
                    else showGameSummary(false); // false = final summary
                }
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
                CONTEXTE: Le joueur a dit: "${text}".
                    SCÉNARIO : "${CURRENT_SCENE.theme}".
    RÔLE ACTUEL: ${activePersonas[CURRENT_CHAT_TARGET].displayName} (${activePersonas[CURRENT_CHAT_TARGET].bio}).
    TON SECRET AGENDA: "${activePersonas[CURRENT_CHAT_TARGET].secret_agenda || 'Aucun'}".
    AUTRES PERSOS PRÉSENTS: ${Object.values(activePersonas).map(p => p.name).join(', ')}.
    
    INSTRUCTIONS DE COMPORTEMENT:
                - SI TU ES LE NARRATEUR / MÉDIATEUR LOCAL(ex: Préfet, IA Neutre...) : SOIS STRICTEMENT NEUTRE.Ne pousse pas au choix.Pose des questions pour approfondir.Fais le lien avec les autres.
    - SI TU ES UNE PARTIE PRENANTE(ex: PDG, Activiste...) : DÉFENDS TA POSITION AVEC PASSION.Utilise ton "secret agenda".Tu veux convaincre le joueur que TU as raison.
    
    INSTRUCTIONS DYNAMIQUES:
                1. ** MAÏEUTIQUE ** : Si le joueur est vague, creuse.
    2. ** INTERVENTION ** : Si le joueur semble avoir choisi, DEMANDE - LUI EXPLICITEMENT: "Est-ce votre dernier mot ?".
    3. ** ROULEMENT ** : Si un autre personnage n'a pas parlé, suggère au joueur de l'interroger.

                    NB: UTILISE LE PRÉSENT DE NARRATION(ex: "Il sourit").

                        FORMAT :
                - Sépare tes idées en blocs courts(max 80 mots) avec "###".
    - Dialogue libre, mais * actions en italique *.
    `;

    await callBot(debatePrompt, CURRENT_CHAT_TARGET);
};
window.sendUserMessage = window.sendPlayerAction;

// --- END GAME SUMMARY ---
async function showGameSummary(isIntermediate = false) {
    ui.screen.innerHTML = `
        <div class="slide-content" style="text-align:center;">
            <h1>COMPILATION DES RÉSULTATS...</h1>
            <p>L'IA interprète vos choix et les statistiques...</p>
        </div>`;

    const prompt = `
                RÔLE: OBSERVATEUR ANALYTIQUE DE DONNÉES.
    DONNÉES DE SESSION COMPLÈTES(TRANSCRIPTION) :
    ${JSON.stringify(GLOBAL_HISTORY)}

                TÂCHE: Rédige une synthèse interprétative de la partie(200 mots max) pour le joueur.
    1. Analyse la cohérence de ses choix à travers les différents scénarios.
    2. Détecte ses contradictions ou ses évolutions morales.
    3. Cite des moments précis("Dans la vallée de Kymal, vous avez dit...").

                    Format : HTML simple(sans balises < html >, juste < p >, <h2>, etc).
                        `;

    try {
        const report = await callAIInternal(prompt);
        ui.screen.innerHTML = `
            <div class="slide-content" style="max-width: 800px; text-align: left; overflow-y:auto; max-height:80vh;">
                <h1 style="color: #4cd137;">${isIntermediate ? 'Synthèse Intermédiaire' : 'Synthèse Finale'}</h1>
                <div style="background: rgba(0,0,0,0.3); padding: 25px; border-radius: 8px; margin-top:20px; line-height: 1.6; font-size: 1.1em;">
                    ${report}
                </div>
                <div style="text-align:center; margin-top:30px;">
                    ${isIntermediate
                ? `<button onclick="(async () => { const next = await pickNextScene(); if(next) loadScene(next); })()" style="padding: 15px 30px; cursor:pointer; background:#ff8800; color:#fff; border:none; border-radius:4px; font-weight:bold;">Continuer l'Aventure</button>`
                : `<button onclick="location.reload()" style="padding: 15px 30px; cursor:pointer; background:#ddd; color:#000; border:none; border-radius:4px; font-weight:bold;">Recommencer</button>`
            }
                </div>
            </div>
        `;
    } catch (e) {
        ui.screen.innerHTML = "<div class='slide-content'><h1>Erreur de génération du rapport.</h1></div>";
    }
}

// --- AI FUNCTIONS ---

async function checkDecisionMade(lastUserAction, theme, turnCount) {
    console.log(`[DEBUG checkDecisionMade] turnCount=${turnCount}, lastUserAction="${lastUserAction}"`);

    // INCREASED THRESHOLD: Don't check too early. Let the conversation flow.
    if (turnCount < 4) {
        console.log(`[DEBUG checkDecisionMade] turnCount < 4, returning DEBATING`);
        return { status: "DEBATING" };
    }

    // Get the last AI message to understand the context (e.g., did the AI ask "Is this your final choice?")
    const chatHistory = CHAT_SESSIONS[CURRENT_CHAT_TARGET] || [];
    const lastAIMessage = chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'assistant'
        ? chatHistory[chatHistory.length - 1].content
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
        const keywords = ['niveau suivant', 'valid', 'confirm', 'choix fait', 'décidé', 'final', 'passons', 'oui', 'ok', 'd\'accord', 'go', 'je choisis', 'c\'est bon', 'allez', 'refuse', 'accepte'];
        const hasKeyword = keywords.some(k => lowerInput.includes(k));
        console.log(`[DEBUG checkDecisionMade] keyword check: hasKeyword=${hasKeyword}, input="${lowerInput}"`);

        // Get full conversation for context
        const fullTranscript = GLOBAL_HISTORY.filter(h => h.sceneId === CURRENT_SCENE.id)
            .map(h => `${h.role}: ${h.content}`).join('\n');

        if (hasKeyword || turnCount > 6) {
            // Force decision mode but still try to infer the exit from conversation
            console.log(`[DEBUG checkDecisionMade] Keyword/turn limit detected! Inferring exit...`);

            if (CURRENT_SCENE.exits && CURRENT_SCENE.exits.length > 0) {
                const inferRes = await callAIInternal(`
                    ANALYSE LA CONVERSATION POUR DETERMINER LE CHOIX DU JOUEUR.
                    
                    TRANSCRIPTION COMPLÈTE:
                    ${fullTranscript}
                    
                    ${exitPrompt}
                    
                    MISSION: Basé sur ce que le joueur a dit tout au long de la conversation, quel exit correspond le mieux à sa position?
                    Si le joueur a défendu la nature/forêt/protection, choisis l'exit qui protège.
                    Si le joueur a défendu le progrès/technologie/économie, choisis l'exit qui extrait/développe.
                    
                    Réponds UNIQUEMENT l'ID de l'exit (ex: "PROTECT" ou "EXTRACT"). Rien d'autre.
                `);
                const inferredExit = inferRes.trim().replace(/["']/g, '').toUpperCase();
                const matchedExit = CURRENT_SCENE.exits.find(e => e.id.toUpperCase() === inferredExit);
                console.log(`[DEBUG checkDecisionMade] Inferred exit: ${inferredExit}, matched:`, matchedExit);
                return { status: "DECIDED", exitId: matchedExit ? matchedExit.id : CURRENT_SCENE.exits[0].id };
            }
            return { status: "DECIDED", exitId: null };
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

            Reply ONLY JSON: {"status": "DECIDED", "exitId": "ID_OF_EXIT" } OR {"status": "DEBATING" }
        `);
        console.log(`[DEBUG checkDecisionMade] AI response: ${res}`);
        const parsed = JSON.parse(res);
        console.log(`[DEBUG checkDecisionMade] Parsed result:`, parsed);
        return parsed;
    } catch (e) {
        console.log(`[DEBUG checkDecisionMade] Error parsing, fallback. turnCount=${turnCount}`, e);
        // Fallback: if turn limit reached, use first exit
        if (turnCount > 6 && CURRENT_SCENE.exits && CURRENT_SCENE.exits.length > 0) {
            return { status: "DECIDED", exitId: CURRENT_SCENE.exits[0].id };
        }
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
                        <style>@keyframes spin {0 % { transform: rotate(0deg); } 100% {transform: rotate(360deg); } }</style>
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

    // Build options with theme info for AI selection
    const options = available.slice(0, 15).map(id => {
        return { id: id, theme: GAME_DATA.scenario.scenes[id].theme };
    });

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
        // Check if bestId is in available array (which is strings)
        if (!available.includes(bestId)) {
            console.log(`[pickNextScene] AI returned invalid ID "${bestId}", using first available: ${available[0]}`);
            return available[0];
        }
        return bestId;
    } catch (e) {
        console.error(e);
        return available[0];
    }
}

window.pickNextScene = pickNextScene;

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

    if (!data.reply) return '{"status": "DEBATING" }'; // Fail-safe default

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
            // Must have real content (not just asterisks, spaces, or very short)
            .filter(s => {
                const cleaned = s.replace(/[\*\s]/g, '');
                return cleaned.length > 0;
            });

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
                console.log(`[callBot DEBUG] Creating chunk loader: ${chunkLoadingId}`);
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

function addMessageToUI(role, text, personaId, skipTypewriter = false) {
    const container = document.getElementById('chat-scroll');
    if (!container) {
        console.warn("[addMessageToUI] Container #chat-scroll not found!");
        return;
    }

    // TYPEWRITER EFFECT (Only for Bot & Non-Narrative, unless skipTypewriter is true)
    const isUser = role === 'user';
    const isNarrative = !isUser && /^\s*\*.*\*\s*$/.test(text);

    // Clean text: strip leading/trailing asterisks from dialogue (not narrative)
    let displayText = text;
    if (!isUser && !isNarrative) {
        // Remove ALL markdown asterisks to prevent artifacts in bubbles
        displayText = text.replace(/\*/g, '').trim();
    }

    // DEBUG LOG
    console.log(`[addMessageToUI] Role:${role}, Skip:${skipTypewriter}, IsNarrative:${isNarrative}, Text:${displayText.substring(0, 20)}...`);

    // For typewriter effect, pass empty initial content to avoid flash
    // Skip typewriter if explicitly requested (e.g., restoring history)
    const useTypewriter = !isUser && !isNarrative && !skipTypewriter;
    const initialText = useTypewriter ? '' : displayText;

    if (useTypewriter) console.log("[addMessageToUI] Using Typewriter effect.");

    // Create DOM element from HTML string
    const htmlString = buildMsgHTML(role, initialText, personaId, isNarrative);
    const template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    const messageRow = template.content.firstChild;

    container.appendChild(messageRow);

    // Force scroll and layout calc
    // void messageRow.offsetWidth; 
    container.scrollTop = container.scrollHeight;

    if (useTypewriter) {
        const bubble = messageRow.querySelector('.msg-bubble');
        if (bubble) {
            console.log(`[addMessageToUI DEBUG] Bubble found. Ready to type.`);
            // Calculate delay for faster typing (~260 wpm)
            const speedMs = 28;
            let i = 0;

            function type() {
                if (i < displayText.length) {
                    bubble.textContent += displayText.charAt(i);
                    i++;
                    container.scrollTop = container.scrollHeight; // Keep scrolling
                    setTimeout(type, speedMs);
                }
            }
            // Start typing with a tiny delay to ensure render
            console.log(`[addMessageToUI DEBUG] Starting typewriter timeout for text len ${displayText.length}...`);
            setTimeout(type, 10);

            // FAILSAFE: Force text appearance if animation stalls
            setTimeout(() => {
                if (bubble.textContent.length < displayText.length) {
                    console.warn(`[addMessageToUI FAILSAFE] Typewriter stalled at ${bubble.textContent.length}/${displayText.length}. Forcing text.`);
                    bubble.textContent = displayText;
                    container.scrollTop = container.scrollHeight;
                }
            }, displayText.length * speedMs + 2000);
        } else {
            console.warn("[addMessageToUI] Bubble element not found for typewriter!");
        }
    }

    // Trigger TTS (Concurrent with typing)
    if (!isUser && !skipTypewriter) {
        if (isNarrative || personaId) {
            TTSManager.speak(displayText, personaId, isNarrative);
        }
    }
}

// MODIFICATION : Style CSS-in-JS pour alignement Avatar + Bulle + Narratif
function buildMsgHTML(role, text, personaId, isNarrativeParam = null) {
    const isUser = role === 'user';
    // Use provided isNarrative or calculate if not provided
    const isNarrative = isNarrativeParam !== null ? isNarrativeParam : (!isUser && /^\s*\*.*\*\s*$/.test(text));

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
