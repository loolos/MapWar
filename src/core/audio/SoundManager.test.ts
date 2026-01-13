
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Phaser module to prevent 'window is not defined' error
vi.mock('phaser', () => {
    return {
        default: {
            Scene: class { },
            Sound: {
                BaseSound: class { }
            }
        }
    };
});

import { SoundManager } from './SoundManager';

// Mock Phaser Scene and AudioContext
const mockContext = {
    createOscillator: vi.fn(() => ({
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        frequency: { setValueAtTime: vi.fn() },
        type: 'sine'
    })),
    createGain: vi.fn(() => ({
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
    })),
    createBiquadFilter: vi.fn(() => ({
        connect: vi.fn(),
        frequency: { setValueAtTime: vi.fn(), value: 0 },
        type: 'lowpass'
    })),
    createBuffer: vi.fn(() => ({
        getChannelData: vi.fn(() => new Float32Array(1024))
    })),
    createBufferSource: vi.fn(() => ({
        connect: vi.fn(),
        start: vi.fn(),
        buffer: null
    })),
    currentTime: 0,
    state: 'running',
    sampleRate: 44100
};

const mockScene = {
    sound: {
        get: vi.fn(),
        add: vi.fn(),
        context: mockContext
    }
} as any;

describe('SoundManager', () => {
    let soundManager: SoundManager;

    beforeEach(() => {
        vi.clearAllMocks();
        soundManager = new SoundManager(mockScene);
    });

    it('initializes with PEACE state', () => {
        expect(soundManager.bgmState).toBe('PEACE');
    });

    it('updates music state correctly', () => {
        soundManager.setBgmState('CONFLICT');
        expect(soundManager.bgmState).toBe('CONFLICT');
    });

    it('plays dynamic BGM without crashing', () => {
        vi.useFakeTimers();
        soundManager.setBgmState('CONFLICT'); // Ensure drums play (deterministic)
        soundManager.playBgm('missing_file'); // Trigger fallback

        // Advance time to trigger loop
        vi.advanceTimersByTime(1000);

        // Check if oscillators were created (implies loop ran)
        expect(mockContext.createOscillator).toHaveBeenCalled();

        vi.useRealTimers();
    });
});
