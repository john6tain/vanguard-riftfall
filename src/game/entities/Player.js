export class Player {
    constructor(camera) {
        this.camera = camera;
        this.hp = 100;
        this.maxHp = 100;
        this.shield = 100;
        this.maxShield = 100;
        this.ammo = 36;
        this.maxAmmo = 36;
        this.reloadDuration = 1.1;
        this.reloadTimer = 0;
        this.reloading = false;
        this.speed = 7.2;
        this.fireCooldown = 0;
        this.kills = 0;
        this.score = 0;
        this.streak = 0;
        this.verticalVelocity = 0;
        this.onGround = true;
        this.canRechargeShield = true;
    }

    startReload() {
        if (this.reloading) return;
        if (this.ammo >= this.maxAmmo) return;
        this.reloading = true;
        this.reloadTimer = this.reloadDuration;
    }

    reloadInstant() {
        this.reloading = false;
        this.reloadTimer = 0;
        this.ammo = this.maxAmmo;
    }

    updateReload(dt) {
        if (!this.reloading) return;
        this.reloadTimer = Math.max(0, this.reloadTimer - dt);
        if (this.reloadTimer <= 0) this.reloadInstant();
    }

    jump() {
        if (!this.onGround) return;
        this.verticalVelocity = 6.8;
        this.onGround = false;
    }

    updateVertical(dt) {
        this.verticalVelocity -= 18 * dt;
        this.camera.position.y += this.verticalVelocity * dt;
        if (this.camera.position.y <= 1.7) {
            this.camera.position.y = 1.7;
            this.verticalVelocity = 0;
            this.onGround = true;
        }
    }
}
