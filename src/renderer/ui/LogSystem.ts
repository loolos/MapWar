import Phaser from 'phaser';

export type LogType = 'info' | 'combat' | 'warning' | 'error';

export class LogSystem {
    private container: Phaser.GameObjects.Container;
    private background: Phaser.GameObjects.Graphics;
    private textObj: Phaser.GameObjects.Text;
    private messages: string[] = [];
    private maxMessages: number = 20;

    constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
        this.container = scene.add.container(x, y);

        // Background
        this.background = scene.add.graphics();
        this.container.add(this.background);

        // Text Object
        this.textObj = scene.add.text(5, 5, '', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#aaaaaa',
            wordWrap: { width: width - 10 }
        });
        this.container.add(this.textObj);

        this.refresh();
        this.resize(width, height);
    }

    public addLog(message: string, type: LogType = 'info') {
        let prefix = '> ';
        if (type === 'combat') prefix = '⚔️ ';
        if (type === 'warning') prefix = '⚠️ ';
        if (type === 'error') prefix = '❌ ';

        const entry = `${prefix}${message}`;
        this.messages.push(entry);

        if (this.messages.length > this.maxMessages) {
            this.messages.shift();
        }

        this.refresh();
    }

    private refresh() {
        // Simple render: Join last N messages
        // Since it's a "bottom-up" log usually? Or top-down?
        // Let's do Top-Down, newest at bottom?
        // Actually, scrolling log usually has newest at bottom.
        // We'll just join them.

        // Truncate to fit? For now just show all and let alignment handle it.
        // If we want "scroll to bottom", we can set originY=1 and position at bottom?
        // Or just render last 5-6 lines that fit?

        // Let's render all, and assume user sees the bottom ones if we align correctly?
        // Or simpler: Just render last 8 messages.
        const visibleMessages = this.messages.slice(-8);
        this.textObj.setText(visibleMessages.join('\n'));

        // TODO: Auto-scroll logic if we want to be fancy.
        // For now, static text box.
    }

    public resize(width: number, height: number) {
        this.background.clear();
        this.background.fillStyle(0x000000, 0.8);
        this.background.fillRoundedRect(0, 0, width, height, 4);

        // Border
        this.background.lineStyle(1, 0x444444);
        this.background.strokeRoundedRect(0, 0, width, height, 4);

        this.textObj.setStyle({ wordWrap: { width: width - 10 } });

        // Align text to bottom of container?
        // Or just Top.
        // If we want "latest at bottom", we can set text origin (0, 1) and y = height - 5.
        // Let's try that.
        this.textObj.setOrigin(0, 1);
        this.textObj.setPosition(5, height - 5);
        this.textObj.setFixedSize(width - 10, height - 10); // Clip?
    }

    public setPosition(x: number, y: number) {
        this.container.setPosition(x, y);
    }

    public setVisible(visible: boolean) {
        this.container.setVisible(visible);
    }
}
