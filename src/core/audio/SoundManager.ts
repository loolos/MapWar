import Phaser from 'phaser';

export class SoundManager {
    private scene: Phaser.Scene;
    public isMuted: boolean = false;
    private bgm: Phaser.Sound.BaseSound | null = null;

    // Volume Config
    private static readonly VOL_SFX = 0.6;
    private static readonly VOL_BGM = 0.4;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    public playSfx(key: string, config: Phaser.Types.Sound.SoundConfig = {}) {
        if (this.isMuted) return;

        if (this.scene.sound.get(key)) {
            // Play actual asset
            this.scene.sound.play(key, {
                volume: SoundManager.VOL_SFX,
                detune: (Math.random() * 200) - 100, // Slight pitch variance (-100 to 100 cents)
                ...config
            });
        } else {
            // Fallback: Synthetic Beep (for development/testing)
            // console.warn(`SoundManager: Asset '${key}' not found. Playing synth fallback.`);
            this.playSynthFallback(key);
        }
    }

    public playBgm(key: string) {
        if (this.bgm) {
            this.bgm.stop();
        }

        if (this.scene.sound.get(key)) {
            this.bgm = this.scene.sound.add(key, {
                loop: true,
                volume: SoundManager.VOL_BGM
            });
            if (!this.isMuted) {
                this.bgm.play();
            }
        } else {
            // Fallback: Procedural Orchestral Loop
            // console.warn(`SoundManager: BGM '${key}' not found. Playing procedural loop.`);
            this.playBgmFallback();
        }
    }

    public stopBgm() {
        if (this.bgm) {
            this.bgm.stop();
        }
        if (this.bgmInterval) {
            clearInterval(this.bgmInterval);
            this.bgmInterval = null;
        }
    }

    // Dynamic BGM State
    public bgmState: 'PEACE' | 'TENSION' | 'CONFLICT' | 'DOOM' = 'PEACE';
    private bgmInterval: any = null;

    public setBgmState(state: 'PEACE' | 'TENSION' | 'CONFLICT' | 'DOOM') {
        if (this.bgmState !== state) {
            console.log(`[Audio] Switching Music State: ${this.bgmState} -> ${state}`);
            this.bgmState = state;
            // Restart loop to apply tempo changes immediately if needed
            if (this.bgmInterval) {
                this.playBgmFallback(); // Re-trigger with new state params
            }
        }
    }

    private playBgmFallback() {
        if (this.bgmInterval) clearInterval(this.bgmInterval);

        let beat = 0;

        // Configuration per State
        const CONFIG = {
            'PEACE': { bpm: 60, prob: 0.2, scale: [261.63, 293.66, 329.63, 392.00, 440.00], drum: 0 },
            'TENSION': { bpm: 90, prob: 0.3, scale: [261.63, 277.18, 311.13, 349.23, 392.00], drum: 0.2 }, // Minor/Diminished
            'CONFLICT': { bpm: 120, prob: 0.4, scale: [261.63, 311.13, 392.00, 523.25], drum: 0.5 },
            'DOOM': { bpm: 150, prob: 0.6, scale: [130.81, 196.00, 261.63, 311.13, 370.00], drum: 0.8 }  // Low & Fast
        };

        const loop = () => {
            if (this.isMuted) return;
            const cfg = CONFIG[this.bgmState];

            try {
                const ctx = (this.scene.sound as any).context as AudioContext;
                if (!ctx || ctx.state === 'suspended') return;
                const now = ctx.currentTime;

                // --- TRACK 1: MELODY / ATMOSPHERE ---
                if (Math.random() < cfg.prob) {
                    const note = cfg.scale[Math.floor(Math.random() * cfg.scale.length)];
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();

                    // Instrument Type
                    if (this.bgmState === 'PEACE') osc.type = 'sine';
                    else if (this.bgmState === 'TENSION') osc.type = 'triangle';
                    else osc.type = 'sawtooth'; // Conflict/Doom -> harsher

                    osc.frequency.setValueAtTime(note, now);
                    osc.connect(gain);
                    gain.connect(ctx.destination);

                    // Envelope
                    gain.gain.setValueAtTime(0, now);
                    const attack = this.bgmState === 'PEACE' ? 0.5 : 0.05;
                    const release = this.bgmState === 'PEACE' ? 4.0 : 0.5;
                    gain.gain.linearRampToValueAtTime(0.1, now + attack);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + release);

                    osc.start(now);
                    osc.stop(now + release);
                }

                // --- TRACK 2: PERCUSSION ---
                if (cfg.drum > 0) {
                    const playDrum = (vol: number, pitch = 100, isSnare = false) => {
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();

                        // Kick vs Snare
                        if (isSnare) {
                            // White Noise burst (Approximated with fast random modulation or check if noise buffer available)
                            // Use simplified Triangle with high pitch drop for snare-ish tone
                            osc.type = 'triangle';
                            osc.frequency.setValueAtTime(200, now);
                            osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
                        } else {
                            // Kick
                            osc.frequency.setValueAtTime(pitch, now);
                            osc.type = 'triangle';
                            osc.frequency.exponentialRampToValueAtTime(10, now + 0.1);
                        }

                        gain.gain.setValueAtTime(vol, now);
                        gain.gain.exponentialRampToValueAtTime(0.001, now + (isSnare ? 0.2 : 0.1));

                        osc.connect(gain);
                        gain.connect(ctx.destination);
                        osc.start(now);
                        osc.stop(now + 0.2);
                    };



                    if (this.bgmState === 'TENSION') {
                        // Heartbeat: Boom... Boom...
                        if (beat % 8 === 0 || beat % 8 === 2) playDrum(cfg.drum, 60);
                    }
                    else if (this.bgmState === 'CONFLICT') {
                        // Marching: Boom, snare, boom, snare
                        if (beat % 2 === 0) playDrum(cfg.drum, 80); // Kick
                        else playDrum(cfg.drum * 0.7, 150, true);   // Snare
                    }
                    else if (this.bgmState === 'DOOM') {
                        // Rapid Fire
                        playDrum(cfg.drum, 60);
                        if (Math.random() > 0.5) playDrum(cfg.drum * 0.5, 120, true);
                    }
                }

                beat++;
            } catch (e) {
                // ignore
            }
        };

