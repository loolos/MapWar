
import Phaser from 'phaser';
import { GameConfig } from '../core/GameConfig';
import { SaveRegistry } from '../core/saves/SaveRegistry';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    create() {
        // Background
        this.add.graphics().fillStyle(0x222222).fillRect(0, 0, this.scale.width, this.scale.height);

        // Title (Phaser)
        // Adjust Y dynamically if needed, or keep it simple.
        this.add.text(this.scale.width / 2, 50, 'MAP WAR', {
            fontSize: '48px',
            color: '#ffffff',
            fontStyle: 'bold',
            shadow: { offsetX: 2, offsetY: 2, color: '#000', blur: 4, fill: true }
        }).setOrigin(0.5);

        // HTML UI Container
        // responsive-layout class will handle 2-column on desktop, stack on mobile
        const uiHTML = `
            <style>
                .menu-container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    width: 90vw;
                    max-width: 800px;
                    height: 70vh;
                    background: rgba(0,0,0,0.6);
                    padding: 20px;
                    border-radius: 12px;
                    color: white;
                    font-family: 'Arial', sans-serif;
                    overflow: hidden; /* Inner scroll */
                }
                .col-left {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
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
                    padding: 10px;
                    border-radius: 8px;
                }
                .control-row {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                    justify-content: center;
                }
                input, select {
                    font-size: 16px;
                    padding: 5px;
                    border-radius: 4px;
                    border: none;
                    text-align: center;
                }
                .player-list {
                    flex: 1;
                    overflow-y: auto;
                    background: rgba(0,0,0,0.3);
                    padding: 10px;
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

                .btn-start {
                    font-size: 24px;
                    padding: 15px;
                    background: #4444ff;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    width: 100%;
                    box-shadow: 0 4px 0 #2222aa;
                }
                .btn-start:hover { background: #6666ff; }
                .btn-start:active { transform: translateY(2px); box-shadow: 0 2px 0 #2222aa; }

                .preset-section {
                    margin-top: auto; 
                }
                
                @media (max-width: 600px) {
                    .menu-container {
                        grid-template-columns: 1fr;
                        height: 75vh;
                        overflow-y: auto;
                    }
                    /* On mobile, stack: Configs first, then Player List */
                    .col-left { order: 1; }
                    .col-right { order: 2; height: 300px; /* Fixed height for scrollable list on mobile */ }
                }
            </style>

            <div class="menu-container">
                <!-- Left Column: Configs & Actions -->
                <div class="col-left">
                    <div class="control-group">
                        <label style="font-weight:bold; text-align:center;">MAP CONFIG</label>
                        <div class="control-row">
                            <span>Size:</span>
                            <input type="number" id="mapWidthInput" placeholder="W" min="10" max="40" value="10" style="width:50px;">
                            <span>x</span>
                            <input type="number" id="mapHeightInput" placeholder="H" min="10" max="40" value="10" style="width:50px;">
                        </div>
                        <div class="control-row" style="margin-top: 10px;">
                             <span>Type:</span>
                             <select id="mapTypeSelect" style="width: 120px;">
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
                            <input type="number" id="playerCountInput" min="2" max="8" value="2" style="width:60px;">
                        </div>
                    </div>

                    <div class="preset-section">
                        <label style="font-size: 14px; display:block; margin-bottom:5px;">Load Preset:</label>
                        <select id="presetSelect" style="width: 100%; padding: 8px;">
                            <option value="">-- New Game --</option>
                            <!-- Populated via JS -->
                        </select>
                    </div>

                    <button id="startGameBtn" class="btn-start">START GAME</button>
                </div>

                <!-- Right Column: Player List -->
                <div class="col-right">
                    <label style="font-weight:bold; margin-bottom:5px;">PLAYER ROSTER</label>
                    <div id="playerList" class="player-list">
                        <!-- Slots -->
                    </div>
                </div>
            </div>
        `;

        const domElement = this.add.dom(this.scale.width / 2, this.scale.height / 2 + 20).createFromHTML(uiHTML);
        domElement.setPerspective(800);

        // --- Logic Binding ---

        // 1. Populate Presets
        const presetSelect = domElement.getChildByID('presetSelect') as HTMLSelectElement;
        const saves = Object.keys(SaveRegistry);
        saves.forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.text = SaveRegistry[key].name;
            presetSelect.add(opt);
        });

        // 2. Update Player List
        const updateSlots = () => {
            const countInput = domElement.getChildByID('playerCountInput') as HTMLInputElement;
            const listDiv = domElement.getChildByID('playerList') as HTMLDivElement;
            if (!countInput || !listDiv) return;

            const count = Phaser.Math.Clamp(parseInt(countInput.value) || 2, 2, 8);

            // Preserve existing settings if possible? For now, rebuild.
            // Check existing values to restore state if needed (advanced polish).

            let html = '';
            for (let i = 1; i <= count; i++) {
                const isAI = i > 1; // Default
                const color = GameConfig.COLORS['P' + i as keyof typeof GameConfig.COLORS].toString(16).padStart(6, '0');

                // We'd ideally read current value if element exists to avoid resetting dropdowns on count change?
                // For simplicity, reset on count change is acceptable for MVP.

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

        const countInp = domElement.getChildByID('playerCountInput');
        if (countInp) {
            countInp.addEventListener('change', updateSlots);
            countInp.addEventListener('input', updateSlots);
        }
        updateSlots(); // Initial

        // 3. Start Game Listener
        const btn = domElement.getChildByID('startGameBtn');
        if (btn) {
            btn.addEventListener('click', () => {
                const presetVal = (domElement.getChildByID('presetSelect') as HTMLSelectElement).value;

                if (presetVal) {
                    this.scene.start('MainScene', { loadPreset: presetVal });
                } else {
                    // New Game
                    const wInput = domElement.getChildByID('mapWidthInput') as HTMLInputElement;
                    const hInput = domElement.getChildByID('mapHeightInput') as HTMLInputElement;
                    const cInput = domElement.getChildByID('playerCountInput') as HTMLInputElement;
                    const typeInput = domElement.getChildByID('mapTypeSelect') as HTMLSelectElement;

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
                        const typeSelect = domElement.getChildByID(`type_P${i}`) as HTMLSelectElement;
                        const isAI = typeSelect.value === 'ai';
                        const color = GameConfig.COLORS['P' + i as keyof typeof GameConfig.COLORS];
                        configs.push({ id: `P${i}`, isAI, color });
                    }

                    this.scene.start('MainScene', { playerConfigs: configs, mapType: mapType });
                }
            });
        }
    }
}
