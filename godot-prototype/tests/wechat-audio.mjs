/** Exercise the native audio calls in an assembled package without touching device audio. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const project = resolve(process.argv[2]);
const source = readFileSync(join(project, 'js/journey_audio.js'));
const { installJourneyAudio } = await import('data:text/javascript;base64,' + source.toString('base64'));
const players = [];
const lifecycle = {};
const api = {
  setInnerAudioOption(options) { this.options = options; },
  onHide(callback) { lifecycle.hide = callback; },
  onShow(callback) { lifecycle.show = callback; },
  offHide(callback) { if (lifecycle.hide === callback) delete lifecycle.hide; },
  offShow(callback) { if (lifecycle.show === callback) delete lifecycle.show; },
  createInnerAudioContext() {
    const player = {
      playCount: 0, pauseCount: 0, destroyed: false,
      play() {
        assert(existsSync(join(project, this.src)), `Missing audio in final package: ${this.src}`);
        this.playCount++;
        this.played();
      },
      pause() { this.pauseCount++; },
      destroy() { this.destroyed = true; },
      onPlay(callback) { this.played = callback; },
      onError(callback) { this.failed = callback; },
      onEnded(callback) { this.ended = callback; },
    };
    players.push(player);
    return player;
  },
};
const window = {};
installJourneyAudio(api, window);
const audio = window.redFlowerWechatAudio;
assert.deepEqual(api.options, {obeyMuteSwitch: false, mixWithOther: true});
audio.update(false, false, false);
assert.equal(players.length, 0, 'No music before activation');
audio.update(true, false, false);
const music = players[0];
assert(music.loop && music.playCount === 1);
audio.update(true, false, false);
assert.equal(music.playCount, 1, 'Repeated activation does not restart the track');
audio.update(false, false, false);
assert.equal(music.pauseCount, 1, 'Entering gameplay pauses navigation music');
music.played();
assert.equal(music.pauseCount, 2, 'A late native callback cannot start the track inside gameplay');
audio.playEffect('button', 'interface', null);
const button = players[1];
assert(button.playCount === 1 && !button.loop);
audio.playEffect('plant-unlock', 'plant', null);
const plant = players[2];
assert(plant.src.endsWith('/plant-unlock.wav') && plant.playCount === 1);
button.ended();
assert(button.destroyed && !plant.destroyed);
audio.update(true, false, false);
assert.equal(music.playCount, 2, 'The map resumes navigation music');
audio.update(true, false, true);
assert(plant.destroyed && music.pauseCount === 2, 'The effect toggle does not mute music');
audio.update(true, true, false);
assert.equal(music.pauseCount, 3);
audio.playEffect('victory', 'result', null);
assert.equal(players[3].playCount, 1, 'Music mute still allows result sounds');
audio.update(true, false, false);
lifecycle.hide();
assert(music.pauseCount === 4 && players[3].destroyed);
lifecycle.show();
assert.equal(music.playCount, 4);
let fallback;
audio.playEffect('wrong', 'action', (...args) => { fallback = args; });
players[4].failed({errCode: -1, errMsg: 'test fallback'});
assert.deepEqual(fallback, ['wrong', 'action']);
assert(players[4].destroyed);
audio.dispose();
assert(music.destroyed);
assert.deepEqual(lifecycle, {});

const engine = readFileSync(join(project, 'js/libs/godot.js'), 'utf8');
const addAt = engine.match(/static addAt\(index\)\{(.*?)\}static create/g);
assert.equal(addAt.length, 1);
const stub = [];
const sampleBuses = {Bus: {
  create() { const bus = {getId: () => stub.indexOf(bus)}; stub.push(bus); return bus; },
  move() { throw new Error('Appending moved an existing audio bus'); },
}};
const append = new Function('GodotAudio', `return class { ${addAt[0].slice(0, -'static create'.length)} }`)(sampleBuses);
append.addAt(-1);
append.addAt(-1);
append.addAt(-1);
assert.equal(stub.length, 3);
console.log('PASS: packaged WeChat music, clicks, reward, mute, visibility, fallback and sample bus append');