        // Calculate Interval from BPM
        // beat = quarter note? Let's say beat = eighth note for granularity
        const stateBpm = CONFIG[this.bgmState].bpm;
        const msPerBeat = (60000 / stateBpm) / 2; // Eighth notes

        this.bgmInterval = setInterval(loop, msPerBeat);
    }

    public toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.bgm) {
            if (this.isMuted) {
                this.bgm.pause();
            } else {
                this.bgm.resume();
            }
        }
        return this.isMuted;
    }

    // --- Orchestral / Epic Fallback Synthesis ---
    private playSynthFallback(key: string) {
        try {
            const ctx = (this.scene.sound as any).context as AudioContext;
            if (!ctx || ctx.state === 'suspended') return;

            const now = ctx.currentTime;

            // Helper to play a tone
            const playTone = (freq: number, type: OscillatorType, duration: number, vol: number, attack = 0.01) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = type;
                osc.frequency.setValueAtTime(freq, now);

                osc.connect(gain);
                gain.connect(ctx.destination);

                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(vol, now + attack);
                gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

                osc.start(now);
                osc.stop(now + duration);
            };

            // Helper for Noise (Drums)
            const playNoise = (duration: number, vol: number) => {
                const bufferSize = ctx.sampleRate * duration;
                const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = Math.random() * 2 - 1;
                }
                const noise = ctx.createBufferSource();
                noise.buffer = buffer;

                const gain = ctx.createGain();
                // Lowpass filter for "Thud" vs "Hiss"
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 150;

                noise.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);

                gain.gain.setValueAtTime(vol, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

                noise.start(now);
            };

            if (key.includes('select')) {
                // Paper/Map Sound: Quick, dry noise + high tick
                playNoise(0.05, 0.2);
            }
            else if (key.includes('move')) {
                // Marching Step: Low thud
                playNoise(0.15, 0.4);
            }
            else if (key.includes('attack')) {
                // Combat: Sword Clang / Impact
                playNoise(0.3, 0.5); // Impact
                playTone(100, 'sawtooth', 0.2, 0.3); // Grit
            }
            else if (key.includes('capture_town')) {
                // Town Bell / Chime (Distinct)
                playTone(523.25, 'sine', 1.0, 0.4, 0.05); // C5 Bell
                playTone(1046.50, 'sine', 1.0, 0.2, 0.05); // C6 Overtone
            }
            else if (key.includes('conquer')) {
                // Epic Enemy Land Capture: Heavy Impact + Brass
                playNoise(0.5, 0.6); // Boom
                playTone(130.81, 'sawtooth', 0.8, 0.5, 0.05); // Low C3 Brass
                playTone(196.00, 'sawtooth', 0.8, 0.4, 0.05); // G3
            }
            else if (key.includes('capture')) {
                // Neutral Land: Brass Swell (Lighter)
                playTone(261.63, 'sawtooth', 0.6, 0.2, 0.1); // C4
                playTone(329.63, 'sawtooth', 0.6, 0.2, 0.1); // E4
            }
            else if (key.includes('victory')) {
                // Epic Fanfare: Major Triad + Octave
                const duration = 2.0;
                playTone(261.63, 'sawtooth', duration, 0.2, 0.1); // C4
                playTone(329.63, 'sawtooth', duration, 0.2, 0.1); // E4
                playTone(392.00, 'sawtooth', duration, 0.2, 0.1); // G4
                playTone(523.25, 'sawtooth', duration, 0.2, 0.1); // C5

                // Drum roll?
                playNoise(1.5, 0.3);
            }
            else if (key.includes('eliminate')) {
                // Dark Boom
                playNoise(0.8, 0.6);
                playTone(55, 'sawtooth', 0.8, 0.4); // Low A1
            }
            else if (key.includes('gold_found')) {
                // Magical Chime / Sparkle
                playTone(523.25, 'sine', 0.5, 0.3, 0.05); // C5
                setTimeout(() => playTone(659.25, 'sine', 0.5, 0.3, 0.05), 100); // E5
                setTimeout(() => playTone(783.99, 'sine', 0.5, 0.3, 0.05), 200); // G5
                setTimeout(() => playTone(1046.50, 'sine', 0.8, 0.2, 0.1), 300); // C6
            }
            else if (key.includes('gold_depleted')) {
                // Crumble / Collapse
                playNoise(0.6, 0.5);
                playTone(60, 'sawtooth', 0.5, 0.4, 0.01); // Low rumble
                setTimeout(() => playTone(50, 'square', 0.4, 0.3, 0.01), 100);
            }

        } catch (e) {
            console.warn("Audio Synth Error:", e);
        }
    }
}
