
import Phaser from 'phaser';
import { GameConfig } from '../core/GameConfig';
import { SaveRegistry } from '../core/saves/SaveRegistry';
import { SoundManager } from '../core/audio/SoundManager';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    private domElement!: Phaser.GameObjects.DOMElement;
    private background!: Phaser.GameObjects.Image;
    private soundManager!: SoundManager;

    preload() {
        this.load.image('war_map_bg', 'assets/war_map_background.png');
    }

    create() {
        // Background
        this.background = this.add.image(this.scale.width / 2, this.scale.height / 2, 'war_map_bg')
            .setOrigin(0.5)
            .setDepth(-1); // Ensure behind UI

        this.applyBackgroundCover();

        // HTML UI Container
        // refined styles for responsiveness and transparency
        // Using a full-screen flex container to ensure perfect centering regardless of content size changes
        const uiHTML = `
            <style>
                .ui-root {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .menu-container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 15px;
                    width: 90%;
                    max-width: 800px;
                    max-height: 90%; /* Use max-height, not fixed */
                    height: auto; /* Allow shrinking */
                    overflow-y: auto; /* Enable scroll if content is too tall */
                    background: rgba(0, 0, 0, 0.75); /* Semi-transparent dark bg */
                    backdrop-filter: blur(5px);
                    padding: 3vw;
                    border-radius: 12px;
                    color: white;
                    font-family: 'Arial', sans-serif;
                    /* Use vmin to scale with the smaller dimension (good for both portrait/landscape) */
                    font-size: clamp(14px, 2.5vmin, 18px);
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    border: 1px solid rgba(255,255,255,0.1);
                    box-sizing: border-box;
                    margin: 0 auto;
                }
                .col-left {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    justify-content: flex-start;
                }
                .col-right {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    height: 100%;
                }
                .control-group {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                    background: rgba(255,255,255,0.05);
                    padding: 8px;
                    border-radius: 8px;
                }
                .control-row {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                    justify-content: center;
                }
                input, select {
                    font-size: 1em; /* inherit scale */
                    padding: 5px;
                    border-radius: 4px;
                    border: none;
                    text-align: center;
                    background: rgba(255,255,255,0.9);
                }
                .player-list {
                    flex: 1;
                    overflow-y: auto;
                    background: rgba(0,0,0,0.3);
                    padding: 8px;
                    border-radius: 8px;
                    border: 1px solid #444;
                }
                .player-slot {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px;
                    background: rgba(255,255,255,0.1);
                    margin-bottom: 5px;
                    border-radius: 4px;
                }
                .player-slot select {
                    min-width: 90px;
                    flex: 0 0 auto;
                }
                .player-slot span {
                    flex: 0 0 auto;
                }
                .player-slot select,
                .player-slot span {
                    white-space: nowrap;
                }

                .btn-start {
                    font-size: 1.2em;
                    padding: 12px;
                    background: #4444ff;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    width: 100%;
                    box-shadow: 0 4px 0 #2222aa;
                    margin-top: 5px;
                    transition: all 0.1s;
                }
                .btn-start:hover { background: #6666ff; transform: translateY(-1px); }
                .btn-start:active { transform: translateY(2px); box-shadow: 0 2px 0 #2222aa; }

                .preset-section {
                    margin-top: auto; 
                }
                
                @media (max-width: 450px), (max-aspect-ratio: 1/1) {
                    /* Stack if very narrow OR if portrait (height > width) */
                    .menu-container {
                        grid-template-columns: 1fr;
                        max-height: 95%;
                        height: auto;
                        width: 95%;
                        padding: 10px;
                        font-size: clamp(14px, 3vmin, 16px); 
                        box-sizing: border-box;
                    }
                    /* On mobile/portrait, stack: Configs first, then Player List */
                    .col-left { order: 1; width: 100%; box-sizing: border-box; }
                    .col-right { order: 2; height: auto; min-height: 200px; width: 100%; box-sizing: border-box; }
                    .control-group { padding: 8px; width: 100%; box-sizing: border-box; }
                    .control-row { flex-wrap: wrap; } 
                    .player-list { min-height: 200px; width: 100%; box-sizing: border-box; }
                    
                    input, select { 
                        font-size: 16px; 
                        max-width: 100%; 
                        box-sizing: border-box;
                    }
                    .player-slot { flex-wrap: wrap; }
                    .player-slot select { width: 100%; margin-left: 0; }
                }
            </style>

            <div class="ui-root">
                <div class="menu-container">
                    <!-- Left Column: Configs & Actions -->
                    <div class="col-left">
                    <div class="control-group">
                        <label style="font-weight:bold; text-align:center;">MAP CONFIG</label>
                        <div class="control-row">
                            <span>Size:</span>
                            <input type="number" id="mapWidthInput" placeholder="W" min="10" max="40" value="10" style="width:3em;">
                            <span>x</span>
                            <input type="number" id="mapHeightInput" placeholder="H" min="10" max="40" value="10" style="width:3em;">
                        </div>
                        <div class="control-row" style="margin-top: 5px;">
                             <span>Type:</span>
                             <select id="mapTypeSelect" style="width: 8em;">
                                 <option value="default">Default</option>
                                 <option value="archipelago">Archipelago</option>
                                 <option value="pangaea">Pangaea</option>
                                 <option value="mountains">Mountains</option>
                                 <option value="rivers">Rivers</option>
                             </select>
                        </div>
                    </div>

                    <div class="control-group">
                        <label style="font-weight:bold; text-align:center;">PLAYERS</label>
                        <div class="control-row">
                            <span>Count:</span>
                            <input type="number" id="playerCountInput" min="2" max="8" value="2" style="width:4em;">
                        </div>
                        <div class="control-row" style="margin-top: 5px;">
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                                <input type="checkbox" id="tutorialToggle">
                                <span>Enable Tutorial</span>
                            </label>
                        </div>
                    </div>

                    <div class="preset-section">
                        <label style="display:block; margin-bottom:5px;">Load Preset:</label>
                        <select id="presetSelect" style="width: 100%; padding: 8px;">
                            <option value="">-- New Game --</option>
                            <!-- Populated via JS -->
                        </select>
                    </div>

                    <button id="startGameBtn" class="btn-start">START GAME</button>
                    <!-- Spacer for scroll -->
                    <div style="height:10px;"></div>
                </div>

                <!-- Right Column: Player List -->
                <div class="col-right">
                    <label style="font-weight:bold; margin-bottom:5px;">PLAYER ROSTER</label>
                    <div id="playerList" class="player-list">
                        <!-- Slots -->
                    </div>
                </div>
            </div>
            </div>
        `;

        this.domElement = this.add.dom(0, 0)
            .createFromHTML(uiHTML)
            .setOrigin(0, 0); // Use top-left to align with full-screen container
        this.domElement.setPerspective(GameConfig.UI_MENU_PERSPECTIVE);
        const domNode = this.domElement.node as HTMLElement | null;
        if (domNode) {
            domNode.style.width = `${this.scale.width}px`;
            domNode.style.height = `${this.scale.height}px`;
        }

        // Fade-in for menu on start
        this.domElement.setAlpha(0);
        this.tweens.add({
            targets: this.domElement,
            alpha: 1,
            duration: GameConfig.UI_MENU_FADE_DURATION,
            ease: 'Sine.Out'
        });

        // Audio: majestic start fanfare on scene load
        this.soundManager = new SoundManager();
        
        // Try to auto-play start fanfare
        // Note: Browser autoplay policies may require user interaction first
        this.soundManager.startContext().then(() => {
            // Small delay to ensure audio context is fully ready
            this.time.delayedCall(GameConfig.UI_MENU_FANFARE_DELAY, () => {
                this.soundManager.playStartFanfare();
            });
        }).catch((err) => {
            console.warn("Could not auto-play start fanfare:", err);
            // Fallback: play on first user interaction
            const playOnInteraction = () => {
                this.soundManager.playStartFanfare();
                // Remove listener after first play
                document.removeEventListener('click', playOnInteraction);
                document.removeEventListener('touchstart', playOnInteraction);
            };
            document.addEventListener('click', playOnInteraction, { once: true });
            document.addEventListener('touchstart', playOnInteraction, { once: true });
        });

        // --- Logic Binding ---

        // 1. Populate Presets
        const presetSelect = this.domElement.getChildByID('presetSelect') as HTMLSelectElement;
        const saves = Object.keys(SaveRegistry);
        saves.forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.text = SaveRegistry[key].name;
            presetSelect.add(opt);
        });

        // 2. Update Player List
        const updateSlots = () => {
            const countInput = this.domElement.getChildByID('playerCountInput') as HTMLInputElement;
            const listDiv = this.domElement.getChildByID('playerList') as HTMLDivElement;
            if (!countInput || !listDiv) return;

            const count = Phaser.Math.Clamp(parseInt(countInput.value) || 2, 2, 8);

            // Preserve existing settings if possible? For now, rebuild.
            // Check existing values to restore state if needed (advanced polish).

            let html = '';
            for (let i = 1; i <= count; i++) {
                const isAI = i > 1; // Default
                const color = GameConfig.COLORS['P' + i as keyof typeof GameConfig.COLORS].toString(16).padStart(6, '0');

                html += `
                    <div class="player-slot">
                        <div style="width: 18px; height: 18px; background: #${color}; border: 1px solid white; border-radius: 50%;"></div>
                        <span style="font-weight: bold; width: 30px;">P${i}</span>
                        <select id="type_P${i}" style="color: black; margin-left: auto;">
                            <option value="human">HUMAN</option>
                            <option value="ai" ${isAI ? 'selected' : ''}>AI</option>
                        </select>
                    </div>
                `;
            }
            listDiv.innerHTML = html;
        };

        const countInp = this.domElement.getChildByID('playerCountInput');
        if (countInp) {
            countInp.addEventListener('change', updateSlots);
            countInp.addEventListener('input', updateSlots);
        }
        updateSlots(); // Initial

        // 3. Start Game Listener
        const btn = this.domElement.getChildByID('startGameBtn');
        if (btn) {
            btn.addEventListener('click', () => {
                // Start game without playing fanfare (already played on menu load)
                const presetVal = (this.domElement.getChildByID('presetSelect') as HTMLSelectElement).value;
                const tutorialChecked = (this.domElement.getChildByID('tutorialToggle') as HTMLInputElement)?.checked;

                if (!tutorialChecked && presetVal) {
                    this.scene.start('MainScene', { loadPreset: presetVal });
                } else {
                    if (tutorialChecked) {
                        const defaultWidth = 10;
                        const defaultHeight = 10;
                        (GameConfig as any).GRID_WIDTH = defaultWidth;
                        (GameConfig as any).GRID_HEIGHT = defaultHeight;

                        const tutorialPlayers = [
                            { id: 'P1', isAI: false, color: GameConfig.COLORS.P1 },
                            { id: 'P2', isAI: true, color: GameConfig.COLORS.P2 }
                        ];

                        this.scene.start('MainScene', {
                            playerConfigs: tutorialPlayers,
                            mapType: 'default',
                            tutorial: true
                        });
                        return;
                    }

                    // New Game
                    const wInput = this.domElement.getChildByID('mapWidthInput') as HTMLInputElement;
                    const hInput = this.domElement.getChildByID('mapHeightInput') as HTMLInputElement;
                    const cInput = this.domElement.getChildByID('playerCountInput') as HTMLInputElement;
                    const typeInput = this.domElement.getChildByID('mapTypeSelect') as HTMLSelectElement;

                    const width = Phaser.Math.Clamp(parseInt(wInput.value) || 10, 10, 40);
                    const height = Phaser.Math.Clamp(parseInt(hInput.value) || 10, 10, 40);
                    const count = parseInt(cInput.value);
                    const mapType = typeInput ? typeInput.value : 'default';

                    // Update Global
                    (GameConfig as any).GRID_WIDTH = width;
                    (GameConfig as any).GRID_HEIGHT = height;

                    // Gather Configs
                    const configs: any[] = [];
                    for (let i = 1; i <= count; i++) {
                        const typeSelect = this.domElement.getChildByID(`type_P${i}`) as HTMLSelectElement;
                        const isAI = typeSelect.value === 'ai';
                        const color = GameConfig.COLORS['P' + i as keyof typeof GameConfig.COLORS];
                        configs.push({ id: `P${i}`, isAI, color });
                    }

                    this.scene.start('MainScene', { playerConfigs: configs, mapType: mapType });
                }
            });
        }

        // Handle Resize
        this.scale.on('resize', this.resize, this);

        // Cleanup listener on shutdown
        this.events.once('shutdown', () => {
            this.scale.off('resize', this.resize, this);
        });
    }

    private applyBackgroundCover() {
        if (!this.background) return;
        const width = this.scale.width;
        const height = this.scale.height;

        this.background.setPosition(width / 2, height / 2);

        // Scale to COVER
        const scaleX = width / this.background.width;
        const scaleY = height / this.background.height;
        const scale = Math.max(scaleX, scaleY); // Ensure we cover the whole screen
        this.background.setScale(scale);
    }

    private resize(gameSize: Phaser.Structs.Size) {
        this.applyBackgroundCover();

        if (this.domElement) {
            this.domElement.setPosition(0, 0);
            const domNode = this.domElement.node as HTMLElement | null;
            if (domNode) {
                domNode.style.width = `${gameSize.width}px`;
                domNode.style.height = `${gameSize.height}px`;
            }
        }
    }
}
