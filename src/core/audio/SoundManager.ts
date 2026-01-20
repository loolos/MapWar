import * as Tone from 'tone';

export class SoundManager {
    // private scene: Phaser.Scene;
    public isMuted: boolean = false;
    // private bgm: Phaser.Sound.BaseSound | null = null; // Unused

    // Volume Config
    private static readonly VOL_SFX = -10; // dB
    private static readonly VOL_BGM = -20; // dB

    // Tone.js Instruments
    private polySynth!: Tone.PolySynth;
    private metalSynth!: Tone.MetalSynth;
    private noiseSynth!: Tone.NoiseSynth;
    private membraneSynth!: Tone.MembraneSynth;
    private bgmSynth!: Tone.PolySynth; // For BGM Chords/Melody
    private bassSynth!: Tone.MonoSynth; // For BGM Bass

    private isInitialized = false;

    // BGM State
    public bgmState: 'PEACE' | 'TENSION' | 'CONFLICT' | 'DOOM' | 'PEACE_DAY' = 'PEACE';
    private bgmLoop: Tone.Loop | null = null;
    private drumLoop: Tone.Loop | null = null;

    constructor() {
        this.initializeAudio();
    }

    private async initializeAudio() {
        if (this.isInitialized) return;

        // --- Instruments Setup ---

        // 1. General SFX (Victory, Capture) - Polyphonic
        this.polySynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: "triangle" },
            envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 1 }
        }).toDestination();
        this.polySynth.volume.value = SoundManager.VOL_SFX;

        // 2. Metallic/Impact (Attack, Clash)
        this.metalSynth = new Tone.MetalSynth({
            envelope: { attack: 0.001, decay: 0.1, release: 0.5 },
            harmonicity: 5.1,
            modulationIndex: 32,
            resonance: 4000,
            octaves: 1.5
        }).toDestination();
        this.metalSynth.volume.value = SoundManager.VOL_SFX - 5;

        // 3. Noise (Move, Steps)
        this.noiseSynth = new Tone.NoiseSynth({
            noise: { type: 'pink' },
            envelope: { attack: 0.005, decay: 0.1, sustain: 0 }
        }).toDestination();
        this.noiseSynth.volume.value = SoundManager.VOL_SFX - 10;

        // 4. Drums (Music + SFX)
        this.membraneSynth = new Tone.MembraneSynth().toDestination();
        this.membraneSynth.volume.value = SoundManager.VOL_BGM;

        // 5. BGM Melody
        this.bgmSynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: "fatsawtooth" }, // Richer sound
            envelope: { attack: 0.2, decay: 0.3, sustain: 0.4, release: 2 }
        }).toDestination();
        this.bgmSynth.volume.value = SoundManager.VOL_BGM - 5; // Blend

        // 6. Bass
        this.bassSynth = new Tone.MonoSynth({
            oscillator: { type: "square" },
            envelope: { attack: 0.1, decay: 0.3, sustain: 0.2, release: 2 }
        }).toDestination();
        this.bassSynth.volume.value = SoundManager.VOL_BGM;

        this.isInitialized = true;
    }

    public async startContext() {
        if (Tone.context.state !== 'running') {
            await Tone.start();
            console.log("Tone.js Context Started");
        }
    }

    public playSfx(key: string) {
        if (this.isMuted) return;
        this.startContext(); // Ensure context is running on user interaction

        try {
            // 1. Attack / Combat
            if (key.includes('base_capture')) {
                const now = Tone.now();
                this.membraneSynth.triggerAttackRelease("C1", "8n", now);
                this.polySynth.triggerAttackRelease(["C3", "G3", "C4"], "4n", now + 0.05);
                this.metalSynth.triggerAttackRelease(220, "16n");
            }
            else if (key.includes('conquer_large')) {
                this.polySynth.triggerAttackRelease(["C3", "Eb3", "G3", "Bb3"], "2n");
                this.metalSynth.triggerAttackRelease(180, "16n");
            }
            else if (key.includes('attack')) {
                // Sharp Metallic Clang
                this.metalSynth.triggerAttackRelease(200, "32n");
                this.noiseSynth.triggerAttackRelease("8n"); // Impact thud
            }
            // 2. Capture (Flag Plant)
            else if (key.includes('capture_town')) {
                // Bell / Chime
                this.polySynth.triggerAttackRelease(["C5", "E5", "G5"], "8n");
            }
            else if (key.includes('capture_large')) {
                this.polySynth.triggerAttackRelease(["C3", "G3", "C4"], "4n");
            }
            else if (key.includes('capture_medium')) {
                this.polySynth.triggerAttackRelease(["C4", "E4", "G4"], "8n");
            }
            else if (key.includes('capture_small')) {
                this.polySynth.triggerAttackRelease(["C4"], "16n");
            }
            else if (key.includes('capture')) {
                // Land Claim - Ascending
                this.polySynth.triggerAttackRelease(["C4", "E4"], "16n");
            }
            // 3. Move
            else if (key.includes('move')) {
                // Soft step
                this.noiseSynth.triggerAttackRelease("32n");
            }
            // 4. Conquer (Enemy Land)
            else if (key.includes('conquer')) {
                // Heavy cord
                this.polySynth.triggerAttackRelease(["C3", "Eb3", "G3"], "4n");
            }
            else if (key.includes('bridge_build')) {
                this.noiseSynth.triggerAttackRelease("16n");
                this.membraneSynth.triggerAttackRelease("C2", "16n");
            }
            else if (key.includes('wall_build')) {
                this.membraneSynth.triggerAttackRelease("G1", "8n");
            }
            else if (key.includes('wall_upgrade')) {
                this.membraneSynth.triggerAttackRelease("C2", "16n");
            }
            else if (key.includes('watchtower_build')) {
                this.metalSynth.triggerAttackRelease(600, "32n");
            }
            else if (key.includes('watchtower_upgrade')) {
                this.metalSynth.triggerAttackRelease(900, "32n");
            }
            else if (key.includes('farm_build')) {
                this.polySynth.triggerAttackRelease(["E4", "G4"], "16n");
            }
            else if (key.includes('farm_upgrade')) {
                this.polySynth.triggerAttackRelease(["C4", "E4", "G4"], "16n");
            }
            else if (key.includes('base_upgrade_income')) {
                this.polySynth.triggerAttackRelease(["C4", "E4", "A4"], "8n");
            }
            else if (key.includes('base_upgrade_defense')) {
                this.polySynth.triggerAttackRelease(["C3", "G3"], "8n");
            }
            else if (key.includes('turn_event_default')) {
                this.polySynth.triggerAttackRelease(["C4", "D4", "G4"], "8n");
            }
            else if (key.includes('turn_event_flood')) {
                this.noiseSynth.triggerAttackRelease("8n");
                this.membraneSynth.triggerAttackRelease("C1", "8n");
            }
            // 5. Victory
            else if (key.includes('victory')) {
                // Fanfare
                const now = Tone.now();
                this.polySynth.triggerAttackRelease("C4", "8n", now);
                this.polySynth.triggerAttackRelease("E4", "8n", now + 0.15);
                this.polySynth.triggerAttackRelease("G4", "8n", now + 0.3);
                this.polySynth.triggerAttackRelease("C5", "2n", now + 0.45);
            }
            // 6. Gold
            else if (key.includes('gold_found')) {
                // Sparkle
                this.metalSynth.harmonicity = 12;
                this.metalSynth.triggerAttackRelease(800, "32n");
            }
            else if (key.includes('select')) {
                // Click
                this.noiseSynth.volume.value = -20;
                this.noiseSynth.triggerAttackRelease("64n");
                this.noiseSynth.volume.value = SoundManager.VOL_SFX - 10; // Reset
            }
            else if (key.includes('cancel')) {
                // Soft cancel thud
                this.membraneSynth.triggerAttackRelease("C2", "16n");
                this.noiseSynth.triggerAttackRelease("64n");
            }

        } catch (e) {
            console.warn("Tone.js SFX Error:", e);
        }
    }

    public playStartFanfare() {
        if (this.isMuted) return;
        this.startContext();

        try {
            const now = Tone.now();
            
            // Grand, majestic opening with powerful low-end
            // Deep, thunderous drum hits - even lower and more powerful
            this.membraneSynth.triggerAttackRelease("C0", "2n", now);
            this.membraneSynth.triggerAttackRelease("C0", "2n", now + 0.6);
            this.membraneSynth.triggerAttackRelease("C0", "2n", now + 1.2);
            this.membraneSynth.triggerAttackRelease("C0", "1n", now + 1.8);
            
            // Powerful bass foundation - very deep and sustained for grandeur
            this.bassSynth.triggerAttackRelease("C1", "2n", now);
            this.bassSynth.triggerAttackRelease("G1", "2n", now + 0.8);
            this.bassSynth.triggerAttackRelease("C1", "2n", now + 1.6);
            this.bassSynth.triggerAttackRelease("F1", "2n", now + 2.4);
            this.bassSynth.triggerAttackRelease("G1", "2n", now + 3.2);
            this.bassSynth.triggerAttackRelease("C1", "1n", now + 4.0);

            // Majestic chord progression - using power chords and full chords for grandeur
            // Starting with powerful, full chords in lower register
            this.polySynth.triggerAttackRelease(["C2", "G2", "C3", "E3"], "2n", now + 0.2);
            this.polySynth.triggerAttackRelease(["F2", "A2", "C3", "F3"], "2n", now + 1.0);
            this.polySynth.triggerAttackRelease(["G2", "B2", "D3", "G3"], "2n", now + 1.8);
            this.polySynth.triggerAttackRelease(["C2", "E2", "G2", "C3", "E3"], "1n", now + 2.6);
            this.polySynth.triggerAttackRelease(["G2", "B2", "D3", "G3", "B3"], "1n", now + 3.6);
            
            // Epic finale - massive chord with all voices
            this.polySynth.triggerAttackRelease(["C2", "E2", "G2", "C3", "E3", "G3", "C4"], "2n", now + 4.4);
            this.membraneSynth.triggerAttackRelease("C0", "1n", now + 4.4);
            this.membraneSynth.triggerAttackRelease("C0", "2n", now + 5.2);
            
            // Final sustained chord for resolution
            this.bassSynth.triggerAttackRelease("C1", "1n", now + 4.6);
            this.polySynth.triggerAttackRelease(["C2", "G2", "C3", "E3", "G3"], "1n", now + 5.0);
        } catch (e) {
            console.warn("Tone.js Fanfare Error:", e);
        }
    }

    public setBgmState(state: 'PEACE' | 'TENSION' | 'CONFLICT' | 'DOOM' | 'PEACE_DAY') {
        if (this.bgmState !== state) {
            console.log(`[Audio] Switching Music State: ${this.bgmState} -> ${state}`);
            this.bgmState = state;
            this.updateBgm();
        }
    }

    public async playBgm(key: string) {
        // We ignore the key, we procedurally generate based on state
        console.log("Requested BGM:", key);
        await this.startContext();
        this.updateBgm();
        Tone.Transport.start();
    }

    public stopBgm() {
        Tone.Transport.stop();
        if (this.bgmLoop) this.bgmLoop.stop();
        if (this.drumLoop) this.drumLoop.stop();
    }

    public toggleMute() {
        this.isMuted = !this.isMuted;
        Tone.Destination.mute = this.isMuted;
        return this.isMuted;
    }

    private updateBgm() {
        if (!this.isInitialized) return;

        // Stop current
        Tone.Transport.cancel(); // Clear all scheduled events

        // Config based on State
        let bpm = 60;
        // Use lower registers for a more grand, powerful feel
        let scale = ["C3", "D3", "E3", "G3", "A3"]; // Major Pentatonic (lower)
        let BassScale = ["C1", "G1"];
        let prob = 0.35;

        switch (this.bgmState) {
            case 'PEACE':
                bpm = 70;
                scale = ["C3", "D3", "E3", "G3", "A3"]; // Major (lower)
                this.bgmSynth.set({ oscillator: { type: "fatsine" } });
                prob = 0.35;
                break;
            case 'TENSION':
                bpm = 90;
                scale = ["C3", "Eb3", "F3", "G3", "Bb3"]; // Minor Pentatonic (lower)
                BassScale = ["C1", "G1", "Bb1"];
                this.bgmSynth.set({ oscillator: { type: "triangle" } });
                prob = 0.55;
                break;
            case 'CONFLICT':
                bpm = 110;
                scale = ["C3", "Eb3", "G3", "Ab3", "B2"]; // Harmonic Minorish (lower)
                BassScale = ["C1", "C1", "G1", "Ab1"];
                this.bgmSynth.set({ oscillator: { type: "sawtooth" } });
                prob = 0.65;
                break;
            case 'DOOM':
                bpm = 140;
                scale = ["C3", "Db3", "E3", "G3", "Bb3"]; // Diminished / Phrygian (lower)
                this.bgmSynth.set({ oscillator: { type: "fmsawtooth" } });
                prob = 0.85;
                break;
            case 'PEACE_DAY':
                bpm = 55;
                scale = ["C3", "E3", "G3", "B3", "D4"]; // Soft major
                BassScale = ["C1", "G1"];
                this.bgmSynth.set({ oscillator: { type: "sine" } });
                prob = 0.2;
                break;
        }

        Tone.Transport.bpm.value = bpm;

        // 1. Melody Loop
        this.bgmLoop = new Tone.Loop((time) => {
            if (Math.random() < prob) {
                const note = scale[Math.floor(Math.random() * scale.length)];
                const dur = Math.random() > 0.7 ? "2n" : "4n";
                const usePowerChord = Math.random() < 0.35;
                if (usePowerChord) {
                    const lowerOctave = note.replace(/\d/, (n) => String(Math.max(1, Number(n) - 1)));
                    this.bgmSynth.triggerAttackRelease([note, lowerOctave], dur, time);
                } else {
                    this.bgmSynth.triggerAttackRelease(note, dur, time);
                }
            }
        }, "4n").start(0);

        // 2. Bass / Pad
        new Tone.Loop((time) => {
            const note = BassScale[Math.floor(Math.random() * BassScale.length)];
        const dur = (this.bgmState === 'PEACE' || this.bgmState === 'PEACE_DAY') ? "2m" : "1m";
            this.bassSynth.triggerAttackRelease(note, dur, time);
        }, (this.bgmState === 'PEACE' || this.bgmState === 'PEACE_DAY') ? "2m" : "1m").start(0);

        // 3. Drums
        this.drumLoop = new Tone.Loop((time) => {
            // Simple Kick pattern (deeper for grandeur)
            const kickNote = this.bgmState === 'PEACE' ? "C1" : "C0";
            this.membraneSynth.triggerAttackRelease(kickNote, "16n", time);

            if (this.bgmState !== 'PEACE' && this.bgmState !== 'PEACE_DAY') {
                // Snare/Offbeat
                this.noiseSynth.triggerAttackRelease("16n", time + Tone.Time("4n").toSeconds());
                // Extra Kick
                this.membraneSynth.triggerAttackRelease(kickNote, "16n", time + Tone.Time("8n").toSeconds() * 3);
            }
        }, (this.bgmState === 'PEACE' || this.bgmState === 'PEACE_DAY') ? "1m" : "2n").start(0);
    }
}
