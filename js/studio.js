/* EDITH Studio: lettore + mixer multitraccia.
 * Nessuna libreria, nessuna build. Parla con il WebDAV di Nextcloud con la sessione dell'utente
 * (header OCS-APIRequest): vede solo ciò che l'utente può già vedere. */
(function () {
	'use strict';
	var root = document.getElementById('edithstudio');
	if (!root) { return; }

	var UID = root.getAttribute('data-uid') || '';
	var WEB = root.getAttribute('data-webroot') || '';
	var AUDIO_EXT = ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'aif', 'aiff', 'wma'];
	var MOBILE = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
	var STORE = 'edithstudio_';

	/* ------------------------------------------------------------ utilità */
	function esc(s) {
		return String(s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}
	function ext(n) { var p = String(n).split('.'); return p.length > 1 ? p.pop().toLowerCase() : ''; }
	function isAudio(n) { return AUDIO_EXT.indexOf(ext(n)) >= 0; }
	function baseName(n) { return String(n).replace(/\.[^.]+$/, ''); }
	function fmt(s) {
		if (!isFinite(s)) { return '0:00'; }
		s = Math.max(0, Math.floor(s));
		return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
	}
	function fmtSize(b) {
		if (!b) { return ''; }
		return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
	}
	function store(k, v) { try { if (v === undefined) { return localStorage.getItem(STORE + k); } localStorage.setItem(STORE + k, v); } catch (e) { return null; } }
	function parentOf(p) { var i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); }
	function join(dir, name) { return (dir === '/' ? '' : dir) + '/' + name; }

	var toastTimer = 0;
	function toast(m) {
		var el = root.querySelector('.es-toast');
		if (!el) { el = document.createElement('div'); el.className = 'es-toast'; root.appendChild(el); }
		el.textContent = m; el.classList.add('on');
		clearTimeout(toastTimer);
		toastTimer = setTimeout(function () { el.classList.remove('on'); }, 4500);
	}

	/* ------------------------------------------------------------ WebDAV */
	var davRoot = WEB + '/remote.php/dav/files/' + encodeURIComponent(UID);
	function enc(p) { return p.split('/').map(encodeURIComponent).join('/'); }
	function fileUrl(p) { return davRoot + enc(p); }
	var PROPFIND = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/></d:prop></d:propfind>';

	function listDir(path) {
		var url = davRoot + enc(path === '/' ? '' : path) + '/';
		return fetch(url, {
			method: 'PROPFIND', credentials: 'same-origin',
			headers: { 'Depth': '1', 'OCS-APIRequest': 'true', 'Content-Type': 'application/xml; charset=utf-8' },
			body: PROPFIND
		}).then(function (res) {
			if (res.status === 404) { throw new Error('Cartella non trovata.'); }
			if (res.status === 401 || res.status === 403) { throw new Error('Non hai accesso a questa cartella (o la sessione è scaduta: ricarica la pagina).'); }
			if (res.status >= 400) { throw new Error('Nextcloud ha risposto con un errore (' + res.status + ').'); }
			return res.text();
		}).then(function (txt) {
			var xml = new DOMParser().parseFromString(txt, 'application/xml');
			var prefix = decodeURIComponent(davRoot);
			var out = [];
			var resp = xml.getElementsByTagNameNS('DAV:', 'response');
			for (var i = 0; i < resp.length; i++) {
				var h = resp[i].getElementsByTagNameNS('DAV:', 'href')[0];
				if (!h) { continue; }
				var href = decodeURIComponent(h.textContent || '');
				if (href.indexOf(prefix) !== 0) {
					var k = href.indexOf('/remote.php/dav/files/');
					if (k < 0) { continue; }
					href = href.slice(href.indexOf('/', k + 22));
				} else {
					href = href.slice(prefix.length);
				}
				href = href.replace(/\/+$/, '') || '/';
				if (href === path || (href === '/' && path === '/')) { continue; }
				var name = href.split('/').pop();
				if (!name || name.charAt(0) === '.') { continue; }
				var sz = resp[i].getElementsByTagNameNS('DAV:', 'getcontentlength')[0];
				out.push({
					name: name, path: href, dir: resp[i].getElementsByTagNameNS('DAV:', 'collection').length > 0,
					size: sz ? parseInt(sz.textContent, 10) || 0 : 0
				});
			}
			var cmp = function (a, b) { return a.name.localeCompare(b.name, 'it', { numeric: true, sensitivity: 'base' }); };
			var dirs = out.filter(function (e) { return e.dir; }).sort(cmp);
			var files = out.filter(function (e) { return !e.dir && isAudio(e.name); }).sort(cmp);
			return dirs.concat(files);
		});
	}

	/* tutte le tracce audio di una cartella, con le sottocartelle fino a `depth` livelli */
	function audioIn(path, depth) {
		return listDir(path).then(function (entries) {
			var files = entries.filter(function (e) { return !e.dir; });
			if (!depth) { return files; }
			var subs = entries.filter(function (e) { return e.dir; });
			return Promise.all(subs.map(function (d) { return audioIn(d.path, depth - 1); })).then(function (lists) {
				return files.concat([].concat.apply([], lists));
			});
		});
	}

	/* ------------------------------------------------------------ struttura della pagina */
	var LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none"><circle cx="32" cy="32" r="28" stroke="#5fd8f2" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="3 5"/>' +
		'<path d="M32 4a28 28 0 0 1 24.2 14M32 60a28 28 0 0 1-24.2-14" stroke="#ff9a2e" stroke-width="3" stroke-linecap="round"/>' +
		'<circle cx="32" cy="32" r="18" stroke="#5fd8f2" stroke-width="1.5"/></g><circle class="core" cx="32" cy="32" r="8" fill="#ff9a2e"/><circle cx="32" cy="32" r="3" fill="#fff4e0"/></svg>';

	root.innerHTML =
		'<div class="es-top"><div class="es-brand">' + LOGO + '<div><b>E.D.I.T.H.</b><small>Studio</small></div></div>' +
		'<div class="es-tabs"><button class="es-tab on" data-view="lib">Libreria</button><button class="es-tab" data-view="mix">Mixer</button></div></div>' +
		'<section id="es-lib" class="es-card"><h3 class="es-h">Libreria</h3><div id="es-browser-lib"></div></section>' +
		'<section id="es-mix" class="es-hide"></section>' +
		'<footer class="es-player es-hide" id="es-player"></footer>';

	var elLib = root.querySelector('#es-lib');
	var elMix = root.querySelector('#es-mix');
	var elPlayer = root.querySelector('#es-player');

	function showView(v) {
		elLib.classList.toggle('es-hide', v !== 'lib');
		elMix.classList.toggle('es-hide', v !== 'mix');
		[].forEach.call(root.querySelectorAll('.es-tab'), function (b) { b.classList.toggle('on', b.getAttribute('data-view') === v); });
		store('view', v);
		if (v === 'mix') { Mixer.redraw(); }
	}
	root.querySelector('.es-tabs').addEventListener('click', function (e) {
		var b = e.target.closest('.es-tab');
		if (b) { showView(b.getAttribute('data-view')); }
	});

	/* ------------------------------------------------------------ navigatore di cartelle (usato dalla libreria e dal mixer) */
	function Browser(el, mode, key) {
		var self = this;
		this.el = el; this.mode = mode; this.key = key;
		this.path = store(key) || '/';
		this.entries = [];
		this.err = '';
		this.loading = false;
		el.addEventListener('click', function (e) { self.click(e); });
		el.addEventListener('dragstart', function (e) {
			var r = e.target.closest('[data-drag]');
			if (!r) { return; }
			e.dataTransfer.setData('text/x-es', r.getAttribute('data-drag'));
			e.dataTransfer.effectAllowed = 'copy';
		});
		this.go(this.path);
	}
	Browser.prototype.go = function (path) {
		var self = this;
		this.path = path; this.loading = true; this.err = '';
		this.draw();
		listDir(path).then(function (e) { self.entries = e; self.loading = false; store(self.key, path); self.draw(); })
			.catch(function (er) {
				self.loading = false; self.entries = [];
				self.err = er.message || 'Errore.';
				if (path !== '/') { store(self.key, '/'); }
				self.draw();
			});
	};
	Browser.prototype.draw = function () {
		var parts = this.path.split('/').filter(Boolean);
		var crumbs = '<button data-go="/">Tutti i file</button>';
		var acc = '';
		parts.forEach(function (p) { acc += '/' + p; crumbs += '<span>/</span><button data-go="' + esc(acc) + '">' + esc(p) + '</button>'; });
		var h = '<div class="es-crumbs">' + crumbs + '</div>';
		var files = this.entries.filter(function (e) { return !e.dir; });
		var dirs = this.entries.filter(function (e) { return e.dir; });
		if (this.mode === 'play') {
			h += '<div class="es-actions">' +
				(files.length ? '<button class="es-btn pri" data-a="playall">▶ Riproduci questa cartella</button>' : '') +
				'<button class="es-btn" data-a="allsong" title="Mette nel mixer le tracce di questa cartella e delle sottocartelle">＋ Tutta la canzone nel mixer</button></div>';
		} else {
			h += '<div class="es-actions"><button class="es-btn" data-a="addhere">＋ Aggiungi questa cartella</button>' +
				'<button class="es-btn" data-a="allsong">＋ Con le sottocartelle</button></div>';
		}
		if (this.loading) { h += '<div class="es-msg">Carico…</div>'; }
		else if (this.err) { h += '<div class="es-err">' + esc(this.err) + '</div>'; }
		else if (!this.entries.length) { h += '<div class="es-empty">Qui non ci sono cartelle né file audio.</div>'; }
		h += '<ul class="es-list">';
		if (this.path !== '/') { h += '<li class="es-row"><span class="es-ico">↰</span><span class="es-name" data-go="' + esc(parentOf(this.path)) + '">Cartella sopra</span></li>'; }
		var now = Player.currentPath();
		dirs.forEach(function (d) {
			h += '<li class="es-row" draggable="true" data-drag="' + esc(JSON.stringify({ dir: d.path })) + '"><span class="es-ico">▸</span>' +
				'<span class="es-name" data-go="' + esc(d.path) + '">' + esc(d.name) + '</span>' +
				(this.mode === 'play' ? '<button class="es-btn small" title="Riproduci i file di questa cartella" data-a="playdir" data-p="' + esc(d.path) + '">▶</button>' : '') +
				'<button class="es-btn small" title="Aggiungi al mixer i file di questa cartella" data-a="adddir" data-p="' + esc(d.path) + '">＋</button></li>';
		}, this);
		files.forEach(function (f) {
			h += '<li class="es-row' + (now === f.path ? ' now' : '') + '" draggable="true" data-drag="' + esc(JSON.stringify({ path: f.path, name: f.name })) + '">' +
				'<span class="es-ico">♪</span><span class="es-name" data-a="' + (this.mode === 'play' ? 'play' : 'add') + '" data-p="' + esc(f.path) + '">' + esc(baseName(f.name)) + '</span>' +
				'<span class="es-size">' + esc(fmtSize(f.size)) + '</span>' +
				(this.mode === 'play' ? '<button class="es-btn small" title="Riproduci" data-a="play" data-p="' + esc(f.path) + '">▶</button>' : '') +
				'<button class="es-btn small" title="Aggiungi al mixer" data-a="add" data-p="' + esc(f.path) + '">＋</button></li>';
		}, this);
		h += '</ul>';
		this.el.innerHTML = h;
	};
	Browser.prototype.click = function (e) {
		var g = e.target.closest('[data-go]');
		if (g) { this.go(g.getAttribute('data-go')); return; }
		var a = e.target.closest('[data-a]');
		if (!a) { return; }
		var act = a.getAttribute('data-a');
		var p = a.getAttribute('data-p');
		var self = this;
		var files = this.entries.filter(function (x) { return !x.dir; });
		var tr = function (f) { return { path: f.path, name: f.name, folder: parentOf(f.path).split('/').pop() || '' }; };
		if (act === 'play' && this.mode !== 'play') { return; }
		if (act === 'play') {
			var i = files.findIndex(function (f) { return f.path === p; });
			Player.playList(files.map(tr), Math.max(0, i));
		} else if (act === 'playall') {
			Player.playList(files.map(tr), 0);
		} else if (act === 'playdir') {
			audioIn(p, 0).then(function (l) { if (l.length) { Player.playList(l.map(tr), 0); } else { Player.toast('Nessun file audio in questa cartella.'); } });
		} else if (act === 'add') {
			var f = files.filter(function (x) { return x.path === p; })[0];
			if (f) { Mixer.addPaths([tr(f)]); }
		} else if (act === 'adddir') {
			audioIn(p, 0).then(function (l) { Mixer.addPaths(l.map(tr)); });
		} else if (act === 'addhere') {
			Mixer.addPaths(files.map(tr));
		} else if (act === 'allsong') {
			audioIn(self.path, 2).then(function (l) { Mixer.addPaths(l.map(tr)); });
		}
	};
	Browser.prototype.refresh = function () { this.draw(); };

	/* ------------------------------------------------------------ lettore (ascolto normale) */
	var Player = (function () {
		var audio = new Audio();
		audio.preload = 'metadata';
		var queue = [], qi = -1, repeat = false, msg = '';

		function cur() { return queue[qi] || null; }
		function load(play) {
			var t = cur();
			if (!t) { return; }
			Mixer.pause();
			audio.src = fileUrl(t.path);
			if (play) { audio.play().catch(function () { msg = 'Il browser non riesce a riprodurre questo file.'; draw(); }); }
			media();
			draw();
			if (browserLib) { browserLib.refresh(); }
		}
		function media() {
			var t = cur();
			if (!('mediaSession' in navigator) || !t) { return; }
			try {
				navigator.mediaSession.metadata = new MediaMetadata({ title: baseName(t.name), artist: t.folder || '', album: 'EDITH Studio' });
				navigator.mediaSession.setActionHandler('play', function () { audio.play(); });
				navigator.mediaSession.setActionHandler('pause', function () { audio.pause(); });
				navigator.mediaSession.setActionHandler('previoustrack', prev);
				navigator.mediaSession.setActionHandler('nexttrack', next);
				navigator.mediaSession.setActionHandler('seekto', function (d) { if (d.seekTime != null) { audio.currentTime = d.seekTime; } });
			} catch (e) { /* alcuni browser non supportano tutte le azioni */ }
		}
		function next() {
			if (qi < queue.length - 1) { qi++; load(true); }
			else if (repeat && queue.length) { qi = 0; load(true); }
		}
		function prev() {
			if (audio.currentTime > 3 || qi <= 0) { audio.currentTime = 0; return; }
			qi--; load(true);
		}
		function draw() {
			var t = cur();
			if (!t) { elPlayer.classList.add('es-hide'); return; }
			elPlayer.classList.remove('es-hide');
			elPlayer.innerHTML =
				'<div class="es-player-in"><div class="es-now"><b>' + esc(baseName(t.name)) + '</b><small>' + esc(msg || t.folder || '') + '</small></div>' +
				'<div class="es-ctl"><button class="es-btn" data-p="prev" title="Precedente">⏮</button>' +
				'<button class="es-btn pri" data-p="toggle" title="Play / pausa">' + (audio.paused ? '▶' : '⏸') + '</button>' +
				'<button class="es-btn" data-p="next" title="Successivo">⏭</button>' +
				'<button class="es-btn' + (repeat ? ' on' : '') + '" data-p="repeat" title="Ripeti la lista">⟲</button></div>' +
				'<div class="es-seek"><span id="es-cur">' + fmt(audio.currentTime) + '</span><input type="range" id="es-seekr" min="0" max="1000" value="0"><span id="es-dur">' + fmt(audio.duration) + '</span></div>' +
				'<div class="es-vol"><input type="range" id="es-volr" min="0" max="100" value="' + Math.round(audio.volume * 100) + '" title="Volume"></div></div>';
		}
		elPlayer.addEventListener('click', function (e) {
			var b = e.target.closest('[data-p]');
			if (!b) { return; }
			var a = b.getAttribute('data-p');
			if (a === 'toggle') { if (audio.paused) { Mixer.pause(); audio.play(); } else { audio.pause(); } }
			else if (a === 'next') { next(); }
			else if (a === 'prev') { prev(); }
			else if (a === 'repeat') { repeat = !repeat; draw(); }
		});
		elPlayer.addEventListener('input', function (e) {
			if (e.target.id === 'es-seekr' && audio.duration) { audio.currentTime = audio.duration * e.target.value / 1000; }
			if (e.target.id === 'es-volr') { audio.volume = e.target.value / 100; store('vol', String(audio.volume)); }
		});
		audio.addEventListener('timeupdate', function () {
			var c = elPlayer.querySelector('#es-cur'), d = elPlayer.querySelector('#es-dur'), s = elPlayer.querySelector('#es-seekr');
			if (c) { c.textContent = fmt(audio.currentTime); }
			if (d) { d.textContent = fmt(audio.duration); }
			if (s && audio.duration && document.activeElement !== s) { s.value = Math.round(audio.currentTime / audio.duration * 1000); }
		});
		audio.addEventListener('play', draw);
		audio.addEventListener('pause', draw);
		audio.addEventListener('ended', next);
		audio.addEventListener('error', function () { msg = 'Non riesco a leggere questo file.'; draw(); });
		audio.addEventListener('loadedmetadata', function () { msg = ''; draw(); });
		var v = parseFloat(store('vol')); if (v >= 0 && v <= 1) { audio.volume = v; }

		return {
			playList: function (items, i) { queue = items; qi = i; msg = ''; load(true); },
			currentPath: function () { var t = cur(); return t ? t.path : ''; },
			pause: function () { audio.pause(); },
			toast: function (m) { toast(m); }
		};
	})();

	/* ------------------------------------------------------------ mixer multitraccia (Web Audio) */
	var Mixer = (function () {
		var ctx = null, master = null, masterVol = 1;
		var tracks = [], nextId = 1;
		var playing = false, pos = 0, t0 = 0, raf = 0, loop = false, mono = MOBILE;
		var loadQ = [], loading = 0, built = false, browserMix = null;

		function ensureCtx() {
			if (!ctx) {
				var AC = window.AudioContext || window.webkitAudioContext;
				if (!AC) { return false; }
				ctx = new AC();
				master = ctx.createGain();
				master.gain.value = masterVol;
				master.connect(ctx.destination);
			}
			return true;
		}
		function ready() { return tracks.filter(function (t) { return t.buffer; }); }
		function duration() { return ready().reduce(function (m, t) { return Math.max(m, t.offset + t.buffer.duration); }, 0); }
		function memMB() { return ready().reduce(function (s, t) { return s + t.buffer.length * t.buffer.numberOfChannels * 4; }, 0) / 1048576; }

		function effGain(t) {
			var anySolo = tracks.some(function (x) { return x.solo; });
			if (t.mute) { return 0; }
			if (anySolo && !t.solo) { return 0; }
			return t.vol;
		}
		function applyGains() {
			if (!ctx) { return; }
			tracks.forEach(function (t) {
				if (t.gain) { t.gain.gain.setTargetAtTime(effGain(t), ctx.currentTime, 0.015); }
				if (t.panNode) { t.panNode.pan.setTargetAtTime(t.pan, ctx.currentTime, 0.015); }
			});
			tracks.forEach(function (t) {
				var l = elMix.querySelector('.es-lane[data-id="' + t.id + '"]');
				if (l) { l.classList.toggle('dim', effGain(t) === 0 && !!t.buffer); }
			});
		}
		function wire(t) {
			t.gain = ctx.createGain();
			t.gain.gain.value = effGain(t);
			if (ctx.createStereoPanner) {
				t.panNode = ctx.createStereoPanner();
				t.panNode.pan.value = t.pan;
				t.gain.connect(t.panNode); t.panNode.connect(master);
			} else {
				t.gain.connect(master);
			}
		}
		function stopSources() {
			tracks.forEach(function (t) {
				if (t.src) { try { t.src.onended = null; t.src.stop(); } catch (e) { /* già fermo */ } try { t.src.disconnect(); } catch (e2) { /* già scollegato */ } t.src = null; }
			});
		}
		function startSources(from) {
			stopSources();
			var lead = 0.08;
			t0 = ctx.currentTime + lead - from;
			ready().forEach(function (t) {
				if (!t.gain) { wire(t); }
				var off = Math.max(0, from - t.offset);
				if (off >= t.buffer.duration) { return; }
				var s = ctx.createBufferSource();
				s.buffer = t.buffer;
				s.connect(t.gain);
				s.start(ctx.currentTime + lead + Math.max(0, t.offset - from), off);
				t.src = s;
			});
			applyGains();
		}
		function play() {
			if (!ensureCtx() || !ready().length) { return; }
			Player.pause();
			var go = function () {
				if (pos >= duration() - 0.05) { pos = 0; }
				startSources(pos); playing = true; tick(); drawTransport();
			};
			if (ctx.state === 'suspended') { ctx.resume().then(go); } else { go(); }
		}
		function pause() {
			if (!playing) { return; }
			pos = Math.min(duration(), ctx.currentTime - t0);
			stopSources(); playing = false; cancelAnimationFrame(raf); drawTransport(); movePlayhead();
		}
		function stop() { pause(); pos = 0; movePlayhead(); drawTransport(); }
		function seek(sec) {
			pos = Math.max(0, Math.min(duration(), sec));
			if (playing) { startSources(pos); }
			movePlayhead(); drawTransport();
		}
		function tick() {
			if (!playing) { return; }
			pos = ctx.currentTime - t0;
			var d = duration();
			if (pos >= d) {
				if (loop && d > 0) { pos = 0; startSources(0); }
				else { playing = false; pos = 0; stopSources(); drawTransport(); movePlayhead(); return; }
			}
			movePlayhead();
			raf = requestAnimationFrame(tick);
		}

		/* ---- caricamento e decodifica (al massimo due alla volta, per non riempire la memoria) ---- */
		function toMono(buf) {
			if (buf.numberOfChannels < 2) { return buf; }
			var m = ctx.createBuffer(1, buf.length, buf.sampleRate);
			var o = m.getChannelData(0);
			var n = buf.numberOfChannels;
			for (var c = 0; c < n; c++) {
				var d = buf.getChannelData(c);
				for (var i = 0; i < d.length; i++) { o[i] += d[i] / n; }
			}
			return m;
		}
		function peaksOf(buf) {
			var N = 1400, out = new Float32Array(N), len = buf.length, step = Math.max(1, Math.floor(len / N / 8));
			for (var c = 0; c < buf.numberOfChannels; c++) {
				var d = buf.getChannelData(c);
				for (var b = 0; b < N; b++) {
					var a = Math.floor(b * len / N), z = Math.floor((b + 1) * len / N), mx = 0;
					for (var i = a; i < z; i += step) { var v = d[i] < 0 ? -d[i] : d[i]; if (v > mx) { mx = v; } }
					if (mx > out[b]) { out[b] = mx; }
				}
			}
			return out;
		}
		function decode(t, arrayBuffer) {
			return ctx.decodeAudioData(arrayBuffer).then(function (buf) {
				if (mono) { buf = toMono(buf); }
				t.buffer = buf; t.peaks = peaksOf(buf); t.status = 'ok';
				if (t.gain === undefined) { wire(t); }
			});
		}
		function pump() {
			while (loading < 2 && loadQ.length) {
				(function (job) {
					loading++;
					job().catch(function () { /* l'errore è già nella traccia */ }).then(function () { loading--; redraw(); pump(); });
				})(loadQ.shift());
			}
		}
		function newTrack(name, folder) {
			var t = { id: nextId++, name: name, folder: folder || '', buffer: null, peaks: null, vol: 1, pan: 0, mute: false, solo: false, offset: 0, status: 'load', msg: 'Carico…', src: null };
			tracks.push(t);
			return t;
		}
		function addPaths(items) {
			if (!ensureCtx()) { Player.toast('Il tuo browser non supporta il mixer.'); return; }
			if (!items.length) { Player.toast('Nessun file audio da aggiungere.'); return; }
			var fresh = items.filter(function (it) { return !tracks.some(function (t) { return t.path === it.path; }); });
			if (tracks.length + fresh.length > 32) { fresh = fresh.slice(0, Math.max(0, 32 - tracks.length)); Player.toast('Nel mixer entrano al massimo 32 tracce.'); }
			fresh.forEach(function (it) {
				var t = newTrack(baseName(it.name), it.folder);
				t.path = it.path;
				loadQ.push(function () {
					return fetch(fileUrl(it.path), { credentials: 'same-origin' }).then(function (r) {
						if (!r.ok) { throw new Error('Errore ' + r.status); }
						return r.arrayBuffer();
					}).then(function (ab) { t.msg = 'Decodifico…'; redraw(); return decode(t, ab); })
						.catch(function (e) { t.status = 'err'; t.msg = 'Non riesco a leggerlo (' + (e && e.message ? e.message : 'errore') + ')'; throw e; });
				});
			});
			showView('mix');
			redraw();
			pump();
		}
		function addLocal(files) {
			if (!ensureCtx()) { return; }
			[].forEach.call(files, function (f) {
				var t = newTrack(baseName(f.name), 'dal tuo computer');
				loadQ.push(function () {
					return f.arrayBuffer().then(function (ab) { return decode(t, ab); })
						.catch(function (e) { t.status = 'err'; t.msg = 'Questo file non si può leggere'; throw e; });
				});
			});
			showView('mix'); redraw(); pump();
		}
		function remove(id) {
			var i = tracks.findIndex(function (t) { return t.id === id; });
			if (i < 0) { return; }
			var t = tracks[i];
			if (t.src) { try { t.src.stop(); } catch (e) { /* già fermo */ } }
			try { if (t.gain) { t.gain.disconnect(); } if (t.panNode) { t.panNode.disconnect(); } } catch (e2) { /* già scollegato */ }
			tracks.splice(i, 1);
			if (!ready().length) { stop(); }
			redraw();
		}

		/* ---- disegno ---- */
		function build() {
			elMix.innerHTML =
				'<div class="es-mixwrap"><aside class="es-side es-card"><h3 class="es-h">Aggiungi tracce</h3><div id="es-browser-mix"></div>' +
				'<div class="es-dz" id="es-dz">…oppure trascina qui dei file dal tuo computer<br><button class="es-btn small" id="es-pick" style="margin-top:8px">Scegli file</button>' +
				'<input type="file" id="es-file" accept="audio/*" multiple class="es-hide"></div></aside>' +
				'<div><div class="es-card"><div class="es-transport" id="es-tr"></div><div class="es-lanes" id="es-lanes"></div>' +
				'<div class="es-dz" id="es-dz2">Trascina qui le tracce dall\'elenco, oppure premi ＋ accanto a un file o a una cartella.</div></div></div></div>';
			browserMix = new Browser(elMix.querySelector('#es-browser-mix'), 'add', 'mixpath');
			built = true;
			var drop = function (zone) {
				zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('over'); });
				zone.addEventListener('dragleave', function () { zone.classList.remove('over'); });
				zone.addEventListener('drop', function (e) {
					e.preventDefault(); zone.classList.remove('over');
					if (e.dataTransfer.files && e.dataTransfer.files.length) { addLocal(e.dataTransfer.files); return; }
					var raw = e.dataTransfer.getData('text/x-es');
					if (!raw) { return; }
					try {
						var o = JSON.parse(raw);
						if (o.dir) { audioIn(o.dir, 0).then(function (l) { addPaths(l.map(function (f) { return { path: f.path, name: f.name, folder: parentOf(f.path).split('/').pop() }; })); }); }
						else { addPaths([{ path: o.path, name: o.name, folder: parentOf(o.path).split('/').pop() }]); }
					} catch (er) { /* dati non nostri */ }
				});
			};
			drop(elMix.querySelector('#es-dz')); drop(elMix.querySelector('#es-dz2'));
			elMix.querySelector('#es-pick').addEventListener('click', function () { elMix.querySelector('#es-file').click(); });
			elMix.querySelector('#es-file').addEventListener('change', function (e) { addLocal(e.target.files); e.target.value = ''; });
			elMix.addEventListener('click', onClick);
			elMix.addEventListener('input', onInput);
			setupLaneInteractions();
		}
		function redraw() {
			if (!built) { build(); }
			drawTransport();
			var lanes = elMix.querySelector('#es-lanes');
			var total = Math.max(duration(), 1);
			var h = '';
			tracks.forEach(function (t) {
				h += '<div class="es-lane" data-id="' + t.id + '"><div class="es-lhead"><div class="es-lt"><span class="es-grip" draggable="true" title="Trascina per cambiare ordine">⋮⋮</span>' +
					'<span class="es-lname" title="' + esc(t.name) + '">' + esc(t.name) + '</span></div>' +
					'<div class="es-lbtns"><button class="es-btn small mute' + (t.mute ? ' on' : '') + '" data-a="mute" title="Muta">M</button>' +
					'<button class="es-btn small solo' + (t.solo ? ' on' : '') + '" data-a="solo" title="Solo">S</button>' +
					'<button class="es-btn small" data-a="zero" title="Riporta all\'inizio">↤</button>' +
					'<button class="es-btn small" data-a="del" title="Togli dal mixer">✕</button></div>' +
					'<div class="es-knobs"><span>Vol</span><input type="range" min="0" max="150" value="' + Math.round(t.vol * 100) + '" data-k="vol">' +
					'<span>Pan</span><input type="range" min="-100" max="100" value="' + Math.round(t.pan * 100) + '" data-k="pan" title="Doppio clic: centro"></div></div>' +
					'<div class="es-wavebox" data-seek="1">' + (t.buffer ?
						'<div class="es-wave" style="left:' + (t.offset / total * 100) + '%;width:' + (t.buffer.duration / total * 100) + '%"><canvas></canvas></div>' :
						'<div class="es-lmsg">' + esc(t.msg) + '</div>') + '<i class="es-ph"></i></div></div>';
			});
			lanes.innerHTML = h;
			tracks.forEach(function (t) {
				var c = lanes.querySelector('.es-lane[data-id="' + t.id + '"] canvas');
				if (c && t.peaks) { paint(c, t.peaks); }
			});
			applyGains();
			movePlayhead();
		}
		function paint(c, peaks) {
			var r = window.devicePixelRatio || 1;
			var w = Math.max(40, Math.round(c.clientWidth * r)), hh = Math.max(20, Math.round(c.clientHeight * r));
			c.width = w; c.height = hh;
			var g = c.getContext('2d');
			g.clearRect(0, 0, w, hh);
			var grad = g.createLinearGradient(0, 0, 0, hh);
			grad.addColorStop(0, '#5fd8f2'); grad.addColorStop(1, '#ff9a2e');
			g.fillStyle = grad;
			var mid = hh / 2;
			for (var x = 0; x < w; x++) {
				var p = peaks[Math.min(peaks.length - 1, Math.floor(x / w * peaks.length))];
				var a = Math.max(1, p * mid * 0.95);
				g.fillRect(x, mid - a, 1, a * 2);
			}
		}
		function movePlayhead() {
			var d = Math.max(duration(), 1);
			var cur = playing ? Math.min(d, ctx.currentTime - t0) : pos;
			var pct = Math.max(0, Math.min(100, cur / d * 100));
			[].forEach.call(elMix.querySelectorAll('.es-ph'), function (el) { el.style.left = pct + '%'; });
			var tm = elMix.querySelector('#es-t');
			if (tm) { tm.innerHTML = fmt(cur) + ' <small>/ ' + fmt(d) + '</small>'; }
		}
		function drawTransport() {
			var el = elMix.querySelector('#es-tr');
			if (!el) { return; }
			var mb = memMB();
			el.innerHTML =
				'<button class="es-btn pri" data-a="play">' + (playing ? '⏸ Pausa' : '▶ Play') + '</button><button class="es-btn" data-a="stop">⏹</button>' +
				'<button class="es-btn' + (loop ? ' on' : '') + '" data-a="loop" title="Ripeti">⟲</button>' +
				'<span class="es-time" id="es-t">' + fmt(playing ? ctx.currentTime - t0 : pos) + ' <small>/ ' + fmt(duration()) + '</small></span>' +
				'<label class="es-master">Master <input type="range" min="0" max="120" value="' + Math.round(masterVol * 100) + '" data-k="master"></label>' +
				'<button class="es-btn small" data-a="clear" title="Svuota il mixer">Svuota</button>' +
				'<label class="es-mem"><input type="checkbox" data-k="mono"' + (mono ? ' checked' : '') + '> Risparmia memoria (mono)</label>' +
				'<span class="es-mem' + (mb > (MOBILE ? 350 : 1200) ? ' warn' : '') + '">Memoria: ' + Math.round(mb) + ' MB' + (mb > (MOBILE ? 350 : 1200) ? ' (tanta: togli qualche traccia)' : '') + '</span>';
		}

		/* ---- interazioni ---- */
		function laneId(e) { var l = e.target.closest('.es-lane'); return l ? parseInt(l.getAttribute('data-id'), 10) : 0; }
		function byId(id) { return tracks.filter(function (t) { return t.id === id; })[0]; }
		function onClick(e) {
			var a = e.target.closest('[data-a]');
			if (!a || a.closest('#es-browser-mix')) { return; }
			var act = a.getAttribute('data-a'), id = laneId(e), t = byId(id);
			if (act === 'play') { if (playing) { pause(); } else { play(); } }
			else if (act === 'stop') { stop(); }
			else if (act === 'loop') { loop = !loop; drawTransport(); }
			else if (act === 'clear') { if (!tracks.length || confirm('Togliere tutte le tracce dal mixer?')) { stop(); tracks.slice().forEach(function (x) { remove(x.id); }); } }
			else if (t && act === 'mute') { t.mute = !t.mute; a.classList.toggle('on', t.mute); applyGains(); }
			else if (t && act === 'solo') { t.solo = !t.solo; a.classList.toggle('on', t.solo); [].forEach.call(elMix.querySelectorAll('.es-btn.solo'), function (b) { var tt = byId(parseInt(b.closest('.es-lane').getAttribute('data-id'), 10)); b.classList.toggle('on', !!(tt && tt.solo)); }); applyGains(); }
			else if (t && act === 'del') { remove(id); }
			else if (t && act === 'zero') { t.offset = 0; if (playing) { startSources(pos = ctx.currentTime - t0); } redraw(); }
		}
		function onInput(e) {
			var k = e.target.getAttribute('data-k');
			if (!k) { return; }
			if (k === 'master') { masterVol = e.target.value / 100; if (master) { master.gain.setTargetAtTime(masterVol, ctx.currentTime, 0.015); } return; }
			if (k === 'mono') { mono = e.target.checked; Player.toast(mono ? 'Le prossime tracce useranno meno memoria (mono).' : 'Le prossime tracce restano in stereo.'); return; }
			var t = byId(laneId(e));
			if (!t) { return; }
			if (k === 'vol') { t.vol = e.target.value / 100; }
			if (k === 'pan') { t.pan = e.target.value / 100; }
			applyGains();
		}
		function setupLaneInteractions() {
			elMix.addEventListener('dblclick', function (e) {
				if (e.target.getAttribute && e.target.getAttribute('data-k') === 'pan') { e.target.value = 0; var t = byId(laneId(e)); if (t) { t.pan = 0; applyGains(); } }
			});
			/* clic = sposta il cursore; trascinamento sull'onda = sposta la traccia nel tempo */
			var drag = null;
			elMix.addEventListener('pointerdown', function (e) {
				var box = e.target.closest('.es-wavebox');
				if (!box) { return; }
				var lane = box.closest('.es-lane'), t = byId(parseInt(lane.getAttribute('data-id'), 10));
				var onWave = !!e.target.closest('.es-wave');
				drag = { box: box, t: t, x0: e.clientX, off0: t ? t.offset : 0, moved: false, onWave: onWave, id: e.pointerId };
				try { box.setPointerCapture(e.pointerId); } catch (er) { /* non essenziale */ }
			});
			elMix.addEventListener('pointermove', function (e) {
				if (!drag || !drag.t || !drag.onWave || !drag.t.buffer) { return; }
				var dx = e.clientX - drag.x0;
				if (Math.abs(dx) > 5) { drag.moved = true; }
				if (!drag.moved) { return; }
				var total = Math.max(duration(), 1), w = drag.box.clientWidth || 1;
				drag.t.offset = Math.max(0, drag.off0 + dx / w * total);
				var wave = drag.box.querySelector('.es-wave');
				if (wave) { wave.style.left = (drag.t.offset / Math.max(duration(), 1) * 100) + '%'; }
			});
			elMix.addEventListener('pointerup', function (e) {
				if (!drag) { return; }
				var d = drag; drag = null;
				if (d.moved) { if (playing) { startSources(pos = ctx.currentTime - t0); } redraw(); return; }
				var r = d.box.getBoundingClientRect();
				seek((e.clientX - r.left) / r.width * Math.max(duration(), 0));
			});
			/* riordino delle corsie */
			var from = 0;
			elMix.addEventListener('dragstart', function (e) {
				var g = e.target.closest('.es-grip');
				if (!g) { return; }
				from = parseInt(g.closest('.es-lane').getAttribute('data-id'), 10);
				e.dataTransfer.setData('text/x-es-lane', String(from)); e.dataTransfer.effectAllowed = 'move';
			});
			elMix.addEventListener('dragover', function (e) {
				var l = e.target.closest('.es-lane');
				if (l && e.dataTransfer.types.indexOf('text/x-es-lane') >= 0) { e.preventDefault(); l.classList.add('drop'); }
			});
			elMix.addEventListener('dragleave', function (e) { var l = e.target.closest('.es-lane'); if (l) { l.classList.remove('drop'); } });
			elMix.addEventListener('drop', function (e) {
				var l = e.target.closest('.es-lane');
				if (!l || e.dataTransfer.types.indexOf('text/x-es-lane') < 0) { return; }
				e.preventDefault();
				var to = parseInt(l.getAttribute('data-id'), 10), i = tracks.findIndex(function (t) { return t.id === from; }), j = tracks.findIndex(function (t) { return t.id === to; });
				if (i >= 0 && j >= 0 && i !== j) { var m = tracks.splice(i, 1)[0]; tracks.splice(j, 0, m); }
				redraw();
			});
		}
		document.addEventListener('keydown', function (e) {
			if (elMix.classList.contains('es-hide') || e.target.matches('input, textarea, select')) { return; }
			if (e.code === 'Space') { e.preventDefault(); if (playing) { pause(); } else { play(); } }
		});
		window.addEventListener('resize', function () { if (!elMix.classList.contains('es-hide')) { redraw(); } });

		return { addPaths: addPaths, pause: pause, redraw: redraw };
	})();

	/* ------------------------------------------------------------ avvio */
	var browserLib = new Browser(root.querySelector('#es-browser-lib'), 'play', 'libpath');
	var v0 = store('view');
	if (v0 === 'mix') { showView('mix'); }
})();
