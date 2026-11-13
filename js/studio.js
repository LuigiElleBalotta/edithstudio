/* EDITH Studio: player stile "libreria musicale" + sessione di studio (mixer multitraccia).
 * Nessuna libreria, nessuna build. Parla con il WebDAV di Nextcloud con la sessione dell'utente
 * (header OCS-APIRequest): vede solo ciò che l'utente può già vedere.
 *  - Player: album (cartelle) con copertina, mini-player, schermata «In riproduzione» con coda.
 *  - Sessione di studio: il mixer si apre SOLO da un brano; non è sempre in vista. */
(function () {
	'use strict';
	var root = document.getElementById('edithstudio');
	if (!root) { return; }

	var UID = root.getAttribute('data-uid') || '';
	var WEB = root.getAttribute('data-webroot') || '';
	var AUDIO_EXT = ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'aif', 'aiff', 'wma'];
	var COVER_RE = /^(cover|folder|front|artwork|copertina)\.(jpe?g|png|webp)$/i;
	var MOBILE = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
	var STORE = 'edithstudio_';
	var ART = [['#0b3a5c', '#5fd8f2'], ['#4d1e02', '#ff9a2e'], ['#1d2b64', '#8b6cf0'], ['#06402b', '#3ee6a0'], ['#5c0b3a', '#ff6fa8'], ['#1a2a3a', '#9db4cc']];

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
	function lastName(p) { return p.split('/').filter(Boolean).pop() || ''; }
	function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return Math.abs(h); }
	function toTrack(f, album) { return { path: f.path, name: f.name, folder: lastName(parentOf(f.path)), album: album || parentOf(f.path), cover: f.cover || '' }; }

	var toastTimer = 0;
	function toast(m) {
		var el = root.querySelector('.es-toast');
		if (!el) { el = document.createElement('div'); el.className = 'es-toast'; root.appendChild(el); }
		el.textContent = m; el.classList.add('on');
		clearTimeout(toastTimer);
		toastTimer = setTimeout(function () { el.classList.remove('on'); }, 4500);
	}

	/* barre: la parte già fatta si colora seguendo la variabile --p (vedi player.css) */
	function paintRange(el) {
		if (!el || el.type !== 'range') { return; }
		var mn = parseFloat(el.min || '0'), mx = parseFloat(el.max || '100'), v = parseFloat(el.value || '0');
		el.style.setProperty('--p', (mx > mn ? Math.max(0, Math.min(100, (v - mn) / (mx - mn) * 100)) : 0) + '%');
	}
	function paintAll() { [].forEach.call(root.querySelectorAll('input[type=range]'), paintRange); }
	root.addEventListener('input', function (e) { paintRange(e.target); }, true);
	var paintQueued = false;
	new MutationObserver(function () { if (!paintQueued) { paintQueued = true; requestAnimationFrame(function () { paintQueued = false; paintAll(); }); } }).observe(root, { childList: true, subtree: true });

	/* Condividi: crea (o riusa) un link di condivisione NORMALE di Nextcloud in sola lettura. Aperto da chi non ha l'account,
	   Nextcloud lo manda alla pagina pubblica di EDITH Studio: un solo brano, niente cartelle. Password e scadenza: dal menu Condividi di Files. */
	function reqToken() {
		var h = document.head && document.head.getAttribute('data-requesttoken');
		return h || (window.OC && window.OC.requestToken) || '';
	}
	function ocs(method, query, body) {
		var o = { method: method, credentials: 'same-origin', headers: { 'OCS-APIRequest': 'true', 'Accept': 'application/json', 'requesttoken': reqToken() } };
		if (body) { o.headers['Content-Type'] = 'application/x-www-form-urlencoded'; o.body = body; }
		return fetch(WEB + '/ocs/v2.php/apps/files_sharing/api/v1/shares' + (query || '') + (query ? '&' : '?') + 'format=json', o)
			.then(function (r) { return r.json().then(function (j) { return { status: r.status, data: j && j.ocs ? j.ocs.data : null, meta: j && j.ocs ? j.ocs.meta : {} }; }); });
	}
	function copyText(t) {
		if (navigator.clipboard && window.isSecureContext) { return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return false; }); }
		return Promise.resolve(false);
	}
	function shareFile(path) {
		toast('Preparo il link…');
		ocs('GET', '?path=' + encodeURIComponent(path) + '&reshares=false').then(function (r) {
			var ex = Array.isArray(r.data) ? r.data.filter(function (s) { return s.share_type === 3 && s.url; })[0] : null;
			if (ex) { return ex.url; }
			return ocs('POST', '', 'shareType=3&permissions=1&path=' + encodeURIComponent(path)).then(function (c) {
				if (c.data && c.data.url) { return c.data.url; }
				throw new Error((c.meta && c.meta.message) || 'Non posso condividere questo file.');
			});
		}).then(function (url) {
			return copyText(url).then(function (ok) { toast(ok ? 'Link copiato. Chi lo apre può solo ascoltare questo brano: ' + url : 'Link di ascolto: ' + url); });
		}).catch(function (e) { toast(e && e.message ? e.message : 'Non sono riuscito a creare il link.'); });
	}

	/* copertina: immagine della cartella (cover.jpg…) oppure un disegno generato dal nome */
	function art(name, cover, cls) {
		if (cover) { return '<div class="es-art ' + (cls || '') + '"><img alt="" loading="lazy" src="' + esc(fileUrl(cover)) + '"></div>'; }
		var c = ART[hash(name) % ART.length];
		var ini = String(name).replace(/[^A-Za-zÀ-ÿ0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
		return '<div class="es-art ' + (cls || '') + '" style="background:linear-gradient(135deg,' + c[0] + ',' + c[1] + ')"><span>' + esc(ini || '♪') + '</span></div>';
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
			var out = [], cover = '';
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
				var isDir = resp[i].getElementsByTagNameNS('DAV:', 'collection').length > 0;
				if (!isDir && COVER_RE.test(name)) { if (!cover) { cover = href; } continue; }
				var sz = resp[i].getElementsByTagNameNS('DAV:', 'getcontentlength')[0];
				out.push({ name: name, path: href, dir: isDir, size: sz ? parseInt(sz.textContent, 10) || 0 : 0 });
			}
			var cmp = function (a, b) { return a.name.localeCompare(b.name, 'it', { numeric: true, sensitivity: 'base' }); };
			var dirs = out.filter(function (e) { return e.dir; }).sort(cmp);
			var files = out.filter(function (e) { return !e.dir && isAudio(e.name); }).sort(cmp);
			var res = dirs.concat(files);
			res.cover = cover;
			return res;
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
		'<input id="es-q" class="es-search" type="search" placeholder="Cerca in questa cartella" autocomplete="off">' +
		'<button class="es-btn es-hide" id="es-sess" title="Torna alla sessione di studio">🎚 Sessione di studio</button></div>' +
		'<div id="es-lib"></div>' +
		'<div id="es-mixer" class="es-sheet es-hide"></div>' +
		'<div id="es-np" class="es-sheet es-np es-hide"></div>' +
		'<footer class="es-mini es-hide" id="es-player"></footer>';

	var elLib = root.querySelector('#es-lib');
	var elMix = root.querySelector('#es-mixer');
	var elNp = root.querySelector('#es-np');
	var elPlayer = root.querySelector('#es-player');
	var elSess = root.querySelector('#es-sess');

	/* ------------------------------------------------------------ libreria (album a griglia, pagina dell'album) */
	var Lib = (function () {
		var path = store('libpath') || '/';
		var entries = [], groups = [], cover = '', err = '', loading = false, q = '';

		function go(p, after) {
			path = p; loading = true; err = ''; q = '';
			var qi = root.querySelector('#es-q'); if (qi) { qi.value = ''; }
			draw();
			listDir(p).then(function (e) {
				entries = e; cover = e.cover;
				var hasAudio = e.some(function (x) { return !x.dir; });
				if (!hasAudio) { return []; }
				return Promise.all(e.filter(function (x) { return x.dir; }).slice(0, 24).map(function (d) {
					return listDir(d.path).then(function (x) {
						return { dir: d, files: x.filter(function (f) { return !f.dir; }), cover: x.cover };
					}).catch(function () { return { dir: d, files: [], cover: '' }; });
				}));
			}).then(function (g) {
				groups = g; loading = false; store('libpath', p); draw(); decorate();
				if (after) { after(); }
			}).catch(function (er) {
				loading = false; entries = []; groups = []; err = er.message || 'Errore.';
				if (p !== '/') { store('libpath', '/'); }
				draw();
			});
		}

		/* copertine e numero di brani delle cartelle-album, caricati dopo (senza far aspettare la pagina) */
		function decorate() {
			var cards = [].slice.call(elLib.querySelectorAll('.es-card-album[data-dir]'));
			var i = 0;
			function next() {
				if (i >= cards.length || i > 40) { return; }
				var c = cards[i++], p = c.getAttribute('data-dir');
				listDir(p).then(function (x) {
					var n = x.filter(function (f) { return !f.dir; }).length, d = x.filter(function (f) { return f.dir; }).length;
					var sub = c.querySelector('.es-sub');
					if (sub) { sub.textContent = (n ? n + (n === 1 ? ' brano' : ' brani') : '') + (n && d ? ' · ' : '') + (d ? d + (d === 1 ? ' cartella' : ' cartelle') : '') || 'vuota'; }
					if (x.cover) { var a = c.querySelector('.es-art'); if (a) { a.outerHTML = art(lastName(p), x.cover); } }
				}).catch(function () { /* resta il disegno */ }).then(next);
			}
			next(); next();
		}

		function crumbs() {
			var parts = path.split('/').filter(Boolean), acc = '';
			var h = '<div class="es-crumbs"><button data-go="/">Tutti i file</button>';
			parts.forEach(function (p) { acc += '/' + p; h += '<span>›</span><button data-go="' + esc(acc) + '">' + esc(p) + '</button>'; });
			return h + '</div>';
		}
		function matches(name) { return !q || name.toLowerCase().indexOf(q) >= 0; }
		function row(f, i, group) {
			var now = Player.currentPath() === f.path;
			return '<li class="es-trk' + (now ? ' now' : '') + '" data-a="play" data-g="' + group + '" data-i="' + i + '"><span class="es-n">' + (now ? '♪' : (i + 1)) + '</span>' +
				'<span class="es-name">' + esc(baseName(f.name)) + '</span><span class="es-size">' + esc(fmtSize(f.size)) + '</span>' +
				'<button class="es-btn small es-share" data-a="share" data-g="' + group + '" data-i="' + i + '" title="Copia il link di ascolto (solo questo brano)">🔗</button></li>';
		}

		function draw() {
			var h = crumbs();
			var dirs = entries.filter(function (e) { return e.dir && matches(e.name); });
			var files = entries.filter(function (e) { return !e.dir && matches(e.name); });
			var isAlbum = entries.some(function (e) { return !e.dir; });
			if (loading) { h += '<div class="es-msg">Carico…</div>'; }
			else if (err) { h += '<div class="es-err">' + esc(err) + '</div>'; }
			else if (!entries.length) { h += '<div class="es-empty">Qui non ci sono cartelle né file audio.</div>'; }
			if (!loading && !err) {
				if (isAlbum) {
					var title = lastName(path) || 'Tutti i file';
					var nStem = groups.reduce(function (s, g) { return s + g.files.length; }, 0);
					h += '<section class="es-album"><div class="es-album-art">' + art(title, cover, 'big') + '</div><div class="es-album-info"><small>Brano</small><h2>' + esc(title) + '</h2>' +
						'<p>' + files.length + (files.length === 1 ? ' file' : ' file') + (nStem ? ' · ' + nStem + ' tracce separate' : '') + '</p>' +
						'<div class="es-album-btn"><button class="es-btn pri" data-a="playall">▶ Riproduci</button><button class="es-btn" data-a="shuffleall">⤮ Casuale</button>' +
						'<button class="es-btn" data-a="study" title="Apre il mixer con tutte le tracce di questo brano">🎚 Sessione di studio</button></div></div></section>';
					h += '<ul class="es-tracks">' + files.map(function (f, i) { return row(f, i, 'main'); }).join('') + '</ul>';
					groups.forEach(function (g, gi) {
						var gf = g.files.filter(function (f) { return matches(f.name) || matches(g.dir.name); });
						if (!gf.length) { return; }
						h += '<h3 class="es-gh">' + esc(g.dir.name) + ' <small>' + g.files.length + (g.files.length === 1 ? ' traccia' : ' tracce') + '</small></h3>' +
							'<ul class="es-tracks">' + gf.map(function (f, i) { return row(f, i, 'g' + gi); }).join('') + '</ul>';
					});
				}
				var others = isAlbum ? [] : dirs;
				if (others.length) {
					h += '<div class="es-grid">' + others.map(function (d) {
						return '<button class="es-card-album" data-go="' + esc(d.path) + '" data-dir="' + esc(d.path) + '">' + art(d.name, '') + '<b>' + esc(d.name) + '</b><span class="es-sub">…</span></button>';
					}).join('') + '</div>';
				}
				if (!isAlbum && files.length) {
					h += '<ul class="es-tracks">' + files.map(function (f, i) { return row(f, i, 'main'); }).join('') + '</ul>';
				}
			}
			elLib.innerHTML = h;
		}

		function listFor(group) {
			if (group === 'main') { return entries.filter(function (e) { return !e.dir; }); }
			var g = groups[parseInt(group.slice(1), 10)];
			return g ? g.files : [];
		}

		elLib.addEventListener('click', function (e) {
			var g = e.target.closest('[data-go]');
			if (g) { go(g.getAttribute('data-go')); window.scrollTo(0, 0); return; }
			var a = e.target.closest('[data-a]');
			if (!a) { return; }
			var act = a.getAttribute('data-a');
			var album = path;
			if (act === 'play') {
				var list = listFor(a.getAttribute('data-g')), i = parseInt(a.getAttribute('data-i'), 10);
				var vis = list.filter(function (f) { return matches(f.name); });
				var f = vis[i];
				if (f) { Player.playList(vis.map(function (x) { return toTrack(x, album); }), i, cover); }
			} else if (act === 'share') {
				var sl = listFor(a.getAttribute('data-g')).filter(function (f) { return matches(f.name); })[parseInt(a.getAttribute('data-i'), 10)];
				if (sl) { shareFile(sl.path); }
			} else if (act === 'playall' || act === 'shuffleall') {
				var main = entries.filter(function (x) { return !x.dir; });
				if (main.length) { Player.playList(main.map(function (x) { return toTrack(x, album); }), 0, cover, act === 'shuffleall'); }
			} else if (act === 'study') {
				Mixer.startSession(lastName(path) || 'Sessione', path);
			}
		});
		root.querySelector('#es-q').addEventListener('input', function (e) { q = e.target.value.trim().toLowerCase(); draw(); });

		/* link diretto: ?play=/cartella/brano.mp3 apre la cartella e fa partire quel file */
		function openFile(p) {
			go(parentOf(p), function () {
				var main = entries.filter(function (x) { return !x.dir; });
				var i = main.findIndex(function (x) { return x.path === p; });
				if (i >= 0) { Player.playList(main.map(function (x) { return toTrack(x, path); }), i, cover); }
				else { toast('Non trovo questo file (forse è stato spostato o non hai accesso).'); }
			});
		}
		return { go: go, draw: draw, openFile: openFile, start: function () { go(path); } };
	})();

	/* ------------------------------------------------------------ navigatore di cartelle (solo per aggiungere tracce al mixer) */
	function Browser(el, key) {
		var self = this;
		this.el = el; this.key = key;
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
		parts.forEach(function (p) { acc += '/' + p; crumbs += '<span>›</span><button data-go="' + esc(acc) + '">' + esc(p) + '</button>'; });
		var h = '<div class="es-crumbs">' + crumbs + '</div>';
		var files = this.entries.filter(function (e) { return !e.dir; });
		var dirs = this.entries.filter(function (e) { return e.dir; });
		h += '<div class="es-actions"><button class="es-btn" data-a="addhere">＋ Aggiungi questa cartella</button>' +
			'<button class="es-btn" data-a="allsong">＋ Con le sottocartelle</button></div>';
		if (this.loading) { h += '<div class="es-msg">Carico…</div>'; }
		else if (this.err) { h += '<div class="es-err">' + esc(this.err) + '</div>'; }
		else if (!this.entries.length) { h += '<div class="es-empty">Qui non ci sono cartelle né file audio.</div>'; }
		h += '<ul class="es-list">';
		if (this.path !== '/') { h += '<li class="es-row"><span class="es-ico">↰</span><span class="es-name" data-go="' + esc(parentOf(this.path)) + '">Cartella sopra</span></li>'; }
		dirs.forEach(function (d) {
			h += '<li class="es-row" draggable="true" data-drag="' + esc(JSON.stringify({ dir: d.path })) + '"><span class="es-ico">▸</span>' +
				'<span class="es-name" data-go="' + esc(d.path) + '">' + esc(d.name) + '</span>' +
				'<button class="es-btn small" title="Aggiungi i file di questa cartella" data-a="adddir" data-p="' + esc(d.path) + '">＋</button></li>';
		});
		files.forEach(function (f) {
			h += '<li class="es-row" draggable="true" data-drag="' + esc(JSON.stringify({ path: f.path, name: f.name })) + '"><span class="es-ico">♪</span>' +
				'<span class="es-name" data-a="add" data-p="' + esc(f.path) + '">' + esc(baseName(f.name)) + '</span><span class="es-size">' + esc(fmtSize(f.size)) + '</span>' +
				'<button class="es-btn small" title="Aggiungi al mixer" data-a="add" data-p="' + esc(f.path) + '">＋</button></li>';
		});
		this.el.innerHTML = h + '</ul>';
	};
	Browser.prototype.click = function (e) {
		var g = e.target.closest('[data-go]');
		if (g) { this.go(g.getAttribute('data-go')); return; }
		var a = e.target.closest('[data-a]');
		if (!a) { return; }
		var act = a.getAttribute('data-a'), p = a.getAttribute('data-p'), self = this;
		var files = this.entries.filter(function (x) { return !x.dir; });
		var tr = function (f) { return toTrack(f); };
		if (act === 'add') {
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

	/* ------------------------------------------------------------ player: mini-player + schermata «In riproduzione» */
	var Player = (function () {
		var audio = new Audio();
		audio.preload = 'metadata';
		var queue = [], qi = -1, repeat = false, shuffle = false, msg = '', cover = '', showQ = false, scrubP = false, scrubWas = false;

		function cur() { return queue[qi] || null; }
		function load(play) {
			var t = cur();
			if (!t) { return; }
			Mixer.pause();
			audio.src = fileUrl(t.path);
			if (play) { audio.play().catch(function () { msg = 'Il browser non riesce a riprodurre questo file.'; draw(); }); }
			media();
			draw();
			Lib.draw();
		}
		function media() {
			var t = cur();
			if (!('mediaSession' in navigator) || !t) { return; }
			try {
				var md = { title: baseName(t.name), artist: t.folder || '', album: lastName(t.album || '') || 'EDITH Studio' };
				if (cover) { md.artwork = [{ src: location.origin + fileUrl(cover) }]; }
				navigator.mediaSession.metadata = new MediaMetadata(md);
				navigator.mediaSession.setActionHandler('play', function () { audio.play(); });
				navigator.mediaSession.setActionHandler('pause', function () { audio.pause(); });
				navigator.mediaSession.setActionHandler('previoustrack', prev);
				navigator.mediaSession.setActionHandler('nexttrack', next);
				navigator.mediaSession.setActionHandler('seekto', function (d) { if (d.seekTime != null) { audio.currentTime = d.seekTime; } });
			} catch (e) { /* alcuni browser non supportano tutte le azioni */ }
		}
		function next() {
			if (!queue.length) { return; }
			if (shuffle && queue.length > 1) {
				var j; do { j = Math.floor(Math.random() * queue.length); } while (j === qi);
				qi = j; load(true); return;
			}
			if (qi < queue.length - 1) { qi++; load(true); }
			else if (repeat) { qi = 0; load(true); }
		}
		function prev() {
			if (audio.currentTime > 3 || qi <= 0) { audio.currentTime = 0; return; }
			qi--; load(true);
		}
		function npOpen() { return !elNp.classList.contains('es-hide'); }
		/* posizione attuale del brano, da 0 a 1000: i ridisegni (pausa, play) non devono riportare le barre a zero */
		function frac1000() { return audio.duration ? Math.round(Math.max(0, Math.min(1, audio.currentTime / audio.duration)) * 1000) : 0; }

		function draw() {
			if (scrubP) { return; }
			var t = cur();
			if (!t) { elPlayer.classList.add('es-hide'); closeNp(); return; }
			elPlayer.classList.remove('es-hide');
			var title = baseName(t.name), sub = msg || t.folder || '';
			elPlayer.innerHTML =
				'<div class="es-mini-bar"><i id="es-mbar" style="width:' + (frac1000() / 10) + '%"></i></div><div class="es-mini-in">' +
				'<button class="es-mini-info" data-p="open">' + art(lastName(t.album || '') || title, cover, 'tiny') + '<span class="es-now"><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></span></button>' +
				'<div class="es-ctl"><button class="es-btn" data-p="prev" title="Precedente">⏮</button>' +
				'<button class="es-btn pri" data-p="toggle" title="Play / pausa">' + (audio.paused ? '▶' : '⏸') + '</button>' +
				'<button class="es-btn" data-p="next" title="Successivo">⏭</button></div></div>';
			if (npOpen()) { drawNp(); }
		}
		function drawNp() {
			var t = cur();
			if (!t) { return; }
			var title = baseName(t.name);
			var up = queue.slice(qi + 1, qi + 40);
			elNp.innerHTML =
				'<div class="es-sheet-h"><button class="es-btn" data-p="closenp" title="Chiudi">⌄</button><b>In riproduzione</b><span></span></div>' +
				'<div class="es-np-body' + (showQ ? '' : ' one') + '"><div class="es-np-main">' + art(lastName(t.album || '') || title, cover, 'huge') +
				'<div class="es-np-t"><h2>' + esc(title) + '</h2><p>' + esc(msg || t.folder || '') + '</p></div>' +
				'<div class="es-seek"><span id="es-cur">' + fmt(audio.currentTime) + '</span><input type="range" id="es-seekr" min="0" max="1000" value="' + frac1000() + '"><span id="es-dur">' + fmt(audio.duration) + '</span></div>' +
				'<div class="es-npctl"><button class="es-btn' + (shuffle ? ' on' : '') + '" data-p="shuffle" title="Casuale">⤮</button><button class="es-btn" data-p="prev">⏮</button>' +
				'<button class="es-btn pri big" data-p="toggle">' + (audio.paused ? '▶' : '⏸') + '</button><button class="es-btn" data-p="next">⏭</button>' +
				'<button class="es-btn' + (repeat ? ' on' : '') + '" data-p="repeat" title="Ripeti">⟲</button>' +
				'<button class="es-btn' + (showQ ? ' on' : '') + '" data-p="queue" title="Mostra o nascondi la coda (Q)">☰</button></div>' +
				'<div class="es-npvol"><span>🔈</span><input type="range" id="es-volr" min="0" max="100" value="' + Math.round(audio.volume * 100) + '" title="Volume"></div>' +
				'<div class="es-npctl"><button class="es-btn" data-p="study" style="width:auto;border-radius:999px;padding:0 16px;font-size:14px">🎚 Studia questo brano</button><button class="es-btn" data-p="share" title="Copia il link di ascolto (solo questo brano)" style="width:auto;border-radius:999px;padding:0 16px;font-size:14px">🔗 Condividi</button></div></div>' +
				(!showQ ? '</div>' : '<div class="es-np-q"><h3 class="es-h">Prossimi brani</h3>' + (up.length ? '<ol class="es-qlist">' + up.map(function (x, k) {
					return '<li data-p="jump" data-i="' + (qi + 1 + k) + '"><span class="es-n">' + (k + 1) + '</span><span class="es-name">' + esc(baseName(x.name)) + '</span></li>';
				}).join('') + '</ol>' : '<div class="es-empty">Questo è l\'ultimo brano della lista.</div>') + '</div></div>');
		}
		function openNp() { if (!cur()) { return; } elNp.classList.remove('es-hide'); document.body.classList.add('es-noscroll'); drawNp(); }
		function closeNp() { elNp.classList.add('es-hide'); document.body.classList.remove('es-noscroll'); }

		function onClick(e) {
			var b = e.target.closest('[data-p]');
			if (!b) { return; }
			var a = b.getAttribute('data-p');
			if (a === 'toggle') { if (audio.paused) { Mixer.pause(); audio.play(); } else { audio.pause(); } }
			else if (a === 'next') { next(); }
			else if (a === 'prev') { prev(); }
			else if (a === 'repeat') { repeat = !repeat; drawNp(); }
			else if (a === 'queue') { showQ = !showQ; drawNp(); }
			else if (a === 'shuffle') { shuffle = !shuffle; drawNp(); }
			else if (a === 'open') { openNp(); }
			else if (a === 'closenp') { closeNp(); }
			else if (a === 'jump') { qi = parseInt(b.getAttribute('data-i'), 10); load(true); }
			else if (a === 'share') { var ts = cur(); if (ts) { shareFile(ts.path); } }
			else if (a === 'study') { var t = cur(); if (t) { closeNp(); Mixer.startSession(lastName(t.album || '') || baseName(t.name), t.album || parentOf(t.path)); } }
		}
		elPlayer.addEventListener('click', onClick);
		elNp.addEventListener('click', onClick);
		elNp.addEventListener('input', function (e) {
			if (e.target.id === 'es-seekr' && audio.duration) { audio.currentTime = audio.duration * e.target.value / 1000; }
			if (e.target.id === 'es-volr') { audio.volume = e.target.value / 100; store('vol', String(audio.volume)); }
		});
		audio.addEventListener('timeupdate', function () {
			var f = audio.duration ? audio.currentTime / audio.duration : 0;
			var mb = elPlayer.querySelector('#es-mbar'); if (mb) { mb.style.width = (f * 100) + '%'; }
			var c = elNp.querySelector('#es-cur'), d = elNp.querySelector('#es-dur'), s = elNp.querySelector('#es-seekr');
			if (c) { c.textContent = fmt(audio.currentTime); }
			if (d) { d.textContent = fmt(audio.duration); }
			if (s && audio.duration && !scrubP) { s.value = Math.round(f * 1000); paintRange(s); }
		});
		audio.addEventListener('play', draw);
		audio.addEventListener('pause', draw);
		audio.addEventListener('ended', next);
		audio.addEventListener('error', function () { msg = 'Non riesco a leggere questo file.'; draw(); });
		audio.addEventListener('loadedmetadata', function () { msg = ''; draw(); });
		var v = parseFloat(store('vol')); if (v >= 0 && v <= 1) { audio.volume = v; }

		/* barra del mini-player: clic o trascinamento per andare avanti e indietro */
		var barDrag = false;
		/* durante lo scorrimento (barra piccola o grande) il brano si ferma e riparte al rilascio, se suonava */
		function scrubBegin() { if (scrubP) { return; } scrubP = true; scrubWas = !audio.paused; if (scrubWas) { audio.pause(); } }
		function scrubEnd() { if (!scrubP) { return; } scrubP = false; if (scrubWas) { scrubWas = false; audio.play().catch(function () { }); } draw(); }
		document.addEventListener('pointerup', scrubEnd);
		document.addEventListener('pointercancel', scrubEnd);
		elNp.addEventListener('pointerdown', function (e) { if (e.target.id === 'es-seekr') { scrubBegin(); } });		function barSeek(e) {
			var bar = elPlayer.querySelector('.es-mini-bar');
			if (!bar || !audio.duration) { return; }
			var r = bar.getBoundingClientRect();
			audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
		}
		elPlayer.addEventListener('pointerdown', function (e) {
			var bar = e.target.closest('.es-mini-bar');
			if (!bar) { return; }
			barDrag = true; scrubBegin();
			try { bar.setPointerCapture(e.pointerId); } catch (er) { /* non essenziale */ }
			barSeek(e);
		});
		elPlayer.addEventListener('pointermove', function (e) { if (barDrag) { barSeek(e); } });
		elPlayer.addEventListener('pointerup', function () { barDrag = false; });
		elPlayer.addEventListener('pointercancel', function () { barDrag = false; });
		/* dopo aver mosso una barra, la tastiera torna alle scorciatoie */
		elNp.addEventListener('change', function (e) { if (e.target.type === 'range') { e.target.blur(); } });

		/* scorciatoie da tastiera (quando il mixer è chiuso) */
		function mixerOpen() { var m = root.querySelector('#es-mixer'); return !!m && !m.classList.contains('es-hide'); }
		function seekBy(d) { if (audio.duration) { audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + d)); } }
		function setVol(x) { audio.volume = Math.max(0, Math.min(1, x)); store('vol', String(audio.volume)); var vr = elNp.querySelector('#es-volr'); if (vr) { vr.value = Math.round(audio.volume * 100); } }
		document.addEventListener('keydown', function (e) {
			if (e.ctrlKey || e.metaKey || e.altKey || !cur() || mixerOpen()) { return; }
			var tg = e.target;
			if (tg && tg.matches && tg.matches('textarea, select, input:not([type=range])')) { return; }
			var k = e.key, used = true;
			if (tg && tg.tagName === 'BUTTON' && (k === ' ' || k === 'Enter')) { return; }
			if (k === ' ' || k === 'k' || k === 'K') { if (audio.paused) { Mixer.pause(); audio.play(); } else { audio.pause(); } }
			else if (k === 'ArrowLeft') { seekBy(e.shiftKey ? -30 : -5); }
			else if (k === 'ArrowRight') { seekBy(e.shiftKey ? 30 : 5); }
			else if (k === 'j' || k === 'J') { seekBy(-10); }
			else if (k === 'l' || k === 'L') { seekBy(10); }
			else if (k === 'ArrowUp') { setVol(audio.volume + 0.05); }
			else if (k === 'ArrowDown') { setVol(audio.volume - 0.05); }
			else if (k === 'm' || k === 'M') { audio.muted = !audio.muted; toast(audio.muted ? 'Audio disattivato' : 'Audio attivo'); }
			else if (k === 'n' || k === 'N') { next(); }
			else if (k === 'p' || k === 'P') { prev(); }
			else if (k === 's' || k === 'S') { shuffle = !shuffle; drawNp(); toast(shuffle ? 'Casuale attivo' : 'Casuale spento'); }
			else if (k === 'r' || k === 'R') { repeat = !repeat; drawNp(); toast(repeat ? 'Ripeti attivo' : 'Ripeti spento'); }
			else if (k === 'q' || k === 'Q') { showQ = !showQ; if (npOpen()) { drawNp(); } }
			else if (/^[0-9]$/.test(k)) { if (audio.duration) { audio.currentTime = audio.duration * parseInt(k, 10) / 10; } }
			else if (k === 'Escape' && npOpen()) { closeNp(); }
			else if (k === 'Enter' && !npOpen()) { openNp(); }
			else if (k === '?') { toast('Player: Spazio play/pausa · ← → ±5 s (Maiusc ±30) · J/L ±10 s · ↑ ↓ volume · M muto · N/P brano dopo/prima · S casuale · R ripeti · Q coda · 0-9 salta · Invio apre schermo intero · Esc chiude'); }
			else { used = false; }
			if (used) { e.preventDefault(); }
		});

		return {
			playList: function (items, i, cv, shuf) {
				queue = items; qi = i; msg = ''; cover = cv || ''; shuffle = !!shuf;
				if (shuf && items.length > 1) { qi = Math.floor(Math.random() * items.length); }
				load(true);
			},
			currentPath: function () { var t = cur(); return t ? t.path : ''; },
			pause: function () { audio.pause(); }
		};
	})();

	/* ------------------------------------------------------------ sessione di studio: mixer multitraccia (Web Audio) */
	var Mixer = (function () {
		var ctx = null, master = null, masterVol = 1;
		var tracks = [], nextId = 1, session = null;
		var playing = false, pos = 0, t0 = 0, raf = 0, loop = false, mono = MOBILE, scrubbing = false;
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
		/* durante lo scorrimento il suono si ferma; alla fine riparte dal nuovo punto solo se stava suonando */
		function scrubStart() { if (scrubbing) { return; } scrubbing = true; if (playing) { stopSources(); } }
		function seek(sec) {
			pos = Math.max(0, Math.min(duration(), sec));
			if (playing) { startSources(pos); }
			movePlayhead(); drawTransport();
		}
		function tick() {
			if (!playing) { return; }
			if (!scrubbing) { pos = ctx.currentTime - t0; }
			var d = duration();
			if (pos >= d && !scrubbing) {
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
			if (!ensureCtx()) { toast('Il tuo browser non supporta il mixer.'); return; }
			if (!items.length) { toast('Nessun file audio da aggiungere.'); return; }
			var fresh = items.filter(function (it) { return !tracks.some(function (t) { return t.path === it.path; }); });
			if (tracks.length + fresh.length > 32) { fresh = fresh.slice(0, Math.max(0, 32 - tracks.length)); toast('Nel mixer entrano al massimo 32 tracce.'); }
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
			if (!session) { session = { name: 'Sessione libera', path: '' }; }
			open();
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
			if (!session) { session = { name: 'Sessione libera', path: '' }; }
			open(); redraw(); pump();
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

		/* ---- sessione: si apre da un brano, non sta sempre in vista ---- */
		function open() {
			if (!built) { build(); }
			elMix.classList.remove('es-hide');
			document.body.classList.add('es-noscroll');
			elSess.classList.add('es-hide');
			redraw();
		}
		function close() {
			pause();
			elMix.classList.add('es-hide');
			document.body.classList.remove('es-noscroll');
			if (session) { elSess.classList.remove('es-hide'); elSess.textContent = '🎚 Sessione: ' + session.name; }
		}
		function end() {
			if (tracks.length && !confirm('Terminare la sessione di studio? Le tracce vengono tolte dal mixer.')) { return; }
			stop();
			tracks.slice().forEach(function (t) { remove(t.id); });
			session = null; elSess.classList.add('es-hide');
			elMix.classList.add('es-hide'); document.body.classList.remove('es-noscroll');
		}
		function startSession(name, albumPath) {
			if (session && session.path === albumPath && tracks.length) { open(); return; }
			if (session && tracks.length && !confirm('C\'è già una sessione di studio aperta («' + session.name + '»). Sostituirla con «' + name + '»?')) { return; }
			Player.pause();
			if (tracks.length) { stop(); tracks.slice().forEach(function (t) { remove(t.id); }); }
			session = { name: name, path: albumPath };
			open();
			audioIn(albumPath, 2).then(function (l) {
				if (!l.length) { toast('In questa cartella non ci sono file audio.'); return; }
				addPaths(l.map(function (f) { return toTrack(f, albumPath); }));
			}).catch(function (e) { toast(e.message || 'Non riesco a leggere la cartella.'); });
		}

		/* ---- disegno ---- */
		function build() {
			elMix.innerHTML =
				'<div class="es-sheet-h"><button class="es-btn" data-a="closemix">⌄ Chiudi</button><b>Sessione di studio <span class="es-sname" id="es-sname"></span></b>' +
				'<button class="es-btn small" data-a="endmix">Termina sessione</button></div>' +
				'<div class="es-mixwrap"><aside class="es-side es-card"><h3 class="es-h">Aggiungi tracce</h3><div id="es-browser-mix"></div>' +
				'<div class="es-dz" id="es-dz">…oppure trascina qui dei file dal tuo computer<br><button class="es-btn small" id="es-pick" style="margin-top:8px">Scegli file</button>' +
				'<input type="file" id="es-file" accept="audio/*" multiple class="es-hide"></div></aside>' +
				'<div><div class="es-card"><div class="es-transport" id="es-tr"></div><div class="es-lanes" id="es-lanes"></div>' +
				'<div class="es-dz" id="es-dz2">Trascina qui le tracce dall\'elenco, oppure premi ＋ accanto a un file o a una cartella.</div></div></div></div>';
			browserMix = new Browser(elMix.querySelector('#es-browser-mix'), 'mixpath');
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
						if (o.dir) { audioIn(o.dir, 0).then(function (l) { addPaths(l.map(function (f) { return toTrack(f); })); }); }
						else { addPaths([toTrack({ path: o.path, name: o.name })]); }
					} catch (er) { /* dati non nostri */ }
				});
			};
			drop(elMix.querySelector('#es-dz')); drop(elMix.querySelector('#es-dz2'));
			elMix.querySelector('#es-pick').addEventListener('click', function () { elMix.querySelector('#es-file').click(); });
			elMix.querySelector('#es-file').addEventListener('change', function (e) { addLocal(e.target.files); e.target.value = ''; });
			elMix.addEventListener('click', onClick);
			elMix.addEventListener('input', onInput);
			/* fine del trascinamento della barra: applica la posizione e restituisci la tastiera alle scorciatoie */
			elMix.addEventListener('change', function (e) {
				if (e.target.getAttribute && e.target.getAttribute('data-k') === 'scrub') { scrubbing = false; seek(pos); }
				if (e.target.type === 'range') { e.target.blur(); }
			});
			setupLaneInteractions();
		}
		function redraw() {
			if (!built) { return; }
			var sn = elMix.querySelector('#es-sname');
			if (sn) { sn.textContent = session ? '· ' + session.name : ''; }
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
			if (!built) { return; }
			var d = Math.max(duration(), 1);
			var cur = scrubbing ? pos : (playing ? Math.min(d, ctx.currentTime - t0) : pos);
			var sc = elMix.querySelector('#es-scrub');
			if (sc && !scrubbing) { sc.value = String(Math.round(Math.max(0, Math.min(1, cur / d)) * 1000)); paintRange(sc); }
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
					'<input type="range" class="es-scrub" id="es-scrub" min="0" max="1000" value="' + Math.round(Math.max(0, Math.min(1, (playing ? ctx.currentTime - t0 : pos) / Math.max(duration(), 1))) * 1000) + '" data-k="scrub" title="Trascina per andare avanti e indietro">' +
				'<label class="es-master">Master <input type="range" min="0" max="120" value="' + Math.round(masterVol * 100) + '" data-k="master"></label>' +
				'<button class="es-btn small" data-a="clear" title="Togli tutte le tracce">Svuota</button>' +
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
			if (act === 'closemix') { close(); }
			else if (act === 'endmix') { end(); }
			else if (act === 'play') { if (playing) { pause(); } else { play(); } }
			else if (act === 'stop') { stop(); }
			else if (act === 'loop') { loop = !loop; drawTransport(); }
			else if (act === 'clear') { if (!tracks.length || confirm('Togliere tutte le tracce dal mixer?')) { stop(); tracks.slice().forEach(function (x) { remove(x.id); }); } }
			else if (t && act === 'mute') { t.mute = !t.mute; a.classList.toggle('on', t.mute); applyGains(); }
			else if (t && act === 'solo') { t.solo = !t.solo; [].forEach.call(elMix.querySelectorAll('.es-btn.solo'), function (b) { var tt = byId(parseInt(b.closest('.es-lane').getAttribute('data-id'), 10)); b.classList.toggle('on', !!(tt && tt.solo)); }); applyGains(); }
			else if (t && act === 'del') { remove(id); }
			else if (t && act === 'zero') { t.offset = 0; if (playing) { startSources(pos = ctx.currentTime - t0); } redraw(); }
		}
		function onInput(e) {
			var k = e.target.getAttribute('data-k');
			if (!k) { return; }
			if (k === 'scrub') { scrubStart(); pos = Math.max(0, Math.min(duration(), e.target.value / 1000 * duration())); movePlayhead(); return; }
			if (k === 'master') { masterVol = e.target.value / 100; if (master) { master.gain.setTargetAtTime(masterVol, ctx.currentTime, 0.015); } return; }
			if (k === 'mono') { mono = e.target.checked; toast(mono ? 'Le prossime tracce useranno meno memoria (mono).' : 'Le prossime tracce restano in stereo.'); return; }
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
				drag = { box: box, t: t, x0: e.clientX, off0: t ? t.offset : 0, moved: false, onWave: !!e.target.closest('.es-wave') };
				drag.scrub = !drag.onWave || e.shiftKey; /* fuori dall'onda, o con Maiusc: il trascinamento sposta il cursore */
				try { box.setPointerCapture(e.pointerId); } catch (er) { /* non essenziale */ }
			});
			elMix.addEventListener('pointermove', function (e) {
				if (!drag) { return; }
				if (drag.scrub) {
					var rb = drag.box.getBoundingClientRect();
					if (Math.abs(e.clientX - drag.x0) > 3) { drag.moved = true; }
					if (drag.moved) { scrubStart(); pos = Math.max(0, Math.min(duration(), (e.clientX - rb.left) / rb.width * duration())); movePlayhead(); }
					return;
				}
				if (!drag.t || !drag.onWave || !drag.t.buffer) { return; }
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
				if (d.scrub && d.moved) { scrubbing = false; seek(pos); return; }
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
			if (elMix.classList.contains('es-hide') || e.ctrlKey || e.metaKey || e.altKey) { return; }
			var tg = e.target;
			if (tg && tg.matches && tg.matches('textarea, select, input:not([type=range])')) { return; }
			var k = e.key, used = true;
			if (tg && tg.tagName === 'BUTTON' && (k === ' ' || k === 'Enter')) { return; }
			var nowT = playing ? ctx.currentTime - t0 : pos;
			var dig = /^Digit([1-9])$/.exec(e.code);
			if (k === ' ' || k === 'k' || k === 'K') { if (playing) { pause(); } else { play(); } }
			else if (k === 'ArrowLeft') { seek(nowT - (e.shiftKey ? 15 : 5)); }
			else if (k === 'ArrowRight') { seek(nowT + (e.shiftKey ? 15 : 5)); }
			else if (k === 'j' || k === 'J') { seek(nowT - 10); }
			else if (k === 'l' || k === 'L') { loop = !loop; drawTransport(); }
			else if (k === 'Home' || k === '0') { seek(0); }
			else if (k === 'End') { seek(duration()); }
			else if (dig) { var ln = elMix.querySelectorAll('.es-lane')[parseInt(dig[1], 10) - 1]; var bt = ln && ln.querySelector(e.shiftKey ? '.solo' : '.mute'); if (bt) { bt.click(); } }
			else if (k === 'Escape') { close(); }
			else if (k === '?') { toast('Mixer: Spazio play/pausa · ← → ±5 s (Maiusc ±15) · J −10 s · Home inizio · L ripeti · 1-9 muta traccia (Maiusc = solo) · trascina fuori dall\'onda o con Maiusc per scorrere · Esc chiudi'); }
			else { used = false; }
			if (used) { e.preventDefault(); }
		});
		window.addEventListener('resize', function () { if (!elMix.classList.contains('es-hide')) { redraw(); } });
		elSess.addEventListener('click', open);

		return { addPaths: addPaths, pause: pause, startSession: startSession };
	})();

	/* ------------------------------------------------------------ avvio */
	var deep = /[?&]play=([^&]+)/.exec(location.search);
	if (deep) { try { Lib.openFile(decodeURIComponent(deep[1])); } catch (e) { Lib.start(); } } else { Lib.start(); }
})();
