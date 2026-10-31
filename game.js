/* global Phaser, COIN_DASH */
// Best score persisted in localStorage. Every access is guarded: storage can be disabled,
// blocked (e.g. file:// or private mode in some browsers), full, or hold a corrupt value.
// If it is unavailable, the record still lasts for the current page session in memory.
const HighScore = {
  key: 'coinDash.highScore',
  memory: 0,
  load() {
    try {
      const value = Number.parseInt(window.localStorage.getItem(this.key), 10);
      if (Number.isFinite(value) && value > this.memory) this.memory = value;
    } catch (e) { /* storage unavailable: keep the in-memory value */ }
    return this.memory;
  },
  save(score) {
    this.memory = Math.max(this.memory, score);
    try {
      window.localStorage.setItem(this.key, String(this.memory));
    } catch (e) { /* storage unavailable or full: the in-memory value still applies */ }
  }
};

class CoinDash extends Phaser.Scene {
  constructor() { super('CoinDash'); }

  create() {
    const c = COIN_DASH;
    const select = document.getElementById('difficulty');
    const droneSpeed = c.droneSpeed * (c.difficulties[select && select.value] || 1);
    this.score = 0;
    this.finished = false;
    this.paused = false;
    this.highScore = HighScore.load();
    this.newRecord = false;
    this.deadline = this.time.now + c.roundSeconds * 1000;
    this.physics.world.setBounds(0, 44, c.width, c.height - 44);
    this.add.grid(c.width / 2, c.height / 2, c.width, c.height, 40, 40,
      c.colors.background, 1, 0x24334b, 0.45);
    this.hud = this.add.text(18, 12, '', { font: '18px monospace', color: '#ffffff' });
    this.player = this.add.rectangle(c.width / 2, c.height / 2, 24, 24, c.colors.player);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.coin = this.add.circle(100, 100, 9, c.colors.coin);
    this.physics.add.existing(this.coin);
    this.coin.body.setCircle(9);
    this.placeCoin();
    this.drones = this.physics.add.group();
    for (let i = 0; i < c.droneCount; i++) {
      const drone = this.add.rectangle(90 + i * 270, 100, 26, 26, c.colors.drone);
      this.drones.add(drone);
      drone.body.setCollideWorldBounds(true).setBounce(1, 1);
      const angle = (35 + i * 105) * Math.PI / 180;
      drone.body.setVelocity(Math.cos(angle) * droneSpeed, Math.sin(angle) * droneSpeed);
    }
    this.physics.add.overlap(this.player, this.coin, () => {
      if (this.finished) return;
      this.score++;
      if (this.score > this.highScore) {
        // Save straight away so the record survives a reload in the middle of a round.
        this.highScore = this.score;
        this.newRecord = true;
        HighScore.save(this.highScore);
      }
      this.placeCoin();
    });
    this.physics.add.overlap(this.player, this.drones, () => this.finish('A drone caught you!'));
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,R');
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
    this.pauseText = this.add.text(c.width / 2, c.height / 2, 'PAUSED',
      { font: '48px monospace', color: '#ffffff' }).setOrigin(0.5).setVisible(false);
    this.input.keyboard.on('keydown-P', () => this.togglePause());
  }

  placeCoin() {
    const c = COIN_DASH;
    // Avoid spawning the next coin directly underneath the player.
    let x, y;
    do {
      x = Phaser.Math.Between(25, c.width - 25);
      y = Phaser.Math.Between(70, c.height - 25);
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 60);
    this.coin.setPosition(x, y);
    this.coin.body.reset(x, y);
  }

  togglePause() {
    if (this.finished) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.pausedAt = this.time.now;
      this.physics.pause();
    } else {
      // Push the deadline back so paused time does not count down the timer.
      this.deadline += this.time.now - this.pausedAt;
      this.physics.resume();
    }
    this.pauseText.setVisible(this.paused);
  }

  update() {
    if (this.finished || this.paused) return;
    const dx = Number(this.cursors.right.isDown || this.keys.D.isDown)
      - Number(this.cursors.left.isDown || this.keys.A.isDown);
    const dy = Number(this.cursors.down.isDown || this.keys.S.isDown)
      - Number(this.cursors.up.isDown || this.keys.W.isDown);
    const direction = new Phaser.Math.Vector2(dx, dy).normalize().scale(COIN_DASH.playerSpeed);
    this.player.body.setVelocity(direction.x, direction.y);
    if (this.updateHud() === 0) this.finish('Time is up!');
  }

  // Redraws the HUD and returns the whole seconds left in the round.
  updateHud() {
    const seconds = Math.max(0, Math.ceil((this.deadline - this.time.now) / 1000));
    const best = `Best: ${this.highScore}${this.newRecord ? ' NEW!' : ''}`;
    this.hud.setText(`Coins: ${this.score}`.padEnd(16) + best.padEnd(22) + `Time: ${seconds}s`);
    return seconds;
  }

  finish(reason) {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    this.updateHud();
    const c = COIN_DASH;
    const record = this.newRecord
      ? `New high score: ${this.highScore}!`
      : `High score: ${this.highScore}`;
    this.add.rectangle(c.width / 2, c.height / 2, 460, 190, 0x0a1120, 0.95);
    this.add.text(c.width / 2, c.height / 2,
      `${reason}\n${this.score} coins collected\n${record}\nPress R to try again`,
      { font: '24px monospace', color: '#ffffff', align: 'center', lineSpacing: 12 }
    ).setOrigin(0.5);
  }
}
// Changing difficulty starts a fresh round; blur so arrow keys keep steering the player.
document.getElementById('difficulty').addEventListener('change', (event) => {
  event.target.blur();
  window.coinDashGame.scene.getScene('CoinDash').scene.restart();
});
window.coinDashGame = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: COIN_DASH.width,
  height: COIN_DASH.height,
  backgroundColor: COIN_DASH.colors.background,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
  scene: CoinDash
});
