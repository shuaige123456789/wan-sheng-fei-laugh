// 一进来是原图；点一下开始笑 + 出声；5 秒后自动停回原图。
// 慢网处理：先转圈等缓冲，够播了再同时启动画面和声音，避免“有声无画”。
var video = document.getElementById('laughVideo');
var audio = document.getElementById('laughAudio');
var wrap = document.getElementById('videoWrap');
var btnText = document.getElementById('btnText');
var loopIcon = document.getElementById('loopIcon');
var stopIcon = document.getElementById('stopIcon');
var hint = document.getElementById('hint');
var still = document.getElementById('still');
var loader = document.getElementById('loader');
var soundBtn = document.getElementById('soundBtn');
var soundOnIcon = document.getElementById('soundOnIcon');
var soundOffIcon = document.getElementById('soundOffIcon');
var toast = document.getElementById('toast');

var laughing = false;      // 用户点了“笑”
var playing = false;       // 真正在播
var soundOn = false;
var source = 'audio';
var toastTimer = null;
var checkTimer = null;
var endTimer = null;
var waitTimer = null;
var lowTimer = null;
var usingLow = false;
var waitCount = 0;

var PENDING = 'pending';

function render(isPlaying) {
  btnText.textContent = isPlaying ? '暂停' : '循环大笑';
  loopIcon.classList.toggle('hidden', isPlaying);
  stopIcon.classList.toggle('hidden', !isPlaying);
}

function renderSound() {
  soundBtn.classList.toggle('off', !soundOn);
  soundOnIcon.classList.toggle('hidden', !soundOn);
  soundOffIcon.classList.toggle('hidden', soundOn);
}

function setMute(on) {
  soundOn = on;
  if (audio) audio.muted = !(on && source === 'audio');
  if (video) video.muted = !(on && source === 'video');
  renderSound();
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2400);
}

function hideHint() { if (hint) hint.classList.add('gone'); }
function showStill() { if (still) still.classList.add('show'); }
function hideStill() { if (still) still.classList.remove('show'); }
function showLoader() { if (loader) loader.classList.add('show'); }
function hideLoader() { if (loader) loader.classList.remove('show'); }

function fire(el) {
  if (!el) return null;
  try { return el.play(); } catch (e) { return null; }
}

// 用户点了“循环大笑”
function requestPlay() {
  if (laughing) return;
  laughing = true;
  hideHint();
  hideStill();
  render(true);
  source = 'audio';
  setMute(true);

  clearTimeout(endTimer);
  video.currentTime = 0;

  if (video.readyState >= 3) {
    begin();
  } else {
    // 慢网：先转圈，等 canplay 再一起开
    showLoader();
    clearTimeout(waitTimer);
    waitTimer = setTimeout(begin, 15000);
    // 6 秒还没缓冲够 -> 换低码率版本
    clearTimeout(lowTimer);
    lowTimer = setTimeout(function () { if (!playing) useLowRes(); }, 6000);
    video.addEventListener('canplay', function once() {
      video.removeEventListener('canplay', once);
      clearTimeout(waitTimer);
      clearTimeout(lowTimer);
      begin();
    });
  }
}

// 换成 360p 低码率版（卡顿时自动降级）
function useLowRes() {
  if (usingLow) return;
  usingLow = true;
  var t = video.currentTime;
  video.src = 'assets/laugh-low.mp4';
  video.load();
  if (laughing && !playing) {
    showLoader();
    var once = function () {
      video.removeEventListener('canplay', once);
      begin();
    };
    video.addEventListener('canplay', once);
  } else if (playing) {
    video.currentTime = t;
    fire(video);
  }
}

// 真正开始播放（画面 + 声音同时）
function begin() {
  hideLoader();
  clearTimeout(waitTimer);
  if (!laughing) return;
  playing = true;
  render(true);

  video.currentTime = 0;
  fire(video);

  if (audio) {
    audio.currentTime = 0;
    audio.muted = false;
    var ap = fire(audio);
    if (ap && ap.catch) ap.catch(function () { fallbackToVideoAudio(); });
  }

  clearTimeout(checkTimer);
  checkTimer = setTimeout(function () {
    if (!playing) return;
    if (audio && (audio.paused || audio.readyState < 2)) fallbackToVideoAudio();
  }, 900);

  // 5 秒自动停
  clearTimeout(endTimer);
  endTimer = setTimeout(function () { if (playing) stop(); }, 5400);
}

function fallbackToVideoAudio() {
  if (source === 'video' || !playing) return;
  source = 'video';
  setMute(true);
  fire(video);
  showToast('已切换到视频音轨');
}

function stop() {
  laughing = false;
  playing = false;
  clearTimeout(checkTimer);
  clearTimeout(endTimer);
  clearTimeout(waitTimer);
  clearTimeout(lowTimer);
  waitCount = 0;
  hideLoader();
  video.pause();
  video.currentTime = 0;
  if (audio) { audio.pause(); audio.currentTime = 0; }
  source = 'audio';
  setMute(false);
  showStill();
  render(false);
}

function toggleLaugh() {
  if (!video) return;
  if (laughing) stop();
  else requestPlay();
}

function toggleSound(e) {
  if (e) e.stopPropagation();
  if (soundOn) {
    setMute(false);
    showToast('已静音');
  } else {
    setMute(true);
    if (!laughing) requestPlay();
    else if (audio && audio.paused) { audio.currentTime = video.currentTime; fire(audio); }
    showToast('声音已开');
  }
}

function wechatInit() {
  if (typeof WeixinJSBridge === 'undefined') return;
  WeixinJSBridge.invoke('getNetworkType', {}, function () {
    if (audio) audio.load();
    if (video) video.load();
    fixTitle();
  });
}

var PAGE_TITLE = '万圣霏大笑';
function fixTitle() {
  if (document.title !== PAGE_TITLE) document.title = PAGE_TITLE;
}
fixTitle();
setTimeout(fixTitle, 300);
setTimeout(fixTitle, 1200);

if (video) {
  video.pause();
  video.currentTime = 0;
  source = 'audio';
  setMute(false);
  render(false);

  soundBtn.addEventListener('click', toggleSound);
  if (wrap) wrap.addEventListener('click', toggleLaugh);

  video.addEventListener('error', function () { hideLoader(); showToast('画面加载失败'); });
  video.addEventListener('ended', function () { if (playing) stop(); });
  // 播放中途反复卡顿 -> 降级到低码率
  video.addEventListener('waiting', function () {
    if (!playing || usingLow) return;
    waitCount++;
    if (waitCount >= 2) useLowRes();
  });
  if (audio) {
    audio.addEventListener('error', function () { showToast('声音加载失败'); });
  }

  document.addEventListener('WeixinJSBridgeReady', wechatInit, false);
  if (typeof WeixinJSBridge !== 'undefined') wechatInit();

  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space') { e.preventDefault(); toggleLaugh(); }
  });
}
