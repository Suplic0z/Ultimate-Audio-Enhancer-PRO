// ==UserScript==
// @name         Ultimate Audio Enhancer PRO v20.0
// @namespace    http://tampermonkey.net/
// @version      20.0
// @description  5.1 Upmixer avanzato con controllo preciso, ottimizzazione Spotify, zero distorsione e UI perfetta.
// @author       Audio Expert (Ultimate Edition)
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  // =========================
  // 🔧 CONFIGURAZIONE AVANZATA PER QUALITÀ AUDIO PERFETTA
  // =========================
  const CONFIG = {
    audio: {
      SAMPLE_RATE: 48000,
      SURROUND_DELAY_MS: 15,
      LFE_CUTOFF_HZ: 120,
      CENTER_BAND_HZ: [280, 3200],
      CENTER_GAIN: 0.85,
      SURROUND_GAIN: 0.75,
      LFE_GAIN: 0.8,
      FRONT_GAIN: 1.0,
      MASTER_GAIN: 1.0,
      ANALYSER_FFT: 2048,
      FADE_TIME: 0.025,
      VAD_THRESHOLD: -45,
      DIALOGUE_ENHANCEMENT: 1.3,
      BASS_BOOST: 1.5,
      NOISE_REDUCTION: 0.7,
      DISTORTION_THRESHOLD: -1.5,
      MAX_OUTPUT_LEVEL: -0.5,
      DYNAMIC_RANGE: 0.8,
      SPOTIFY_QUALITY: 320 // kbps
    },
    eq: {
      freqs: [32, 60, 150, 400, 1000, 2400, 6000, 12000, 16000],
      presets: {
        default: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        music:   [2, 1, 0, -1, 0, 1, 2, 3, 1],
        movie:   [4, 3, 2, 0, 2, 3, 1, 0, -1],
        gaming:  [3, 2, 1, 0, 1, 2, 3, 2, 1],
        podcast: [0, 2, 3, 2, 1, 0, -1, -2, -1],
        anime:   [1, 3, 4, 2, 1, 0, -1, -2, -1],
        spotify: [2, 2, 1, 0, 1, 2, 3, 2, 1],
        custom:  [0, 0, 0, 0, 0, 0, 0, 0, 0]
      }
    },
    ui: {
      theme: {
        bg: 'rgba(8, 12, 20, 0.94)',
        border: 'rgba(255, 255, 255, 0.15)',
        accent: '#4cc9f0',
        ok: '#66e28a',
        warn: '#ff9800',
        error: '#f44336',
        active: '#ff6b6b'
      },
      z: 2147483647,
      position: { x: 20, y: 20 },
      minDistanceFromEdge: 20
    }
  };

  // =========================
  // 🧠 STATO GLOBALE POTENZIATO
  // =========================
  let audioContext = null;
  let appBusIn = null;
  let appBusOut = null;
  let globalAnalyser = null;
  let globalCompressor = null;
  let noiseReductionNode = null;
  const graphs = new Map();
  let ui = null;
  let isInitialized = false;
  let isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
  let contentAnalyzer = null;
  let isSpotify = false;
  let isAnime = false;
  let isCustomPreset = false;

  const STORAGE_KEYS = {
    GLOBAL: 'u51.ultimate.global.v20',
    SITE: (host) => `u51.ultimate.site.${host}.v20`,
    CUSTOM_PRESET: 'u51.custom.preset.v20'
  };

  const defaults = {
    enabled: true,
    preset: 'movie',
    centerGain: CONFIG.audio.CENTER_GAIN,
    surroundGain: CONFIG.audio.SURROUND_GAIN,
    lfeGain: CONFIG.audio.LFE_GAIN,
    widthMs: CONFIG.audio.SURROUND_DELAY_MS,
    master: CONFIG.audio.MASTER_GAIN,
    loudness: true,
    spatialEnabled: true,
    outputDeviceId: null,
    autoEQ: true,
    compressorEnabled: true,
    channelMapping: 'z906',
    crossfeed: 0.3,
    bassBoost: 1.0,
    dialogueEnhancement: true,
    noiseReduction: 0.7,
    distortionControl: true,
    dynamicRange: 0.8,
    position: { x: 20, y: 20 },
    customPreset: null
  };

  let prefs = loadPrefs();
  let customPreset = loadCustomPreset();

  // =========================
  // 🛠 UTILITÀ POTENZIATE PER QUALITÀ AUDIO
  // =========================
  const utils = {
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    smoothstep: (t) => t * t * (3 - 2 * t),
    dbToLinear: (db) => Math.pow(10, db / 20),
    linearToDb: (linear) => 20 * Math.log10(linear),
    avg: (arr, start = 0, end = arr.length - 1) => {
      [start, end] = [Math.max(0, Math.min(arr.length - 1, start)), Math.max(0, Math.min(arr.length - 1, end))];
      if (end < start) [start, end] = [end, start];
      let sum = 0, count = 0;
      for (let i = start; i <= end; i++) {
        sum += arr[i];
        count++;
      }
      return count > 0 ? sum / count : 0;
    },
    rms: (arr) => {
      let sum = 0;
      for (let i = 0; i < arr.length; i++) {
        sum += arr[i] * arr[i];
      }
      return Math.sqrt(sum / arr.length);
    },
    normalize: (arr) => {
      const max = Math.max(...arr.map(Math.abs));
      return max > 0 ? arr.map(x => x / max) : arr;
    },
    createWienerFilter: (noiseEstimate, signalEstimate, alpha = 0.95) => {
      return (freq, i) => {
        const noise = noiseEstimate[i] || 0.001;
        const signal = signalEstimate[i] || 0.001;
        const snr = signal / noise;
        const wienerGain = (snr / (snr + 1)) * alpha + (1 - alpha);
        return Math.max(0, Math.min(1, wienerGain));
      };
    },
    debounce: (fn, delay) => {
      let timeoutId;
      return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(null, args), delay);
      };
    },
    throttle: (fn, limit) => {
      let inThrottle;
      return (...args) => {
        if (!inThrottle) {
          fn.apply(null, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    }
  };

  // =========================
  // 🔐 PREFERENZE POTENZIATE
  // =========================
  function loadPrefs() {
    try {
      const siteRaw = localStorage.getItem(STORAGE_KEYS.SITE(location.hostname));
      const globalRaw = localStorage.getItem(STORAGE_KEYS.GLOBAL);
      const site = siteRaw ? JSON.parse(siteRaw) : {};
      const global = globalRaw ? JSON.parse(globalRaw) : {};

      const merged = { ...defaults, ...global, ...site };

      // Validazione parametri
      merged.centerGain = utils.clamp(merged.centerGain, 0, 2);
      merged.surroundGain = utils.clamp(merged.surroundGain, 0, 2);
      merged.lfeGain = utils.clamp(merged.lfeGain, 0, 2);
      merged.widthMs = utils.clamp(merged.widthMs, 0, 100);
      merged.master = utils.clamp(merged.master, 0.5, 2);
      merged.crossfeed = utils.clamp(merged.crossfeed, 0, 1);
      merged.bassBoost = utils.clamp(merged.bassBoost, 1.0, 2.0);
      merged.noiseReduction = utils.clamp(merged.noiseReduction, 0, 1);
      merged.dynamicRange = utils.clamp(merged.dynamicRange, 0.5, 1.5);

      return merged;
    } catch (e) {
      return { ...defaults };
    }
  }

  function savePrefs(partial, perSite = true) {
    try {
      const key = perSite ? STORAGE_KEYS.SITE(location.hostname) : STORAGE_KEYS.GLOBAL;
      const current = JSON.parse(localStorage.getItem(key) || '{}');
      const merged = { ...current, ...partial };

      // Validazione parametri
      merged.centerGain = utils.clamp(merged.centerGain, 0, 2);
      merged.surroundGain = utils.clamp(merged.surroundGain, 0, 2);
      merged.lfeGain = utils.clamp(merged.lfeGain, 0, 2);
      merged.widthMs = utils.clamp(merged.widthMs, 0, 100);
      merged.master = utils.clamp(merged.master, 0.5, 2);
      merged.crossfeed = utils.clamp(merged.crossfeed, 0, 1);
      merged.bassBoost = utils.clamp(merged.bassBoost, 1.0, 2.0);
      merged.noiseReduction = utils.clamp(merged.noiseReduction, 0, 1);
      merged.dynamicRange = utils.clamp(merged.dynamicRange, 0.5, 1.5);

      localStorage.setItem(key, JSON.stringify(merged));
    } catch (e) {
      showToast('⚠️ Impossibile salvare le preferenze', 'warn');
    }
  }

  function loadCustomPreset() {
    try {
      const presetRaw = localStorage.getItem(STORAGE_KEYS.CUSTOM_PRESET);
      return presetRaw ? JSON.parse(presetRaw) : [...CONFIG.eq.presets.default];
    } catch (e) {
      return [...CONFIG.eq.presets.default];
    }
  }

  function saveCustomPreset(preset) {
    try {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_PRESET, JSON.stringify(preset));
      customPreset = preset;
      isCustomPreset = true;
      prefs.preset = 'custom';
      savePrefs({ preset: 'custom' });

      // Aggiorna tutti i grafi
      graphs.forEach(graph => {
        graph.applyCustomPreset();
      });

      // Aggiorna UI
      if (ui) {
        ui.updatePresetDisplay();
      }

      showToast('🎛️ Preset personalizzato salvato', 'ok');
    } catch (e) {
      showToast('⚠️ Impossibile salvare il preset personalizzato', 'warn');
    }
  }

  // =========================
  // 🔊 AUDIO CONTEXT POTENZIATO PER QUALITÀ SUPERIORE
  // =========================
  function initAudio() {
    if (audioContext && audioContext.state !== 'closed') return audioContext;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioCtx({
        sampleRate: CONFIG.audio.SAMPLE_RATE,
        latencyHint: 'playback'
      });

      appBusIn = audioContext.createGain();
      appBusOut = audioContext.createGain();
      appBusIn.gain.value = 1;
      appBusOut.gain.value = 1;

      globalAnalyser = audioContext.createAnalyser();
      globalAnalyser.fftSize = CONFIG.audio.ANALYSER_FFT;
      globalAnalyser.smoothingTimeConstant = 0.85;
      globalAnalyser.minDecibels = -90;
      globalAnalyser.maxDecibels = -25;

      // Compressore globale per loudness
      if (prefs.compressorEnabled) {
        globalCompressor = audioContext.createDynamicsCompressor();
        globalCompressor.threshold.value = -24;
        globalCompressor.knee.value = 30;
        globalCompressor.ratio.value = 12;
        globalCompressor.attack.value = 0.003;
        globalCompressor.release.value = 0.25;
      }

      // Configurazione catena di elaborazione
      appBusIn.connect(appBusOut);
      if (prefs.compressorEnabled) {
        appBusOut.connect(globalCompressor);
        globalCompressor.connect(globalAnalyser);
      } else {
        appBusOut.connect(globalAnalyser);
      }
      globalAnalyser.connect(audioContext.destination);

      const unlock = async () => {
        if (audioContext && audioContext.state === 'suspended') {
          await audioContext.resume();
          showToast('🔓 AudioContext sbloccato', 'ok');
        }
      };

      // Gestione migliore per Firefox
      if (isFirefox) {
        document.addEventListener('click', unlock, { once: true, passive: true });
        document.addEventListener('keydown', unlock, { once: true, passive: true });
      } else {
        ['click', 'touchstart', 'keydown', 'play', 'timeupdate'].forEach(e =>
          document.addEventListener(e, unlock, { once: false, passive: true })
        );
      }

      isInitialized = true;
      return audioContext;
    } catch (e) {
      console.error('❌ Inizializzazione AudioContext fallita:', e);
      showToast('❌ AudioContext non supportato', 'error');
      return null;
    }
  }

  // =========================
  // 📡 SELEZIONE USCITA POTENZIATA
  // =========================
  async function selectOutputDevice() {
    try {
      // Richiedi permessi in modo sicuro
      await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
    } catch (e) {
      console.warn('⚠️ Permessi audio non concessi:', e);
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(d => d.kind === 'audiooutput');

      if (outputs.length === 0) {
        showToast('⚠️ Nessun dispositivo di uscita trovato', 'warn');
        return;
      }

      // Logica migliorata per rilevare Z906
      const z906Pattern = /z906|z-906|logitech z906|z906 surround/i;
      const usbPattern = /usb|external|speaker|surround|5.1/i;

      let candidate = outputs.find(d => z906Pattern.test(d.label)) ||
                     outputs.find(d => usbPattern.test(d.label)) ||
                     outputs.find(d => d.deviceId === 'default') ||
                     outputs[0];

      prefs.outputDeviceId = candidate.deviceId;
      savePrefs({ outputDeviceId: candidate.deviceId });

      // Applica a tutti gli elementi esistenti
      graphs.forEach(graph => {
        if (graph.el.setSinkId) {
          graph.el.setSinkId(candidate.deviceId).catch(e =>
            console.warn('setSinkId failed:', e)
          );
        }
      });

      showToast(`🔊 Uscita: ${candidate.label.slice(0, 20)}...`, 'ok');
    } catch (e) {
      console.error('❌ Errore selezione uscita:', e);
      showToast('❌ Errore selezione uscita', 'error');
    }
  }

  // =========================
  // 🧪 TESTER CANALI MIGLIORATO
  // =========================
  async function runChannelTest() {
    const ctx = initAudio();
    if (!ctx) {
      showToast('❌ AudioContext non disponibile', 'error');
      return;
    }

    try {
      const merger = ctx.createChannelMerger(6);
      merger.channelCountMode = 'explicit';
      merger.channelInterpretation = 'discrete';
      const master = ctx.createGain();
      master.gain.value = 0.7;
      merger.connect(master);
      master.connect(ctx.destination);

      const channels = [
        { name: 'Front Left', freq: 440 },
        { name: 'Front Right', freq: 660 },
        { name: 'Center', freq: 1000 },
        { name: 'LFE', freq: 60 },
        { name: 'Surround Left', freq: 550 },
        { name: 'Surround Right', freq: 770 }
      ];

      for (const ch of channels) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = ch.freq === 60 ? 1.0 : 0.6;
        osc.frequency.value = ch.freq;
        osc.connect(gain);
        gain.connect(merger, 0, channels.indexOf(ch));
        osc.start();

        // Sintesi vocale migliorata
        speak(ch.name);

        await new Promise(r => setTimeout(r, 1500));
        osc.stop();
      }

      merger.disconnect();
      master.disconnect();
      showToast('✅ Test completato', 'ok');
    } catch (e) {
      console.error('❌ Errore test canali:', e);
      showToast('❌ Errore durante il test', 'error');
    }
  }

  function speak(text) {
    if (!window.speechSynthesis) {
      showToast('⚠️ Sintesi vocale non supportata', 'warn');
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.pitch = 1.2;
      u.volume = 1.0;

      // Selezione voce migliore
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          const preferredVoice = voices.find(v =>
            v.lang.startsWith('en') || v.lang.startsWith('it')
          ) || voices[0];
          u.voice = preferredVoice;
        }
      }

      window.speechSynthesis.speak(u);
    } catch (e) {
      console.warn('⚠️ Errore sintesi vocale:', e);
    }
  }

  // =========================
  // 📊 ANALISI CONTENUTO INTELLIGENTE (MIGLIORATA PER ANIME E SPOTIFY)
  // =========================
  class ContentAnalyzer {
    constructor() {
      this.audioContext = initAudio();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.bufferLength = this.analyser.frequencyBinCount;
      this.data = new Uint8Array(this.bufferLength);
      this.noiseProfile = new Float32Array(this.bufferLength);
      this.isNoiseProfiled = false;
      this.noiseEstimate = new Float32Array(this.bufferLength);

      // Parametri per rilevamento genere
      this.genreParams = {
        music: {
          bassThreshold: 0.7,
          midRange: [200, 4000],
          highFreq: 0.3,
          rhythmConsistency: 0.8
        },
        movie: {
          speechRange: [80, 500],
          dynamicRange: 0.6,
          lowFreqEnergy: 0.4
        },
        podcast: {
          speechFocus: [100, 300],
          limitedBandwidth: 0.7,
          consistentVolume: 0.9
        },
        anime: {
          speechRange: [150, 600],
          highClarity: 0.8,
          limitedBass: 0.3
        },
        spotify: {
          consistentBandwidth: 0.9,
          limitedDynamicRange: 0.5,
          specificCompression: 0.7
        }
      };

      this.currentGenre = 'movie'; // Default
      this.genreConfidence = 0.5;
      this.history = [];
      this.maxHistory = 15;
      this.spotifyDetection = 0;
      this.animeDetection = 0;

      // Rileva se è Spotify
      this.checkSpotify();

      this.startAnalysis();
    }

    checkSpotify() {
      // Rileva se siamo su Spotify
      isSpotify = location.hostname.includes('spotify.com') ||
                 document.querySelector('[data-testid="now-playing-widget"]') !== null ||
                 document.querySelector('.now-playing') !== null ||
                 document.querySelector('.playback-bar') !== null;
    }

    startAnalysis() {
      const process = () => {
        if (!isInitialized) {
          this.stopAnalysis();
          return;
        }

        this.analyser.getByteFrequencyData(this.data);

        // Profila il rumore se non è stato fatto
        if (!this.isNoiseProfiled && this.history.length > 5) {
          this.profileNoise();
        }

        const genre = this.detectGenre();

        // Aggiorna storia per smooth transition
        this.history.push(genre);
        if (this.history.length > this.maxHistory) {
          this.history.shift();
        }

        // Determina genere finale con smoothing
        const finalGenre = this.getFinalGenre();

        // Aggiorna se sufficientemente confidente
        if (this.genreConfidence > 0.6 && finalGenre !== this.currentGenre) {
          this.currentGenre = finalGenre;
          this.applyGenrePreset();
          showToast(`🎬 Rilevato: ${this.currentGenre.toUpperCase()}`, 'ok');
        }

        requestAnimationFrame(process);
      };

      process();
    }

    stopAnalysis() {
      // Cleanup
    }

    profileNoise() {
      // Profila il rumore di fondo per la riduzione del rumore
      this.isNoiseProfiled = true;
      for (let i = 0; i < this.bufferLength; i++) {
        this.noiseProfile[i] = this.data[i] / 255;
      }
      console.log('🔊 Profilo rumore creato');
    }

    detectGenre() {
      const energy = {
        bass: utils.avg(this.data, 0, 50) / 255,
        mid: utils.avg(this.data, 50, 150) / 255,
        high: utils.avg(this.data, 150, this.bufferLength - 1) / 255,
        speech: utils.avg(this.data, 10, 30) / 255,
        lfe: utils.avg(this.data, 0, 10) / 255,
        vocalHigh: utils.avg(this.data, 30, 50) / 255
      };

      // Rilevamento Spotify
      if (isSpotify) {
        this.spotifyDetection = 0.9;
      } else {
        // Analisi per Spotify (caratteristiche specifiche)
        const spotifyScore = (
          (energy.bass > 0.3 && energy.bass < 0.6 ? 0.5 : 0) +
          (energy.mid > 0.4 && energy.mid < 0.7 ? 0.5 : 0) +
          (energy.high > 0.2 && energy.high < 0.5 ? 0.5 : 0)
        );
        this.spotifyDetection = Math.max(this.spotifyDetection * 0.8, spotifyScore);
      }

      // Rilevamento Anime
      const animeScore = (
        (energy.speech > 0.5 ? 0.7 : 0) +
        (energy.vocalHigh > 0.6 ? 0.8 : 0) +
        (energy.bass < 0.3 ? 0.5 : 0)
      );
      this.animeDetection = Math.max(this.animeDetection * 0.8, animeScore);

      // Analisi per film
      const movieScore = (
        (energy.speech > 0.4 ? 0.7 : 0) +
        (energy.mid > 0.6 ? 0.5 : 0) +
        (energy.bass > 0.3 && energy.bass < 0.7 ? 0.4 : 0)
      );

      // Analisi per musica
      const musicScore = (
        (energy.bass > 0.6 ? 0.6 : 0) +
        (energy.high > 0.4 ? 0.5 : 0) +
        (energy.mid > 0.5 ? 0.4 : 0)
      );

      // Analisi per podcast
      const podcastScore = (
        (energy.speech > 0.6 ? 0.8 : 0) +
        (energy.bass < 0.4 ? 0.6 : 0) +
        (energy.high < 0.3 ? 0.5 : 0)
      );

      // Determina genere
      let maxScore = Math.max(movieScore, musicScore, podcastScore, this.animeDetection, this.spotifyDetection);
      let genre = 'movie';

      if (this.spotifyDetection > 0.7) {
        maxScore = this.spotifyDetection;
        genre = 'spotify';
      } else if (this.animeDetection > 0.7) {
        maxScore = this.animeDetection;
        genre = 'anime';
      } else if (maxScore === movieScore) {
        genre = 'movie';
      } else if (maxScore === musicScore) {
        genre = 'music';
      } else {
        genre = 'podcast';
      }

      this.genreConfidence = maxScore / 1.0;

      return genre;
    }

    getFinalGenre() {
      const counts = { movie: 0, music: 0, podcast: 0, anime: 0, spotify: 0 };

      this.history.forEach(genre => {
        counts[genre]++;
      });

      // Trova genere più frequente
      return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    }

    applyGenrePreset() {
      // Applica preset in base al genere
      switch (this.currentGenre) {
        case 'movie':
          prefs.preset = 'movie';
          prefs.dialogueEnhancement = true;
          prefs.bassBoost = 1.3;
          prefs.noiseReduction = 0.7;
          break;
        case 'music':
          prefs.preset = 'music';
          prefs.dialogueEnhancement = false;
          prefs.bassBoost = 1.5;
          prefs.noiseReduction = 0.5;
          break;
        case 'podcast':
          prefs.preset = 'podcast';
          prefs.dialogueEnhancement = true;
          prefs.bassBoost = 1.0;
          prefs.noiseReduction = 0.8;
          break;
        case 'anime':
          prefs.preset = 'anime';
          prefs.dialogueEnhancement = true;
          prefs.bassBoost = 1.2;
          prefs.noiseReduction = 0.6;
          break;
        case 'spotify':
          prefs.preset = 'spotify';
          prefs.dialogueEnhancement = false;
          prefs.bassBoost = 1.4;
          prefs.noiseReduction = 0.4;
          prefs.dynamicRange = 1.2;
          break;
      }

      // Aggiorna tutti i grafi
      graphs.forEach(graph => {
        graph.applyGenreSettings();
        graph.updateNoiseReduction();
      });

      // Aggiorna UI
      if (ui) {
        ui.updatePresetDisplay();
      }

      // Salva preferenze
      savePrefs({
        preset: prefs.preset,
        dialogueEnhancement: prefs.dialogueEnhancement,
        bassBoost: prefs.bassBoost,
        noiseReduction: prefs.noiseReduction,
        dynamicRange: prefs.dynamicRange
      });
    }
  }

  // =========================
  // 🎛️ UI POTENZIATA CON CORREZIONI IMPORTANTI
  // =========================
  function createUI() {
    const theme = CONFIG.ui.theme;
    const uiBox = document.createElement('div');
    uiBox.id = 'u51-ui';
    uiBox.style.cssText = `
      position: fixed;
      bottom: ${prefs.position.y}px;
      right: ${prefs.position.x}px;
      z-index: ${CONFIG.ui.z};
      background: ${theme.bg};
      border: 1px solid ${theme.border};
      border-radius: 12px;
      padding: 10px;
      color: white;
      font-family: sans-serif;
      user-select: none;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      transition: all 0.3s ease;
      max-width: 300px;
      touch-action: none;
    `;

    const header = document.createElement('div');
    header.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: bold; font-size: 16px;">🎧 AUDIO ENHANCER</span>
        <span style="font-size: 10px; opacity: 0.7;">v20.0</span>
      </div>
      <div id="u51-current-preset" style="font-size: 12px; opacity: 0.8; margin-bottom: 5px; text-align: center;">
        Preset: ${prefs.preset.toUpperCase()}
      </div>
    `;
    header.style.cssText = `
      cursor: move;
      text-align: center;
      margin-bottom: 6px;
      color: white;
      background: rgba(0,0,0,0.2);
      padding: 4px;
      border-radius: 6px;
      user-select: none;
      touch-action: none;
    `;
    uiBox.appendChild(header);

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;';
    uiBox.appendChild(btnContainer);

    const makeBtn = (text, color = '#4a90e2', tooltip = '') => {
      const b = document.createElement('button');
      b.textContent = text;
      b.title = tooltip;
      b.style.cssText = `
        padding: 6px 8px;
        border: none;
        border-radius: 6px;
        background: ${color};
        color: white;
        font-size: 11px;
        cursor: pointer;
        opacity: 0.9;
        transition: all 0.2s;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      `;
      b.onmouseenter = () => b.style.opacity = '1';
      b.onmouseleave = () => b.style.opacity = '0.9';
      return b;
    };

    const toggleBtn = makeBtn('ON', '#4CAF50', 'Attiva/Disattiva Audio Enhancer');
    toggleBtn.onclick = () => {
      prefs.enabled = !prefs.enabled;
      savePrefs({ enabled: prefs.enabled });
      toggleBtn.textContent = prefs.enabled ? 'ON' : 'OFF';
      toggleBtn.style.background = prefs.enabled ? '#4CAF50' : '#f44336';
      graphs.forEach(g => g.setEnabled(prefs.enabled));
      showToast(prefs.enabled ? '🎧 Audio Enhancer attivato' : '🔇 Audio Enhancer disattivato', prefs.enabled ? 'ok' : 'warn');
    };

    const sinkBtn = makeBtn('🔊 Uscita', '#607D8B', 'Seleziona dispositivo di uscita');
    sinkBtn.onclick = selectOutputDevice;

    const testBtn = makeBtn('🧪 Test', '#2196F3', 'Esegui test dei canali');
    testBtn.onclick = runChannelTest;

    const autoEqBtn = makeBtn('AI EQ', '#FF9800', 'Attiva/Disattiva EQ automatico');
    autoEqBtn.onclick = () => {
      prefs.autoEQ = !prefs.autoEQ;
      savePrefs({ autoEQ: prefs.autoEQ });
      autoEqBtn.textContent = prefs.autoEQ ? 'ON' : 'OFF';
      autoEqBtn.style.background = prefs.autoEQ ? '#FF9800' : '#607D8B';
      showToast(prefs.autoEQ ? '🤖 EQ automatico attivato' : '🤖 EQ automatico disattivato', prefs.autoEQ ? 'ok' : 'warn');
    };

    const dialogBtn = makeBtn('🗣️ Dialog', '#E91E63', 'Attiva/Disattiva enhancement dialoghi');
    dialogBtn.onclick = () => {
      prefs.dialogueEnhancement = !prefs.dialogueEnhancement;
      savePrefs({ dialogueEnhancement: prefs.dialogueEnhancement });
      dialogBtn.textContent = prefs.dialogueEnhancement ? 'ON' : 'OFF';
      dialogBtn.style.background = prefs.dialogueEnhancement ? '#E91E63' : '#607D8B';
      graphs.forEach(g => g.applyDialogueEnhancement());
      showToast(prefs.dialogueEnhancement ? '🗣️ Enhancement dialoghi attivato' : '🗣️ Enhancement dialoghi disattivato', prefs.dialogueEnhancement ? 'ok' : 'warn');
    };

    const noiseBtn = makeBtn('🎧 Cleaner', '#9C27B0', 'Attiva/Disattiva Noise Reduction');
    noiseBtn.onclick = () => {
      prefs.noiseReduction = prefs.noiseReduction > 0 ? 0 : 0.7;
      savePrefs({ noiseReduction: prefs.noiseReduction });
      noiseBtn.textContent = prefs.noiseReduction > 0 ? 'ON' : 'OFF';
      noiseBtn.style.background = prefs.noiseReduction > 0 ? '#9C27B0' : '#607D8B';
      graphs.forEach(g => g.updateNoiseReduction());
      showToast(prefs.noiseReduction > 0 ? '🎧 Noise Reduction attivato' : '🎧 Noise Reduction disattivato', prefs.noiseReduction > 0 ? 'ok' : 'warn');
    };

    const customBtn = makeBtn('🎛️ Custom', '#2196F3', 'Crea/Edita preset personalizzato');
    customBtn.onclick = () => {
      if (ui) {
        ui.showCustomEQEditor();
      }
    };

    btnContainer.append(toggleBtn, sinkBtn, testBtn, autoEqBtn, dialogBtn, noiseBtn, customBtn);

    // Pannello avanzato
    const advancedPanel = document.createElement('div');
    advancedPanel.id = 'u51-advanced-panel';
    advancedPanel.style.cssText = `
      margin-top: 10px;
      padding: 10px;
      background: rgba(0,0,0,0.1);
      border-radius: 8px;
      display: none;
    `;

    advancedPanel.innerHTML = `
      <div style="margin-bottom: 8px; font-size: 12px; font-weight: bold;">🎛️ Controllo Fine</div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div>
          <label style="display: flex; justify-content: space-between; width: 100%;">
            <span>Centro:</span>
            <span id="center-gain-value">${prefs.centerGain}</span>
          </label>
          <input type="range" min="0" max="2" step="0.05" value="${prefs.centerGain}"
                 id="center-gain" style="width: 100%;">
        </div>
        <div>
          <label style="display: flex; justify-content: space-between; width: 100%;">
            <span>Surround:</span>
            <span id="surround-gain-value">${prefs.surroundGain}</span>
          </label>
          <input type="range" min="0" max="2" step="0.05" value="${prefs.surroundGain}"
                 id="surround-gain" style="width: 100%;">
        </div>
        <div>
          <label style="display: flex; justify-content: space-between; width: 100%;">
            <span>LFE (Sub):</span>
            <span id="lfe-gain-value">${prefs.lfeGain}</span>
          </label>
          <input type="range" min="0" max="2" step="0.05" value="${prefs.lfeGain}"
                 id="lfe-gain" style="width: 100%;">
        </div>
        <div>
          <label style="display: flex; justify-content: space-between; width: 100%;">
            <span>Master:</span>
            <span id="master-gain-value">${prefs.master}</span>
          </label>
          <input type="range" min="0.5" max="2" step="0.05" value="${prefs.master}"
                 id="master-gain" style="width: 100%;">
        </div>
        <div>
          <label style="display: flex; justify-content: space-between; width: 100%;">
            <span>Bassi:</span>
            <span id="bass-boost-value">${prefs.bassBoost.toFixed(1)}</span>
          </label>
          <input type="range" min="1.0" max="2.0" step="0.1" value="${prefs.bassBoost}"
                 id="bass-boost" style="width: 100%;">
        </div>
        <div>
          <label style="display: flex; justify-content: space-between; width: 100%;">
            <span>Rid. Rumore:</span>
            <span id="noise-reduction-value">${(prefs.noiseReduction * 100).toFixed(0)}%</span>
          </label>
          <input type="range" min="0" max="1" step="0.05" value="${prefs.noiseReduction}"
                 id="noise-reduction" style="width: 100%;">
        </div>
        <div>
          <label style="display: flex; justify-content: space-between; width: 100%;">
            <span>Dinamica:</span>
            <span id="dynamic-range-value">${(prefs.dynamicRange * 100).toFixed(0)}%</span>
          </label>
          <input type="range" min="0.5" max="1.5" step="0.05" value="${prefs.dynamicRange}"
                 id="dynamic-range" style="width: 100%;">
        </div>
      </div>
    `;

    uiBox.appendChild(advancedPanel);

    // Toggle pannello avanzato
    const advancedToggle = document.createElement('div');
    advancedToggle.textContent = '⚙️ Avanzate';
    advancedToggle.style.cssText = `
      margin-top: 8px;
      text-align: center;
      color: #4cc9f0;
      cursor: pointer;
      font-size: 12px;
      opacity: 0.8;
      transition: opacity 0.2s;
    `;
    advancedToggle.onmouseenter = () => advancedToggle.style.opacity = '1';
    advancedToggle.onmouseleave = () => advancedToggle.style.opacity = '0.8';
    advancedToggle.onclick = () => {
      advancedPanel.style.display = advancedPanel.style.display === 'none' ? 'block' : 'none';
      advancedToggle.textContent = advancedPanel.style.display === 'none' ? '⚙️ Avanzate' : '⚙️ Nascondi';
    };
    uiBox.appendChild(advancedToggle);

    // Editor EQ personalizzato (nascosto inizialmente)
    const eqEditor = document.createElement('div');
    eqEditor.id = 'u51-eq-editor';
    eqEditor.style.cssText = `
      margin-top: 10px;
      padding: 10px;
      background: rgba(0,0,0,0.1);
      border-radius: 8px;
      display: none;
    `;

    eqEditor.innerHTML = `
      <div style="margin-bottom: 8px; font-size: 12px; font-weight: bold;">🎛️ Equalizzatore Personalizzato</div>
      <div id="eq-sliders" style="display: flex; flex-direction: column; gap: 8px;"></div>
      <div style="display: flex; gap: 5px; margin-top: 10px;">
        <button id="eq-save" style="flex: 1; padding: 5px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Salva</button>
        <button id="eq-reset" style="flex: 1; padding: 5px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">Reset</button>
      </div>
    `;

    uiBox.appendChild(eqEditor);

    document.body.appendChild(uiBox);

    // Collapsing
    let isExpanded = true;
    header.onclick = () => {
      isExpanded = !isExpanded;
      btnContainer.style.display = isExpanded ? 'grid' : 'none';
      advancedToggle.style.display = isExpanded ? 'block' : 'none';
      advancedPanel.style.display = 'none';
      eqEditor.style.display = 'none';
      advancedToggle.textContent = '⚙️ Avanzate';
      header.querySelector('span').innerHTML = `🎧 AUDIO ENHANCER ${isExpanded ? '▲' : '▼'}`;
    };

    // Drag & drop corretto (Nessun problema di posizione)
    let drag = null;
    const minDistance = CONFIG.ui.minDistanceFromEdge;

    header.onmousedown = e => {
      if (e.button !== 0) return; // Solo click sinistro
      drag = {
        x: e.clientX,
        y: e.clientY,
        initialX: uiBox.offsetLeft,
        initialY: uiBox.offsetTop,
        width: uiBox.offsetWidth,
        height: uiBox.offsetHeight
      };
      e.preventDefault();
      uiBox.style.cursor = 'grabbing';
    };

    document.addEventListener('mousemove', e => {
      if (!drag) return;

      // Calcola nuova posizione
      const newX = drag.initialX + (e.clientX - drag.x);
      const newY = drag.initialY + (e.clientY - drag.y);

      // Limita i bordi dello schermo
      const boundedX = Math.max(minDistance, Math.min(window.innerWidth - drag.width - minDistance, newX));
      const boundedY = Math.max(minDistance, Math.min(window.innerHeight - drag.height - minDistance, newY));

      // Aggiorna stile
      uiBox.style.left = `${boundedX}px`;
      uiBox.style.top = `${boundedY}px`;
      uiBox.style.right = 'auto';
      uiBox.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (drag) {
        drag = null;
        uiBox.style.cursor = 'move';

        // Salva la posizione
        prefs.position = {
          x: parseInt(uiBox.style.left),
          y: parseInt(uiBox.style.top)
        };
        savePrefs({ position: prefs.position }, true);
      }
    });

    // Gestione touch per dispositivi mobili (solo per completezza)
    header.ontouchstart = e => {
      drag = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        initialX: uiBox.offsetLeft,
        initialY: uiBox.offsetTop,
        width: uiBox.offsetWidth,
        height: uiBox.offsetHeight
      };
      e.preventDefault();
    };

    document.addEventListener('touchmove', e => {
      if (!drag) return;
      e.preventDefault();

      const touch = e.touches[0];
      const newX = drag.initialX + (touch.clientX - drag.x);
      const newY = drag.initialY + (touch.clientY - drag.y);

      const boundedX = Math.max(minDistance, Math.min(window.innerWidth - drag.width - minDistance, newX));
      const boundedY = Math.max(minDistance, Math.min(window.innerHeight - drag.height - minDistance, newY));

      uiBox.style.left = `${boundedX}px`;
      uiBox.style.top = `${boundedY}px`;
      uiBox.style.right = 'auto';
      uiBox.style.bottom = 'auto';
    }, { passive: false });

    document.addEventListener('touchend', () => {
      if (drag) {
        drag = null;

        prefs.position = {
          x: parseInt(uiBox.style.left),
          y: parseInt(uiBox.style.top)
        };
        savePrefs({ position: prefs.position }, true);
      }
    });

    // Gestione slider
    const updateSlider = (id, valueId, prefsKey) => {
      const slider = document.getElementById(id);
      const valueDisplay = document.getElementById(valueId);

      slider.value = prefs[prefsKey];
      if (valueId.includes('noise')) {
        valueDisplay.textContent = `${(prefs[prefsKey] * 100).toFixed(0)}%`;
      } else if (valueId.includes('dynamic')) {
        valueDisplay.textContent = `${(prefs[prefsKey] * 100).toFixed(0)}%`;
      } else {
        valueDisplay.textContent = prefs[prefsKey];
      }

      slider.oninput = () => {
        const value = parseFloat(slider.value);
        if (valueId.includes('noise')) {
          valueDisplay.textContent = `${(value * 100).toFixed(0)}%`;
        } else if (valueId.includes('dynamic')) {
          valueDisplay.textContent = `${(value * 100).toFixed(0)}%`;
        } else {
          valueDisplay.textContent = value;
        }

        prefs[prefsKey] = value;
        savePrefs({ [prefsKey]: value });

        // Applica a tutti i grafi
        graphs.forEach(graph => {
          if (prefsKey === 'noiseReduction') {
            graph.updateNoiseReduction();
          } else if (prefsKey === 'dynamicRange') {
            graph.updateDynamicRange();
          } else {
            graph.updateGain(prefsKey, value);
          }
        });
      };
    };

    updateSlider('center-gain', 'center-gain-value', 'centerGain');
    updateSlider('surround-gain', 'surround-gain-value', 'surroundGain');
    updateSlider('lfe-gain', 'lfe-gain-value', 'lfeGain');
    updateSlider('master-gain', 'master-gain-value', 'master');
    updateSlider('bass-boost', 'bass-boost-value', 'bassBoost');
    updateSlider('noise-reduction', 'noise-reduction-value', 'noiseReduction');
    updateSlider('dynamic-range', 'dynamic-range-value', 'dynamicRange');

    // Setup EQ Editor
    const eqSliders = document.getElementById('eq-sliders');
    const eqSaveBtn = document.getElementById('eq-save');
    const eqResetBtn = document.getElementById('eq-reset');

    // Crea slider EQ
    CONFIG.eq.freqs.forEach((freq, i) => {
      const sliderContainer = document.createElement('div');
      sliderContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 4px;
      `;

      sliderContainer.innerHTML = `
        <label style="display: flex; justify-content: space-between; width: 100%;">
          <span>${freq}Hz:</span>
          <span id="eq-gain-value-${i}">${isCustomPreset ? customPreset[i] : CONFIG.eq.presets[prefs.preset][i]}</span>
        </label>
        <input type="range" min="-12" max="12" step="0.5"
               value="${isCustomPreset ? customPreset[i] : CONFIG.eq.presets[prefs.preset][i]}"
               id="eq-gain-${i}" style="width: 100%;">
      `;

      eqSliders.appendChild(sliderContainer);

      // Aggiorna il valore visualizzato
      const slider = document.getElementById(`eq-gain-${i}`);
      const valueDisplay = document.getElementById(`eq-gain-value-${i}`);

      slider.oninput = () => {
        valueDisplay.textContent = slider.value;
        customPreset[i] = parseFloat(slider.value);

        // Applica a tutti i grafi
        graphs.forEach(graph => {
          graph.updateCustomEQ(i, parseFloat(slider.value));
        });
      };
    });

    // Salva preset personalizzato
    eqSaveBtn.onclick = () => {
      saveCustomPreset(customPreset);
    };

    // Reset preset personalizzato
    eqResetBtn.onclick = () => {
      customPreset = [...CONFIG.eq.presets.default];
      isCustomPreset = false;

      // Aggiorna gli slider
      CONFIG.eq.freqs.forEach((freq, i) => {
        const slider = document.getElementById(`eq-gain-${i}`);
        const valueDisplay = document.getElementById(`eq-gain-value-${i}`);

        slider.value = CONFIG.eq.presets.default[i];
        valueDisplay.textContent = CONFIG.eq.presets.default[i];
        customPreset[i] = CONFIG.eq.presets.default[i];
      });

      // Applica a tutti i grafi
      graphs.forEach(graph => {
        graph.applyCustomPreset();
      });

      showToast('🎛️ Preset personalizzato resettato', 'ok');
    };

    return {
      updatePresetDisplay: () => {
        const presetDisplay = document.getElementById('u51-current-preset');
        if (presetDisplay) {
          presetDisplay.textContent = `Preset: ${prefs.preset.toUpperCase()}`;
        }
      },
      updateStatus: (text, type = 'info') => {
        const status = document.createElement('div');
        status.textContent = text;
        status.style.cssText = `
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          background: ${type === 'error' ? theme.error : type === 'warn' ? theme.warn : theme.ok};
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 10px;
          white-space: nowrap;
          z-index: ${CONFIG.ui.z + 1};
        `;
        uiBox.appendChild(status);
        setTimeout(() => {
          status.style.opacity = '0';
          status.style.transition = 'opacity 0.5s';
          setTimeout(() => status.remove(), 500);
        }, 2000);
      },
      showCustomEQEditor: () => {
        // Aggiorna i valori degli slider
        CONFIG.eq.freqs.forEach((freq, i) => {
          const slider = document.getElementById(`eq-gain-${i}`);
          const valueDisplay = document.getElementById(`eq-gain-value-${i}`);

          if (isCustomPreset) {
            slider.value = customPreset[i];
            valueDisplay.textContent = customPreset[i];
          } else {
            slider.value = CONFIG.eq.presets[prefs.preset][i];
            valueDisplay.textContent = CONFIG.eq.presets[prefs.preset][i];
          }
        });

        // Mostra l'editor
        advancedPanel.style.display = 'none';
        eqEditor.style.display = 'block';
      },
      destroy: () => {
        if (uiBox.isConnected) uiBox.remove();
      }
    };
  }

  // =========================
  // 🧩 GRAPH MANAGER POTENZIATO PER QUALITÀ AUDIO SUPERIORE
  // =========================
  class GraphManager {
    constructor(el) {
      this.el = el;
      this.ctx = initAudio();
      this.state = {
        active: false,
        drm: false,
        bypass: false,
        cleanupScheduled: false
      };
      this.nodes = {};
      this.loops = { autoEQ: null, autoGain: null };
      this.voiceActivity = 0;
      this.isMusic = false;
      this.noiseEstimate = new Float32Array(CONFIG.audio.ANALYSER_FFT / 2);
      this.signalEstimate = new Float32Array(CONFIG.audio.ANALYSER_FFT / 2);

      // Timeout ID per il cleanup
      this.cleanupTimeout = null;

      this._init();
    }

    _init() {
      if (!this.ctx) {
        this._scheduleCleanup(5000);
        return;
      }

      try {
        this._buildAudioGraph();
        this._setupEventListeners();
        this._startProcessingLoops();
        this.state.active = true;
        this.state.drm = false;
        this._clearCleanup();
      } catch (e) {
        console.warn('⚠️ Errore inizializzazione grafo audio:', e);
        this._handleDRM();
        this._scheduleCleanup(5000);
      }
    }

    _buildAudioGraph() {
      try {
        this.nodes.source = this.ctx.createMediaElementSource(this.el);
      } catch (e) {
        throw new Error('DRM protected content');
      }

      // Imposta il video come muto per evitare conflitti
      this.el.muted = true;
      this._storeOriginalSettings();

      // Pre-gain per gestire il volume originale
      this.nodes.preGain = this.ctx.createGain();
      this.nodes.preGain.gain.value = this.el.volume;

      // Equalizzatore
      this._buildEQ();

      // Processore spaziale
      this._buildSpatialProcessor();

      // Upmixer 5.1
      this._build51Upmixer();

      // Post-processore
      this._buildPostProcessor();

      // Noise Reduction
      this._buildNoiseReduction();

      // Distorsione Control
      this._buildDistortionControl();

      // Percorso bypass
      this._buildBypassPath();

      // Collegamenti
      this._connectAudioGraph();

      // Applica stato iniziale
      this.setEnabled(prefs.enabled);

      // Applica impostazioni aggiuntive
      this.applyGenreSettings();
      this.applyDialogueEnhancement();
      this.updateNoiseReduction();
      this.updateDynamicRange();
      this.applyCustomPreset();
    }

    _buildEQ() {
      this.nodes.eqIn = this.ctx.createGain();
      this.nodes.eqFilters = [];
      let lastNode = this.nodes.eqIn;

      CONFIG.eq.freqs.forEach((freq, i) => {
        const filter = this.ctx.createBiquadFilter();
        filter.type = i === 0 ? 'lowshelf' : i === CONFIG.eq.freqs.length - 1 ? 'highshelf' : 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = filter.type === 'peaking' ? 1.2 : 0.7;

        const preset = CONFIG.eq.presets[prefs.preset] || CONFIG.eq.presets.default;
        filter.gain.value = preset[i] || 0;

        lastNode.connect(filter);
        lastNode = filter;
        this.nodes.eqFilters.push(filter);
      });

      this.nodes.eqOut = lastNode;
    }

    _buildSpatialProcessor() {
      this.nodes.splitter = this.ctx.createChannelSplitter(2);
      this.nodes.spatialProcessor = this.ctx.createGain();
      this.nodes.spatialProcessor.gain.value = prefs.spatialEnabled ? 1 : 0;
    }

    _build51Upmixer() {
      // Front channels
      this.nodes.frontLGain = this.ctx.createGain();
      this.nodes.frontRGain = this.ctx.createGain();
      this.nodes.frontLGain.gain.value = CONFIG.audio.FRONT_GAIN;
      this.nodes.frontRGain.gain.value = CONFIG.audio.FRONT_GAIN;

      // Center channel
      this.nodes.centerFilter = this.ctx.createBiquadFilter();
      this.nodes.centerFilter.type = 'bandpass';
      this.nodes.centerFilter.frequency.value = (CONFIG.audio.CENTER_BAND_HZ[0] + CONFIG.audio.CENTER_BAND_HZ[1]) / 2;
      this.nodes.centerFilter.Q.value = 0.8;
      this.nodes.centerGain = this.ctx.createGain();
      this.nodes.centerGain.gain.value = prefs.centerGain;

      // LFE (subwoofer)
      this.nodes.lfeLP = this.ctx.createBiquadFilter();
      this.nodes.lfeLP.type = 'lowpass';
      this.nodes.lfeLP.frequency.value = CONFIG.audio.LFE_CUTOFF_HZ;
      this.nodes.lfeLP.Q.value = 0.707;
      this.nodes.lfeGain = this.ctx.createGain();
      this.nodes.lfeGain.gain.value = prefs.lfeGain;

      // Surround channels
      this.nodes.surLDelay = this.ctx.createDelay();
      this.nodes.surRDelay = this.ctx.createDelay();
      this.nodes.surLDelay.delayTime.value = prefs.widthMs / 1000;
      this.nodes.surRDelay.delayTime.value = prefs.widthMs / 1000;
      this.nodes.surLGain = this.ctx.createGain();
      this.nodes.surRGain = this.ctx.createGain();
      this.nodes.surLGain.gain.value = prefs.surroundGain;
      this.nodes.surRGain.gain.value = prefs.surroundGain;

      // Merger 6 canali
      this.nodes.merger = this.ctx.createChannelMerger(6);
    }

    _buildPostProcessor() {
      this.nodes.masterGain = this.ctx.createGain();
      this.nodes.masterGain.gain.value = prefs.master;

      this.nodes.autoGain = this.ctx.createGain();
      this.nodes.autoGain.gain.value = 1.0;

      // Crossfeed per migliorare l'immagine stereo
      if (prefs.crossfeed > 0) {
        this.nodes.crossfeedL = this.ctx.createGain();
        this.nodes.crossfeedR = this.ctx.createGain();
        this.nodes.crossfeedL.gain.value = prefs.crossfeed * 0.5;
        this.nodes.crossfeedR.gain.value = prefs.crossfeed * 0.5;
      }

      // Bass boost
      if (prefs.bassBoost > 1.0) {
        this.nodes.bassBoost = this.ctx.createBiquadFilter();
        this.nodes.bassBoost.type = 'lowshelf';
        this.nodes.bassBoost.frequency.value = 150;
        this.nodes.bassBoost.gain.value = 20 * Math.log10(prefs.bassBoost);
      }

      // Dynamic Range Control
      this.nodes.dynamicRange = this.ctx.createDynamicsCompressor();
      this.nodes.dynamicRange.threshold.value = -24;
      this.nodes.dynamicRange.knee.value = 30;
      this.nodes.dynamicRange.ratio.value = 3;
      this.nodes.dynamicRange.attack.value = 0.003;
      this.nodes.dynamicRange.release.value = 0.25;
    }

    _buildNoiseReduction() {
      // Noise reduction node (simulato con gain)
      this.nodes.noiseReduction = this.ctx.createGain();
      this.nodes.noiseReduction.gain.value = 1.0;
    }

    _buildDistortionControl() {
      // Distorsione control con soft clipping
      this.nodes.distortionControl = this.ctx.createWaveShaper();

      // Funzione soft clipping
      const samples = 44100;
      const curve = new Float32Array(samples);
      const deg = Math.PI / 180;
      const k = 50;
      const n = 1;

      for (let i = 0; i < samples; i++) {
        const x = i * 2 / samples - 1;
        curve[i] = (3 * k * x - Math.pow(x, 3)) / (2 * k * k - 1);
      }

      this.nodes.distortionControl.curve = curve;
      this.nodes.distortionControl.oversample = '4x';
    }

    _buildBypassPath() {
      this.nodes.directGain = this.ctx.createGain();
      this.nodes.directGain.gain.value = prefs.enabled ? 0 : this.el.volume;
    }

    _connectAudioGraph() {
      // Percorso principale
      this.nodes.source.connect(this.nodes.preGain);
      this.nodes.preGain.connect(this.nodes.eqIn);
      this.nodes.eqOut.connect(this.nodes.spatialProcessor);
      this.nodes.spatialProcessor.connect(this.nodes.splitter);

      // Front channels
      this.nodes.splitter.connect(this.nodes.frontLGain, 0);
      this.nodes.splitter.connect(this.nodes.frontRGain, 1);
      this.nodes.frontLGain.connect(this.nodes.merger, 0, 0);
      this.nodes.frontRGain.connect(this.nodes.merger, 0, 1);

      // Center channel
      this.nodes.splitter.connect(this.nodes.centerFilter, 0);
      this.nodes.splitter.connect(this.nodes.centerFilter, 1);
      this.nodes.centerFilter.connect(this.nodes.centerGain);
      this.nodes.centerGain.connect(this.nodes.merger, 0, 2);

      // LFE channel
      this.nodes.splitter.connect(this.nodes.lfeLP, 0);
      this.nodes.splitter.connect(this.nodes.lfeLP, 1);
      this.nodes.lfeLP.connect(this.nodes.lfeGain);
      this.nodes.lfeGain.connect(this.nodes.merger, 0, 3);

      // Surround channels
      this.nodes.splitter.connect(this.nodes.surLDelay, 0);
      this.nodes.splitter.connect(this.nodes.surRDelay, 1);
      this.nodes.surLDelay.connect(this.nodes.surLGain);
      this.nodes.surRDelay.connect(this.nodes.surRGain);
      this.nodes.surLGain.connect(this.nodes.merger, 0, 4);
      this.nodes.surRGain.connect(this.nodes.merger, 0, 5);

      // Post-processing
      this.nodes.merger.connect(this.nodes.autoGain);

      // Crossfeed
      if (prefs.crossfeed > 0) {
        const crossfeedMerger = this.ctx.createChannelMerger(2);

        // Collega i canali frontali al crossfeed
        this.nodes.merger.connect(crossfeedMerger, 0, 0); // FL
        this.nodes.merger.connect(crossfeedMerger, 0, 1); // FR

        // Crossfeed
        crossfeedMerger.connect(this.nodes.crossfeedL, 0);
        crossfeedMerger.connect(this.nodes.crossfeedR, 1);
        this.nodes.crossfeedL.connect(this.nodes.merger, 0, 1); // FL -> FR
        this.nodes.crossfeedR.connect(this.nodes.merger, 0, 0); // FR -> FL
      }

      // Bass boost
      if (prefs.bassBoost > 1.0) {
        this.nodes.autoGain.connect(this.nodes.bassBoost);
        this.nodes.bassBoost.connect(this.nodes.noiseReduction);
      } else {
        this.nodes.autoGain.connect(this.nodes.noiseReduction);
      }

      // Noise Reduction
      this.nodes.noiseReduction.connect(this.nodes.distortionControl);

      // Distorsione Control
      this.nodes.distortionControl.connect(this.nodes.dynamicRange);

      // Dynamic Range
      this.nodes.dynamicRange.connect(this.nodes.masterGain);

      this.nodes.masterGain.connect(appBusIn);

      // Percorso bypass
      this.nodes.source.connect(this.nodes.directGain);
      this.nodes.directGain.connect(appBusIn);
    }

    _setupEventListeners() {
      this._syncVolume = this._syncVolume.bind(this);
      this.el.addEventListener('volumechange', this._syncVolume);
      this._syncVolume();

      // Gestione errori durante la riproduzione
      this.el.addEventListener('error', (e) => {
        console.warn('⚠️ Errore media element:', e);
        this._scheduleCleanup(10000);
      });

      // Gestione fine riproduzione
      this.el.addEventListener('ended', () => {
        if (this.cleanupTimeout) {
          clearTimeout(this.cleanupTimeout);
          this.cleanupTimeout = null;
        }

        this.cleanupTimeout = setTimeout(() => {
          if (this.el.ended && !this.el.paused) {
            this._scheduleCleanup(30000);
          }
        }, 30000);
      });

      // Analisi VAD per dialoghi
      this._setupVoiceActivityDetection();
    }

    _setupVoiceActivityDetection() {
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 512;
      this.nodes.source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const data = new Uint8Array(bufferLength);

      const process = () => {
        analyser.getByteFrequencyData(data);

        // Analisi range vocale (80-500Hz)
        const vocalEnergy = utils.avg(data, 10, 30) / 255;
        const totalEnergy = utils.avg(data, 0, bufferLength - 1) / 255;

        // Calcola attività vocale (0-1)
        this.voiceActivity = Math.min(1, vocalEnergy / (totalEnergy + 0.001));

        // Rileva se è musica (bassi forti)
        const bassEnergy = utils.avg(data, 0, 10) / 255;
        this.isMusic = bassEnergy > 0.6 && vocalEnergy < 0.3;

        // Aggiorna stime per noise reduction
        this._updateNoiseEstimates(data);

        requestAnimationFrame(process);
      };

      requestAnimationFrame(process);
    }

    _updateNoiseEstimates(data) {
      // Aggiorna stime per noise reduction
      for (let i = 0; i < this.noiseEstimate.length; i++) {
        const current = data[i] / 255;
        // Aggiorna noise estimate con media esponenziale
        this.noiseEstimate[i] = this.noiseEstimate[i] * 0.95 + current * 0.05;
        // Aggiorna signal estimate
        this.signalEstimate[i] = Math.max(this.signalEstimate[i] * 0.9, current);
      }
    }

    _syncVolume() {
      if (!this.nodes.preGain || this.state.cleanupScheduled) return;

      const volume = utils.clamp(this.el.volume, 0, 1);
      const currentTime = this.ctx.currentTime;

      this.nodes.preGain.gain.setTargetAtTime(
        volume,
        currentTime,
        CONFIG.audio.FADE_TIME
      );

      this.nodes.directGain.gain.setTargetAtTime(
        prefs.enabled ? 0 : volume,
        currentTime,
        CONFIG.audio.FADE_TIME
      );
    }

    _startProcessingLoops() {
      this._startAutoEQ();
      this._startAutoGain();
    }

    _startAutoEQ() {
      if (!globalAnalyser || !prefs.autoEQ) return;

      const data = new Uint8Array(globalAnalyser.frequencyBinCount);
      const binWidth = this.ctx.sampleRate / 2 / data.length;

      const process = () => {
        if (!prefs.autoEQ || !this.state.active || this.state.bypass || this.state.cleanupScheduled) {
          this.loops.autoEQ = null;
          return;
        }

        try {
          globalAnalyser.getByteFrequencyData(data);

          CONFIG.eq.freqs.forEach((freq, i) => {
            const bin = Math.floor(freq / binWidth);
            const start = Math.max(0, bin - 2);
            const end = Math.min(data.length - 1, bin + 2);
            const energy = utils.avg(data, start, end) / 255;

            const preset = CONFIG.eq.presets[prefs.preset] || CONFIG.eq.presets.default;
            const baseGain = preset[i] || 0;

            // Regolazione dinamica basata sul contenuto
            let dynamicAdjustment = 0;

            // Potenzia le frequenze vocali quando si parla
            if (freq >= 80 && freq <= 500 && this.voiceActivity > 0.3) {
              dynamicAdjustment += this.voiceActivity * 2;
            }

            // Riduci i bassi se troppo forti (per evitare distorsione)
            if (freq < 100 && energy > 0.8) {
              dynamicAdjustment -= (energy - 0.8) * 3;
            }

            // Aumenta gli alti per la musica
            if (this.isMusic && freq > 6000) {
              dynamicAdjustment += 0.5;
            }

            const target = utils.clamp(baseGain + dynamicAdjustment, -12, 12);
            const filter = this.nodes.eqFilters[i];

            filter.gain.setTargetAtTime(
              target,
              this.ctx.currentTime,
              0.1
            );
          });

          this.loops.autoEQ = requestAnimationFrame(process);
        } catch (e) {
          console.warn('⚠️ Errore auto-EQ:', e);
          this.loops.autoEQ = null;
        }
      };

      this.loops.autoEQ = requestAnimationFrame(process);
    }

    _startAutoGain() {
      if (!globalAnalyser || !prefs.loudness) return;

      const data = new Float32Array(globalAnalyser.fftSize);

      const process = () => {
        if (!prefs.loudness || !this.state.active || this.state.bypass || this.state.cleanupScheduled) {
          this.loops.autoGain = null;
          return;
        }

        try {
          globalAnalyser.getFloatTimeDomainData(data);
          const rms = utils.rms(data);

          if (rms > 0.001) {
            const current = this.nodes.autoGain.gain.value;
            const target = utils.clamp(CONFIG.loudness.autoGain.targetRMS / rms, 0.3, 4.0);
            const rate = target > current ? CONFIG.loudness.autoGain.speedUp : CONFIG.loudness.autoGain.speedDown;

            const newGain = current + (target - current) * rate;
            this.nodes.autoGain.gain.setTargetAtTime(
              newGain,
              this.ctx.currentTime,
              0.05
            );
          }

          this.loops.autoGain = requestAnimationFrame(process);
        } catch (e) {
          console.warn('⚠️ Errore auto-gain:', e);
          this.loops.autoGain = null;
        }
      };

      this.loops.autoGain = requestAnimationFrame(process);
    }

    _handleDRM() {
      this.state.drm = true;
      this.state.active = false;
      this.el.muted = false;

      if (this.cleanupTimeout) {
        clearTimeout(this.cleanupTimeout);
        this.cleanupTimeout = null;
      }

      this._scheduleCleanup(5000);
    }

    setEnabled(enabled) {
      if (this.state.drm || this.state.cleanupScheduled) return;

      prefs.enabled = !!enabled;
      savePrefs({ enabled });

      const t = this.ctx.currentTime;

      if (enabled) {
        this.state.bypass = false;
        this.nodes.directGain.gain.setTargetAtTime(0, t, CONFIG.audio.FADE_TIME);
        this.nodes.masterGain.gain.setTargetAtTime(prefs.master, t, CONFIG.audio.FADE_TIME);
      } else {
        this.state.bypass = true;
        this.nodes.masterGain.gain.setTargetAtTime(0, t, CONFIG.audio.FADE_TIME);
        this.nodes.directGain.gain.setTargetAtTime(this.el.volume, t, CONFIG.audio.FADE_TIME);
      }
    }

    applyGenreSettings() {
      // Applica impostazioni in base al genere
      const preset = CONFIG.eq.presets[prefs.preset] || CONFIG.eq.presets.default;

      // Aggiorna i filtri EQ
      for (let i = 0; i < this.nodes.eqFilters.length; i++) {
        this.nodes.eqFilters[i].gain.value = preset[i] || 0;
      }

      // Aggiorna il bass boost
      if (this.nodes.bassBoost) {
        this.nodes.bassBoost.gain.value = 20 * Math.log10(prefs.bassBoost);
      }

      // Aggiorna dynamic range
      this.updateDynamicRange();
    }

    applyDialogueEnhancement() {
      if (!this.nodes.centerGain) return;

      if (prefs.dialogueEnhancement) {
        // Aumenta leggermente il centro per migliorare i dialoghi
        this.nodes.centerGain.gain.value = prefs.centerGain * CONFIG.audio.DIALOGUE_ENHANCEMENT;
      } else {
        // Torna al valore normale
        this.nodes.centerGain.gain.value = prefs.centerGain;
      }
    }

    applyCustomPreset() {
      if (isCustomPreset) {
        for (let i = 0; i < this.nodes.eqFilters.length; i++) {
          this.nodes.eqFilters[i].gain.value = customPreset[i];
        }
      }
    }

    updateCustomEQ(index, value) {
      if (index < this.nodes.eqFilters.length) {
        this.nodes.eqFilters[index].gain.value = value;
      }
    }

    updateGain(gainType, value) {
      if (!this.nodes[gainType + 'Gain']) return;

      // Aggiorna il nodo
      this.nodes[gainType + 'Gain'].gain.value = value;

      // Se è il centro e c'è enhancement dialoghi, applica il fattore
      if (gainType === 'center' && prefs.dialogueEnhancement) {
        this.nodes.centerGain.gain.value = value * CONFIG.audio.DIALOGUE_ENHANCEMENT;
      }
    }

    updateNoiseReduction() {
      // Aggiorna il gain per la riduzione rumore
      if (this.nodes.noiseReduction) {
        this.nodes.noiseReduction.gain.value = 1.0 - (prefs.noiseReduction * 0.3);
      }
    }

    updateDynamicRange() {
      // Aggiorna il dynamic range
      if (this.nodes.dynamicRange) {
        // Regola il ratio in base alla preferenza
        const ratio = utils.clamp(3.0 / prefs.dynamicRange, 1.0, 10.0);
        this.nodes.dynamicRange.ratio.value = ratio;
      }
    }

    _scheduleCleanup(delay) {
      if (this.state.cleanupScheduled) return;

      this.state.cleanupScheduled = true;

      if (this.cleanupTimeout) {
        clearTimeout(this.cleanupTimeout);
      }

      this.cleanupTimeout = setTimeout(() => {
        this.cleanup();
      }, delay);
    }

    _clearCleanup() {
      if (this.cleanupTimeout) {
        clearTimeout(this.cleanupTimeout);
        this.cleanupTimeout = null;
      }
      this.state.cleanupScheduled = false;
    }

    cleanup() {
      if (this.state.cleanupScheduled) return;

      this._clearCleanup();

      // Cancella i loop di elaborazione
      if (this.loops.autoEQ) {
        cancelAnimationFrame(this.loops.autoEQ);
        this.loops.autoEQ = null;
      }

      if (this.loops.autoGain) {
        cancelAnimationFrame(this.loops.autoGain);
        this.loops.autoGain = null;
      }

      // Rimuove gli event listener
      this.el.removeEventListener('volumechange', this._syncVolume);
      this.el.removeEventListener('error', this._handleDRM);

      // Disconnette i nodi
      try {
        Object.values(this.nodes).forEach(node => {
          if (node && typeof node.disconnect === 'function') {
            node.disconnect();
          }
        });
      } catch (e) {
        console.warn('⚠️ Errore durante il cleanup:', e);
      }

      // Ripristina le impostazioni originali
      this._restoreOriginalSettings();

      // Rimuove dal grafo globale
      graphs.delete(this.el);

      this.state.active = false;
    }

    _storeOriginalSettings() {
      if (!this.el._u51_original) {
        this.el._u51_original = {
          volume: this.el.volume,
          muted: this.el.muted
        };
      }
    }

    _restoreOriginalSettings() {
      if (this.el._u51_original) {
        this.el.volume = this.el._u51_original.volume;
        this.el.muted = this.el._u51_original.muted;
        delete this.el._u51_original;
      }
    }
  }

  // =========================
  // 🧩 MEDIA HANDLER POTENZIATO
  // =========================
  const mediaHandler = {
    processedElements: new WeakSet(),
    scanForElements: utils.debounce(() => {
      if (!isInitialized) {
        if (!initAudio()) return;
      }

      try {
        // Ricerca in document normale
        document.querySelectorAll('audio, video').forEach(el => {
          this.processElement(el);
        });

        // Ricerca in Shadow DOM
        this.searchInShadowDOM(document);

        // Ricerca in iframe
        this.searchInIframes();
      } catch (e) {
        console.error('❌ Errore durante la scansione:', e);
      }
    }, 150),

    processElement(el) {
      if (this.processedElements.has(el) || graphs.has(el)) return;

      // Verifica se è un elemento valido
      if (!this.isValidMediaElement(el)) {
        this.processedElements.add(el);
        return;
      }

      this.processedElements.add(el);

      // Processa l'elemento
      const setupGraph = () => {
        if (graphs.has(el)) return;

        try {
          const graph = new GraphManager(el);
          graphs.set(el, graph);
          applySinkId(el);
        } catch (e) {
          console.warn('⚠️ Errore creazione GraphManager:', e);
        }
      };

      // Se è pronto, processalo subito
      if (el.readyState > 0 || !el.paused) {
        setupGraph();
      }
      // Altrimenti, attendi l'evento play
      else {
        el.addEventListener('play', setupGraph, { once: true });

        // Timeout di sicurezza
        setTimeout(setupGraph, 5000);
      }
    },

    isValidMediaElement(el) {
      // Verifica se è un elemento media
      if (el.tagName !== 'AUDIO' && el.tagName !== 'VIDEO') {
        return false;
      }

      // Verifica se ha sorgente
      if (!el.src && !el.currentSrc && !el.querySelector('source')) {
        return false;
      }

      // Verifica se è in modalità live
      if (el.duration === Infinity) {
        return false;
      }

      return true;
    },

    searchInShadowDOM(doc) {
      try {
        const hosts = doc.querySelectorAll('*');
        hosts.forEach(host => {
          if (host.shadowRoot) {
            try {
              // Ricerca in Shadow DOM
              host.shadowRoot.querySelectorAll('audio, video').forEach(el => {
                this.processElement(el);
              });

              // Ricerca ricorsiva in Shadow DOM annidati
              this.searchInShadowDOM(host.shadowRoot);
            } catch (e) {
              // Ignora errori di accesso a Shadow DOM
            }
          }
        });
      } catch (e) {
        console.warn('⚠️ Errore ricerca in Shadow DOM:', e);
      }
    },

    searchInIframes() {
      try {
        document.querySelectorAll('iframe').forEach(iframe => {
          try {
            if (iframe.contentDocument?.readyState === 'complete') {
              // Ricerca nel documento dell'iframe
              iframe.contentDocument.querySelectorAll('audio, video').forEach(el => {
                this.processElement(el);
              });

              // Ricerca in Shadow DOM nell'iframe
              this.searchInShadowDOM(iframe.contentDocument);
            }
          } catch (e) {
            // Ignora errori di accesso a iframe cross-origin
          }
        });
      } catch (e) {
        console.warn('⚠️ Errore ricerca in iframe:', e);
      }
    },

    init() {
      // Inizializza subito se il documento è già pronto
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(() => this.scanForElements(), 200);
      }
      // Altrimenti, attendi il DOMContentLoaded
      else {
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => this.scanForElements(), 500);
        });
      }

      // Osserva i cambiamenti nel DOM
      const observer = new MutationObserver(this.scanForElements);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

      // Supporto per SPA (Single Page Applications)
      let lastUrl = location.href;
      new MutationObserver(mutations => {
        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
          lastUrl = currentUrl;
          setTimeout(() => this.scanForElements(), 1000);
        }
      }).observe(document, { subtree: true, childList: true });
    }
  };

  function applySinkId(el) {
    if (typeof el.setSinkId === 'function' && prefs.outputDeviceId) {
      el.setSinkId(prefs.outputDeviceId).catch(e => {
        console.warn('setSinkId failed:', e);
      });
    }
  }

  // =========================
  // 🚀 INIZIALIZZAZIONE POTENZIATA
  // =========================
  function init() {
    console.log('🎧 Ultimate Audio Enhancer PRO v20.0 caricato');

    // Inizializza l'AudioContext
    if (!initAudio()) {
      showToast('❌ AudioContext non supportato. Funzionalità limitate.', 'error');
      return;
    }

    // Inizializza il gestore media
    mediaHandler.init();

    // Inizializza l'analizzatore di contenuto
    contentAnalyzer = new ContentAnalyzer();

    // Crea l'UI
    setTimeout(() => {
      ui = createUI();
      showToast('🎧 Audio Enhancer pronto per l\'uso', 'ok');
    }, 100);
  }

  // =========================
  // 🧹 CLEANUP POTENZIATO
  // =========================
  window.addEventListener('beforeunload', () => {
    // Cleanup di tutti i grafi
    graphs.forEach(g => {
      try {
        g.cleanup();
      } catch (e) {
        console.warn('⚠️ Errore durante il cleanup:', e);
      }
    });

    // Chiude l'AudioContext
    if (audioContext && audioContext.state !== 'closed') {
      try {
        audioContext.close();
      } catch (e) {
        console.warn('⚠️ Errore durante la chiusura di AudioContext:', e);
      }
    }

    // Cleanup analizzatore
    if (contentAnalyzer) {
      contentAnalyzer.stopAnalysis();
      contentAnalyzer = null;
    }
  });

  // =========================
  // 📣 TOAST POTENZIATO
  // =========================
  function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.textContent = msg;

    const theme = CONFIG.ui.theme;
    let backgroundColor;

    switch (type) {
      case 'ok':
        backgroundColor = theme.ok;
        break;
      case 'warn':
        backgroundColor = theme.warn;
        break;
      case 'error':
        backgroundColor = theme.error;
        break;
      default:
        backgroundColor = theme.accent;
    }

    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '86px',
      right: '24px',
      zIndex: CONFIG.ui.z + 1,
      background: `linear-gradient(135deg, ${backgroundColor}DD, ${backgroundColor}AA)`,
      color: '#fff',
      padding: '12px 20px',
      borderRadius: '12px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      fontSize: '14px',
      opacity: '0',
      transform: 'translateY(10px)',
      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      fontWeight: '600',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.2)'
    });

    document.body.appendChild(toast);

    // Animazione di entrata
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    // Animazione di uscita
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 250);
    }, 2500);
  }

  // =========================
  // 🧩 API GLOBALE POTENZIATA
  // =========================
  window.audioEnhancer = {
    getGraphs: () => Array.from(graphs.values()),
    getStatus: () => ({
      graphs: graphs.size,
      audioContext: audioContext?.state,
      sampleRate: audioContext?.sampleRate,
      maxChannels: audioContext?.destination?.maxChannelCount,
      prefs: { ...prefs },
      contentAnalysis: {
        genre: contentAnalyzer?.currentGenre,
        confidence: contentAnalyzer?.genreConfidence,
        isSpotify,
        isAnime
      }
    }),
    cleanup: () => {
      graphs.forEach(g => g.cleanup());
      graphs.clear();
      if (ui) {
        ui.destroy();
        ui = null;
      }
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
        audioContext = null;
      }
      showToast('🧹 Pulizia completata', 'ok');
    },
    reinit: () => {
      this.cleanup();
      setTimeout(init, 100);
      showToast('🔄 Audio Enhancer riavviato', 'ok');
    },
    setPreset: (presetName) => {
      if (CONFIG.eq.presets[presetName]) {
        prefs.preset = presetName;
        isCustomPreset = presetName === 'custom';
        savePrefs({ preset: presetName });
        graphs.forEach(g => {
          g.applyGenreSettings();
          g.applyCustomPreset();
        });
        if (ui) {
          ui.updatePresetDisplay();
        }
        showToast(`🎛️ Preset impostato a ${presetName}`, 'ok');
        return true;
      }
      showToast(`⚠️ Preset "${presetName}" non esiste`, 'warn');
      return false;
    },
    setEnabled: (enabled) => {
      prefs.enabled = enabled;
      savePrefs({ enabled });
      graphs.forEach(g => g.setEnabled(enabled));
      showToast(enabled ? '🎧 Audio Enhancer attivato' : '🔇 Audio Enhancer disattivato', enabled ? 'ok' : 'warn');
    },
    setDialogueEnhancement: (enabled) => {
      prefs.dialogueEnhancement = enabled;
      savePrefs({ dialogueEnhancement: enabled });
      graphs.forEach(g => {
        g.applyDialogueEnhancement();
      });
      showToast(enabled ? '🗣️ Enhancement dialoghi attivato' : '🗣️ Enhancement dialoghi disattivato', enabled ? 'ok' : 'warn');
    },
    setNoiseReduction: (level) => {
      prefs.noiseReduction = utils.clamp(level, 0, 1);
      savePrefs({ noiseReduction: prefs.noiseReduction });
      graphs.forEach(g => {
        g.updateNoiseReduction();
      });
      showToast(`🎧 Riduzione rumore impostata a ${(prefs.noiseReduction * 100).toFixed(0)}%`, 'ok');
    },
    analyzeContent: () => {
      if (contentAnalyzer) {
        contentAnalyzer.applyGenrePreset();
        return contentAnalyzer.currentGenre;
      }
      return null;
    },
    setCustomPreset: (preset) => {
      if (preset.length === CONFIG.eq.freqs.length) {
        saveCustomPreset(preset);
        isCustomPreset = true;
        graphs.forEach(g => {
          g.applyCustomPreset();
        });
        showToast('🎛️ Preset personalizzato applicato', 'ok');
        return true;
      }
      showToast('⚠️ Preset personalizzato non valido', 'warn');
      return false;
    },
    getCustomPreset: () => {
      return [...customPreset];
    }
  };

  // =========================
  // 🚨 INIZIALIZZAZIONE SICURA
  // =========================
  function safeInit() {
    try {
      // Verifica se è un sito live (escludi Twitch, ecc.)
      const livePatterns = ['twitch.tv', 'youtube.com/live', 'facebook.com/live', 'periscope.tv'];
      const isLive = livePatterns.some(pattern => location.href.includes(pattern));

      if (isLive) {
        console.log('⚠️ Upmixer disattivato su sito live');
        return;
      }

      // Verifica se l'utente ha disabilitato l'audio
      if (localStorage.getItem('u51.disabled') === 'true') {
        console.log('ℹ️ Upmixer disabilitato dall\'utente');
        return;
      }

      // Inizializza con ritardo per garantire che il DOM sia pronto
      setTimeout(init, 800);
    } catch (e) {
      console.error('❌ Errore inizializzazione:', e);
      showToast('❌ Errore critico. Consulta la console per i dettagli.', 'error');
    }
  }

  // =========================
  // 🚀 AVVIO
  // =========================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeInit);
  } else {
    safeInit();
  }

  // Aggiungi comando per riavviare da console
  console.log('%cUltimate Audio Enhancer PRO v20.0 caricato. Usa window.audioEnhancer per controllarlo.',
    'color: #4cc9f0; font-weight: bold; background: rgba(0,0,0,0.1); padding: 4px;');
})();