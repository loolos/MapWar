
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SoundManager } from './SoundManager';
import * as Tone from 'tone';

// Mock Tone.js
vi.mock('tone', () => {
    return {
        PolySynth: vi.fn().mockImplementation(function () {
            return {
                toDestination: vi.fn().mockReturnThis(),
                triggerAttackRelease: vi.fn(),
                volume: { value: 0 },
                set: vi.fn()
            };
        }),
        MetalSynth: vi.fn().mockImplementation(function () {
            return {
                toDestination: vi.fn().mockReturnThis(),
                triggerAttackRelease: vi.fn(),
                volume: { value: 0 },
                harmonicity: 0
            };
        }),
        NoiseSynth: vi.fn().mockImplementation(function () {
            return {
                toDestination: vi.fn().mockReturnThis(),
                triggerAttackRelease: vi.fn(),
                volume: { value: 0 }
            };
        }),
        MembraneSynth: vi.fn().mockImplementation(function () {
            return {
                toDestination: vi.fn().mockReturnThis(),
                triggerAttackRelease: vi.fn(),
                volume: { value: 0 }
            };
        }),
        MonoSynth: vi.fn().mockImplementation(function () {
            return {
                toDestination: vi.fn().mockReturnThis(),
                triggerAttackRelease: vi.fn(),
                volume: { value: 0 }
            };
        }),
        Synth: vi.fn(),
        Loop: vi.fn().mockImplementation(function (cb: any) {
            return {
                start: vi.fn().mockReturnThis(),
                stop: vi.fn(),
                callback: cb
            };
        }),
        Transport: {
            start: vi.fn(),
            stop: vi.fn(),
            cancel: vi.fn(),
            bpm: { value: 0 }
        },
        Destination: {
            mute: false
        },
        now: vi.fn(() => 0),
        start: vi.fn().mockResolvedValue(undefined),
        context: { state: 'suspended' },
        Time: vi.fn(() => ({ toSeconds: () => 0.1 }))
    };
});

describe('SoundManager', () => {
    let soundManager: SoundManager;

    beforeEach(() => {
        soundManager = new SoundManager();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('initializes default state', () => {
        expect(soundManager.bgmState).toBe('PEACE');
        expect(soundManager.isMuted).toBe(false);
    });

    it('starts Tone context on interaction', () => {
        soundManager.playSfx('sfx:move');
        expect(Tone.start).toHaveBeenCalled();
    });

    it('plays MetalSynth for attack SFX', () => {
        soundManager.playSfx('sfx:attack');
        expect(Tone.MetalSynth).toHaveBeenCalled();
    });

    it('updates bgm state and triggers Transport', async () => {
        soundManager.setBgmState('TENSION');
        expect(soundManager.bgmState).toBe('TENSION');

        await soundManager.playBgm('bgm_test');
        expect(Tone.Transport.start).toHaveBeenCalled();
        expect(Tone.Transport.bpm.value).toBe(90); // Tension BPM
    });

    it('toggles mute correctly', () => {
        soundManager.toggleMute();
        expect(soundManager.isMuted).toBe(true);
        expect(Tone.Destination.mute).toBe(true);

        soundManager.toggleMute();
        expect(soundManager.isMuted).toBe(false);
        expect(Tone.Destination.mute).toBe(false);
    });
});
