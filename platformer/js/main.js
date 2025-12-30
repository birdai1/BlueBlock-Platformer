import { makeGame } from './game.js';

const canvas = document.getElementById('game');
if (!canvas) {
  throw new Error('Canvas #game not found. Check index.html for <canvas id="game">');
}

const game = makeGame(canvas);
game.bindInputs();
game.newLevel();

let lastT = 0;

function loop(t) {
  if (!lastT) lastT = t;
  const step = Math.min(0.033, (t - lastT) / 1000);
  lastT = t;

  game.update(step);
  game.draw();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
