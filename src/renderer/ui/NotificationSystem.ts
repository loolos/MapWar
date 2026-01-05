import Phaser from 'phaser';

export type NotificationType = 'info' | 'warning' | 'error';

export class NotificationSystem {
    private container: Phaser.GameObjects.Container;
    private textObj: Phaser.GameObjects.Text;
    private background: Phaser.GameObjects.Graphics;

    constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
        this.container = scene.add.container(x, y);

        // Background for the notification area (optional, maybe semitransparent)
        this.background = scene.add.graphics();
        this.background.fillStyle(0x000000, 0.5);
        this.background.fillRect(0, 0, width, height);
        this.container.add(this.background);

        // Text Object - Top-Left alignment within the container? Or Center?
        // User asked for "Bottom Right Info Box". 
        // We'll pad it slightly.
        this.textObj = scene.add.text(10, 10, '', {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: '#ffffff',
            wordWrap: { width: width - 20 }
        });
        this.container.add(this.textObj);
    }

    public show(message: string, type: NotificationType = 'info') {
        this.textObj.setText(message);

        switch (type) {
            case 'error':
                this.textObj.setColor('#ff5555'); // Red
                break;
            case 'warning':
                this.textObj.setColor('#ffff00'); // Yellow
                break;
            case 'info':
            default:
                this.textObj.setColor('#ffffff'); // White
                break;
        }
    }

    public clear() {
        this.textObj.setText('');
    }

    public setVisible(visible: boolean) {
        this.container.setVisible(visible);
    }

    public setPosition(x: number, y: number) {
        this.container.setPosition(x, y);
    }

    public resize(width: number, height: number) {
        this.background.clear();
        this.background.fillStyle(0x000000, 0.5);
        this.background.fillRect(0, 0, width, height);

        // Update Word Wrap
        this.textObj.setStyle({ wordWrap: { width: width - 20 } });
    }

    public setScale(scale: number) {
        this.container.setScale(scale);
    }
}
