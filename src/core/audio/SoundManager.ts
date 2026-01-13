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
    public bgmState: 'PEACE' | 'TENSION' | 'CONFLICT' | 'DOOM' = 'PEACE';
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
            if (key.includes('attack')) {
                // Sharp Metallic Clang
                this.metalSynth.triggerAttackRelease(200, "32n");
                this.noiseSynth.triggerAttackRelease("8n"); // Impact thud
            }
            // 2. Capture (Flag Plant)
            else if (key.includes('capture_town')) {
                // Bell / Chime
                this.polySynth.triggerAttackRelease(["C5", "E5", "G5"], "8n");
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

        } catch (e) {
            console.warn("Tone.js SFX Error:", e);
        }
    }

    public setBgmState(state: 'PEACE' | 'TENSION' | 'CONFLICT' | 'DOOM') {
        if (this.bgmState !== state) {
            console.log(`[Audio] Switching Music State: ${this.bgmState} -> ${state}`);
            this.bgmState = state;
            this.updateBgm();
        }
    }

    public playBgm(key: string) {
        // We ignore the key, we procedurally generate based on state
        console.log("Requested BGM:", key);
        this.startContext();
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
        let scale = ["C4", "D4", "E4", "G4", "A4"]; // Major Pentatonic
        let BassScale = ["C2", "G2"];
        let prob = 0.3;

        switch (this.bgmState) {
            case 'PEACE':
                bpm = 70;
                scale = ["C4", "D4", "E4", "G4", "A4"]; // Major
                this.bgmSynth.set({ oscillator: { type: "fatsine" } });
                break;
            case 'TENSION':
                bpm = 90;
                scale = ["C4", "Eb4", "F4", "G4", "Bb4"]; // Minor Pentatonic
                BassScale = ["C2", "G2", "Bb2"];
                this.bgmSynth.set({ oscillator: { type: "triangle" } });
                prob = 0.5;
                break;
            case 'CONFLICT':
                bpm = 110;
                scale = ["C4", "Eb4", "G4", "Ab4", "B3"]; // Harmonic Minorish
                BassScale = ["C2", "C2", "G1", "Ab1"];
                this.bgmSynth.set({ oscillator: { type: "sawtooth" } });
                prob = 0.6;
                break;
            case 'DOOM':
                bpm = 140;
                scale = ["C4", "Db4", "E4", "G4", "Bb4"]; // Diminished / Phrygian
                this.bgmSynth.set({ oscillator: { type: "fmsawtooth" } });
                prob = 0.8;
                break;
        }

        Tone.Transport.bpm.value = bpm;

        // 1. Melody Loop
        this.bgmLoop = new Tone.Loop((time) => {
            if (Math.random() < prob) {
                const note = scale[Math.floor(Math.random() * scale.length)];
                // Randomize duration
                const dur = Math.random() > 0.7 ? "2n" : "4n";
                this.bgmSynth.triggerAttackRelease(note, dur, time);
            }
        }, "4n").start(0);

        // 2. Bass / Pad
        if (this.bgmState !== 'PEACE') {
            new Tone.Loop((time) => {
                const note = BassScale[Math.floor(Math.random() * BassScale.length)];
                this.bassSynth.triggerAttackRelease(note, "1m", time);
            }, "1m").start(0);
        }

        // 3. Drums
        if (this.bgmState !== 'PEACE') {
            this.drumLoop = new Tone.Loop((time) => {
                // Simple Kick pattern
                this.membraneSynth.triggerAttackRelease("C1", "16n", time);

                if (this.bgmState === 'CONFLICT' || this.bgmState === 'DOOM') {
                    // Snare/Offbeat
                    this.noiseSynth.triggerAttackRelease("16n", time + Tone.Time("4n").toSeconds());
                    // Extra Kick
                    this.membraneSynth.triggerAttackRelease("C1", "16n", time + Tone.Time("8n").toSeconds() * 3);
                }
            }, "2n").start(0);
        }
    }
}
