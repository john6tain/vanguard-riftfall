export class Player {
    constructor(camera) {
        this.camera = camera;
        this.hp = 100;
        this.maxHp = 100;
        this.shield = 100;
        this.maxShield = 100;
        this.ammo = 36;
        this.maxAmmo = 36;
        this.speed = 7.2;
        this.fireCd = 0;
        this.kills = 0;
        this.score = 0;
        this.streak = 0;
        this.yVel = 0;
        this.onGround = true;
        this.canRechargeShild = true;
    }

    reloadInstant() {
        this.ammo = this.maxAmmo;
    }

    jump() {
        if (!this.onGround) return;
        this.yVel = 6.8;
        this.onGround = false;
    }

    updateVertical(dt) {
        this.yVel -= 18 * dt;
        this.camera.position.y += this.yVel * dt;
        if (this.camera.position.y <= 1.7) {
            this.camera.position.y = 1.7;
            this.yVel = 0;
            this.onGround = true;
        }
    }
}
