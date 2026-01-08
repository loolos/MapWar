import Phaser from 'phaser';

export type LogType = 'info' | 'combat' | 'warning' | 'error';

interface LogEntry {
    text: string;
    color: string;
}

export class LogSystem {
    private container: Phaser.GameObjects.Container;
    private background: Phaser.GameObjects.Graphics;
    private logLines: Phaser.GameObjects.Text[] = [];
    private messages: LogEntry[] = [];
    private maxMessages: number = 8;

    constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
        this.container = scene.add.container(x, y);

        // Background
        this.background = scene.add.graphics();
        this.container.add(this.background);

        // Initialize Text Lines
        for (let i = 0; i < this.maxMessages; i++) {
            const textObj = scene.add.text(5, 0, '', {
                fontFamily: 'monospace',
                fontSize: '14px',
                color: '#ffffff',
                wordWrap: { width: width - 10 }
            });
            this.container.add(textObj);
            this.logLines.push(textObj);
        }

        this.resize(width, height);
        this.refresh();
    }

    public addLog(message: string, type: LogType = 'info') {
        let prefix = '> ';
        let color = '#ffffff';

        switch (type) {
            case 'error':
                prefix = '❌ ';
                color = '#ff4444'; // Red
                break;
            case 'warning':
                prefix = '⚠️ ';
                color = '#ffee44'; // Yellow
                break;
            case 'combat':
                prefix = '⚔️ ';
                color = '#ffffff'; // White
                break;
            case 'info':
            default:
                prefix = '> ';
                color = '#ffffff'; // White
                break;
        }

        const entry: LogEntry = {
            text: `${prefix}${message}`,
            color: color
        };

        this.messages.push(entry);

        if (this.messages.length > this.maxMessages) {
            this.messages.shift();
        }

        this.refresh();
    }

    private refresh() {
        // Render from bottom up: index 0 = newest message
        const reversedMessages = [...this.messages].reverse();

        // Start from bottom of the container
        // We need to access container height. We stored it? No.
        // Let's assume resize was called and we can get it from background?
        // Or store it.
        // Let's rely on stored dimensions if possible, or pass it. 
        // We'll add 'lastWidth' and 'lastHeight' props to class.
        if (!this.lastHeight) return;

        let currentY = this.lastHeight - 5; // Bottom margin

        for (let i = 0; i < this.maxMessages; i++) {
            const lineObj = this.logLines[i];

            if (i < reversedMessages.length) {
                const msg = reversedMessages[i];
                lineObj.setText(msg.text);
                lineObj.setColor(msg.color);
                lineObj.setVisible(true);

                // Force update to get correct height
                lineObj.updateText();

                const h = lineObj.height;

                // Position: Bottom of text = currentY
                // Top of text = currentY - h
                lineObj.setPosition(5, currentY - h);

                // Move cursor up
                currentY -= (h + 2); // 2px gap

                // If we go above the top, hide it?
                if (currentY < 0) {
                    lineObj.setVisible(false);
                }
            } else {
                lineObj.setVisible(false);
            }
        }
    }

    private lastHeight: number = 300;

    public resize(width: number, height: number) {
        this.lastHeight = height;

        this.background.clear();
        this.background.fillStyle(0x000000, 0.8);
        this.background.fillRoundedRect(0, 0, width, height, 4);

        // Border
        this.background.lineStyle(1, 0x444444);
        this.background.strokeRoundedRect(0, 0, width, height, 4);

        // Update Text Wrapping Width
        for (let i = 0; i < this.logLines.length; i++) {
            const lineObj = this.logLines[i];
            lineObj.setStyle({ wordWrap: { width: width - 10 } });
        }

        this.refresh();
    }

    public setPosition(x: number, y: number) {
        this.container.setPosition(x, y);
    }

    public setVisible(visible: boolean) {
        this.container.setVisible(visible);
    }
}
