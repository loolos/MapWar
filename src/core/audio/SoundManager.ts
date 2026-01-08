import Phaser from 'phaser';

export class SoundManager {
    private scene: Phaser.Scene;
    private isMuted: boolean = false;
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

    private bgmInterval: any = null;

    private playBgmFallback() {
        if (this.bgmInterval) clearInterval(this.bgmInterval);

        // Simple "March" Loop: Dum... Dum... Dum-Dum-Dum
        // const beatInterval = 1000; // Unused
        let beat = 0;

        const loop = () => {
            if (this.isMuted) return;
            try {
                const ctx = (this.scene.sound as any).context as AudioContext;
                if (!ctx || ctx.state === 'suspended') return;
                const now = ctx.currentTime;

                const playDrum = (vol: number, pitch = 100) => {
                    // Reuse playSynths logic or simple quick implementation here to avoid scope issues
                    // Thud
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.frequency.setValueAtTime(pitch, now);
                    osc.type = 'triangle';
                    gain.gain.setValueAtTime(vol, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now);
                    osc.stop(now + 0.2);
                };

                // Beat Pattern: 1 (Strong), 2 (Weak), 3 (Strong), 4 (Roll)
                if (beat % 4 === 0) playDrum(0.3, 80);
                else if (beat % 4 === 2) playDrum(0.3, 80);
                else if (beat % 4 === 3) playDrum(0.1, 120); // Offbeat

                // Ambient String swell every 4 beats
                if (beat % 8 === 0) {
                    // Low Cello Drone
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.frequency.setValueAtTime(130.81, now); // C3
                    osc.type = 'sawtooth';

                    // Lowpass filter for "String" sound
                    const filter = ctx.createBiquadFilter();
                    filter.type = 'lowpass';
                    filter.frequency.setValueAtTime(400, now);

                    osc.connect(filter);
                    filter.connect(gain);
                    gain.connect(ctx.destination);

                    gain.gain.setValueAtTime(0, now);
                    gain.gain.linearRampToValueAtTime(0.1, now + 1.0);
                    gain.gain.linearRampToValueAtTime(0, now + 4.0);

                    osc.start(now);
                    osc.stop(now + 4.0);
                }

                beat++;
            } catch (e) {
                // ignore
            }
        };

        this.bgmInterval = setInterval(loop, 500); // Quarter notes at 120BPM logic (500ms)
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

        } catch (e) {
            console.warn("Audio Synth Error:", e);
        }
    }
}
