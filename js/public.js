/* EDITH Studio: pagina pubblica "solo ascolto" per UN file condiviso. Nessun elenco, nessuna cartella, nessun mixer. */
(function () {
	'use strict';
	var root = document.getElementById('edithstudio-public');
	if (!root) return;
	var TOKEN = root.getAttribute('data-token') || '';
	var NAME = root.getAttribute('data-name') || 'Brano';
	var SIZE = parseInt(root.getAttribute('data-size') || '0', 10) || 0;
	var HIDE_DL = root.getAttribute('data-hide-download') === '1';
	var WEB = root.getAttribute('data-webroot') || '';
	var SRC = WEB + '/public.php/dav/files/' + encodeURIComponent(TOKEN) + '/';
	var title = NAME.replace(/\.[^.]+$/, '');

	function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	function fmt(t) { if (!isFinite(t)) return '0:00'; t = Math.max(0, Math.floor(t)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
	function mb(n) { return n ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : ''; }

	var h = 0;
	for (var i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
	var hue = h % 360, hue2 = (hue + 48) % 360;
	var initials = title.split(/[\s\-_]+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('') || '♪';
	document.title = title + ' · EDITH Studio';

	root.innerHTML =
		'<main class="ep-wrap"><div class="ep-card">' +
		'<div class="ep-art" style="background:linear-gradient(135deg,hsl(' + hue + ',62%,38%),hsl(' + hue2 + ',70%,22%))"><span>' + esc(initials) + '</span></div>' +
		'<h1>' + esc(title) + '</h1>' +
		'<p class="ep-sub">Brano condiviso con te' + (SIZE ? ' · ' + esc(mb(SIZE)) : '') + '</p>' +
		'<audio id="ep-au" preload="metadata" src="' + esc(SRC) + '"></audio>' +
		'<div class="ep-seek"><span id="ep-cur">0:00</span><input id="ep-bar" type="range" min="0" max="1000" value="0" aria-label="Posizione"><span id="ep-dur">0:00</span></div>' +
		'<div class="ep-ctl"><button class="ep-btn" id="ep-back" title="Indietro di 10 secondi">⏪ 10</button>' +
		'<button class="ep-btn big" id="ep-play" title="Riproduci">▶</button>' +
		'<button class="ep-btn" id="ep-fwd" title="Avanti di 10 secondi">10 ⏩</button></div>' +
		'<div class="ep-vol"><span>🔈</span><input id="ep-volr" type="range" min="0" max="100" value="100" aria-label="Volume"></div>' +
		'<p class="ep-err" id="ep-err" hidden>Non riesco a suonare questo file. Il link potrebbe essere scaduto o il formato non è supportato dal tuo browser.</p>' +
		(HIDE_DL ? '' : '<a class="ep-dl" href="' + esc(SRC) + '" download="' + esc(NAME) + '">⬇ Scarica il file</a>') +
		'</div><footer class="ep-foot"><b>EDITH</b> Studio · solo ascolto · ' +
		'<a href="' + esc(WEB + '/apps/edithstudio/') + '">Accedi</a></footer></main>';

	var au = document.getElementById('ep-au');
	var bar = document.getElementById('ep-bar');
	var play = document.getElementById('ep-play');
	var drag = false;

	function paintRange(el) { var mn = parseFloat(el.min || '0'), mx = parseFloat(el.max || '100'), v = parseFloat(el.value || '0'); el.style.setProperty('--p', (mx > mn ? Math.max(0, Math.min(100, (v - mn) / (mx - mn) * 100)) : 0) + '%'); }
	function sync() {
		document.getElementById('ep-cur').textContent = fmt(au.currentTime);
		document.getElementById('ep-dur').textContent = fmt(au.duration);
		if (!drag && au.duration) { bar.value = String(Math.round(au.currentTime / au.duration * 1000)); }
		paintRange(bar);
		play.textContent = au.paused ? '▶' : '⏸';
		play.title = au.paused ? 'Riproduci' : 'Pausa';
	}
	function toggle() { if (au.paused) { var p = au.play(); if (p && p.catch) p.catch(function () { }); } else au.pause(); }
	function skip(d) { if (au.duration) au.currentTime = Math.max(0, Math.min(au.duration, au.currentTime + d)); }

	['timeupdate', 'durationchange', 'loadedmetadata', 'play', 'pause', 'ended'].forEach(function (e) { au.addEventListener(e, sync); });
	au.addEventListener('error', function () { document.getElementById('ep-err').hidden = false; });
	play.addEventListener('click', toggle);
	document.getElementById('ep-back').addEventListener('click', function () { skip(-10); });
	document.getElementById('ep-fwd').addEventListener('click', function () { skip(10); });
	bar.addEventListener('input', function () { drag = true; paintRange(bar); if (au.duration) document.getElementById('ep-cur').textContent = fmt(bar.value / 1000 * au.duration); });
	bar.addEventListener('change', function () { if (au.duration) au.currentTime = bar.value / 1000 * au.duration; drag = false; });
	document.getElementById('ep-volr').addEventListener('input', function (e) { au.volume = e.target.value / 100; paintRange(e.target); });
	document.addEventListener('keydown', function (e) {
		if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return;
		if (e.code === 'Space') { e.preventDefault(); toggle(); }
		else if (e.code === 'ArrowLeft') skip(-5);
		else if (e.code === 'ArrowRight') skip(5);
	});
	if ('mediaSession' in navigator) {
		try {
			navigator.mediaSession.metadata = new MediaMetadata({ title: title, artist: 'EDITH Studio' });
			navigator.mediaSession.setActionHandler('play', toggle);
			navigator.mediaSession.setActionHandler('pause', toggle);
		} catch (e) { }
	}
	paintRange(document.getElementById('ep-volr'));
	sync();
})();
