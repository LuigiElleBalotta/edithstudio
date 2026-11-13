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

	/* ------------------------------------------------------------ dati dell'utente: playlist e sessioni del mixer
	   Si salvano su Nextcloud (solo quelli di chi è collegato) e contengono solo riferimenti ai file, mai i file. */
	var State = (function () {
		var data = { playlists: [], sessions: [] }, loaded = null, ok = false, timer = 0;
		var URL_STATE = WEB + '/apps/edithstudio/api/state';
		function hdr(json) {
			var h = { 'OCS-APIRequest': 'true', 'Accept': 'application/json', 'requesttoken': reqToken() };
			if (json) { h['Content-Type'] = 'application/json'; }
			return h;
		}
		function load() {
			if (!loaded) {
				loaded = fetch(URL_STATE, { credentials: 'same-origin', headers: hdr(false) }).then(function (r) {
					if (!r.ok) { throw new Error('stato ' + r.status); }
					return r.json();
				}).then(function (d) {
					data = { playlists: d.playlists || [], sessions: d.sessions || [] };
					ok = true;
					return data;
				}).catch(function () {
					loaded = null;
					toast('Non riesco a leggere le tue playlist e le sessioni salvate. Riprova tra poco.');
					return data;
				});
			}
			return loaded;
		}
		function doSave() {
			if (!ok) { toast('Le tue playlist non sono ancora state lette: non salvo per non cancellarle. Ricarica la pagina.'); return; }
			fetch(URL_STATE, { method: 'PUT', credentials: 'same-origin', headers: hdr(true), body: JSON.stringify(data) }).then(function (r) {
				if (!r.ok) { throw new Error('salvataggio ' + r.status); }
			}).catch(function () { toast('Non sono riuscito a salvare. Riprova.'); });
		}
		function save() { clearTimeout(timer); timer = setTimeout(doSave, 400); }
		function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
		return { ready: load, load: load, save: save, newId: newId, data: function () { return data; } };
	})();

	/* ------------------------------------------------------------ tag e copertine dentro ai file (MP3 / FLAC)
	   Si legge solo l'inizio del file (richiesta parziale): mai l'intero brano. */
	var Tags = (function () {
		var cache = {}, waiting = [], busy = 0, EMPTY = {};
		function rng(path, to) {
			return fetch(fileUrl(path), { credentials: 'same-origin', headers: { 'Range': 'bytes=0-' + (to - 1) } }).then(function (r) {
				if (r.status !== 206) {
					if (r.body && r.body.cancel) { try { r.body.cancel(); } catch (e) { /* già chiuso */ } }
					throw new Error('no-range');
				}
				return r.arrayBuffer();
			}).then(function (ab) { return new Uint8Array(ab); });
		}
		function ss(b, i) { return ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f); }
		function u32(b, i) { return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0; }
		function ascii(b, i, n) { var s = ''; for (var k = 0; k < n; k++) { s += String.fromCharCode(b[i + k]); } return s; }
		function dec(b, enc) {
			try {
				if (enc === 1 || enc === 2) {
					var bom = b.length >= 2 && ((b[0] === 0xFF && b[1] === 0xFE) || (b[0] === 0xFE && b[1] === 0xFF));
					var be = enc === 2 || (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF);
					return new TextDecoder(be ? 'utf-16be' : 'utf-16le').decode(bom ? b.subarray(2) : b);
				}
				return new TextDecoder(enc === 3 ? 'utf-8' : 'windows-1252').decode(b);
			} catch (e) { return ''; }
		}
		function txt(d) { return dec(d.subarray(1), d[0]).split('\u0000')[0]; }
		function apic(d, v22) {
			var enc = d[0], i = 1, mime;
			if (v22) { mime = 'image/' + ascii(d, 1, 3).toLowerCase().replace('jpg', 'jpeg'); i = 4; }
			else { var j = i; while (j < d.length && d[j] !== 0) { j++; } mime = ascii(d, i, j - i); i = j + 1; }
			i++; /* tipo di immagine */
			if (enc === 1 || enc === 2) { while (i + 1 < d.length && !(d[i] === 0 && d[i + 1] === 0)) { i += 2; } i += 2; }
			else { while (i < d.length && d[i] !== 0) { i++; } i++; }
			return { mime: mime || 'image/jpeg', bytes: d.subarray(i) };
		}
		function id3(b) {
			if (!(b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33)) { return null; }
			var ver = b[3], flags = b[5], size = ss(b, 6), pos = 10, end = Math.min(b.length, 10 + size), t = {};
			if (ver >= 3 && (flags & 0x40)) { pos += ver === 4 ? ss(b, pos) : u32(b, pos) + 4; }
			var hl = ver === 2 ? 6 : 10;
			while (pos + hl <= end) {
				var id, fs;
				if (ver === 2) { id = ascii(b, pos, 3); fs = (b[pos + 3] << 16) | (b[pos + 4] << 8) | b[pos + 5]; }
				else { id = ascii(b, pos, 4); fs = ver === 4 ? ss(b, pos + 4) : u32(b, pos + 4); }
				if (!id || id.charCodeAt(0) === 0 || fs <= 0 || pos + hl + fs > b.length) { break; }
				var d = b.subarray(pos + hl, pos + hl + fs);
				if (id === 'TIT2' || id === 'TT2') { t.title = txt(d); }
				else if (id === 'TPE1' || id === 'TP1') { t.artist = txt(d); }
				else if (id === 'TPE2' || id === 'TP2') { t.albumArtist = txt(d); }
				else if (id === 'TALB' || id === 'TAL') { t.album = txt(d); }
				else if (id === 'TYER' || id === 'TYE' || id === 'TDRC') { t.year = (txt(d) || '').slice(0, 4); }
				else if (id === 'TRCK' || id === 'TRK') { t.track = txt(d); }
				else if ((id === 'APIC' || id === 'PIC') && !t.pic) { t.pic = apic(d, ver === 2); }
				pos += hl + fs;
			}
			return t;
		}
		function vorbis(d, t) {
			var dv = new DataView(d.buffer, d.byteOffset, d.byteLength), p = 0;
			p += 4 + dv.getUint32(p, true);
			var n = dv.getUint32(p, true); p += 4;
			for (var i = 0; i < n && p + 4 <= d.length; i++) {
				var l = dv.getUint32(p, true); p += 4;
				var s = new TextDecoder('utf-8').decode(d.subarray(p, p + l)); p += l;
				var k = s.indexOf('=');
				if (k < 0) { continue; }
				var key = s.slice(0, k).toUpperCase(), val = s.slice(k + 1);
				if (key === 'TITLE') { t.title = val; } else if (key === 'ARTIST') { t.artist = val; } else if (key === 'ALBUM') { t.album = val; }
				else if (key === 'DATE' || key === 'YEAR') { t.year = val.slice(0, 4); } else if (key === 'TRACKNUMBER') { t.track = val; }
			}
		}
		function flacPic(d) {
			var dv = new DataView(d.buffer, d.byteOffset, d.byteLength), p = 4;
			var ml = dv.getUint32(p); p += 4;
			var mime = ascii(d, p, ml); p += ml;
			p += 4 + dv.getUint32(p) + 16;
			var n = dv.getUint32(p); p += 4;
			return { mime: mime || 'image/jpeg', bytes: d.subarray(p, p + n) };
		}
		function flac(b) {
			if (!(b[0] === 0x66 && b[1] === 0x4C && b[2] === 0x61 && b[3] === 0x43)) { return null; }
			var pos = 4, t = {}, last = false;
			while (!last && pos + 4 <= b.length) {
				var h = b[pos], type = h & 0x7f, len = (b[pos + 1] << 16) | (b[pos + 2] << 8) | b[pos + 3];
				last = !!(h & 0x80);
				if (pos + 4 + len > b.length) { return { t: t, need: pos + 4 + len }; }
				var d = b.subarray(pos + 4, pos + 4 + len);
				if (type === 4) { vorbis(d, t); } else if (type === 6 && !t.pic) { t.pic = flacPic(d); }
				pos += 4 + len;
			}
			return { t: t, need: 0 };
		}
		function clean(s) { return typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200) : ''; }
		function finish(t) {
			if (!t) { return EMPTY; }
			var out = { title: clean(t.title), artist: clean(t.artist || t.albumArtist), album: clean(t.album), year: t.year || '', track: t.track || '', cover: '' };
			if (t.pic && t.pic.bytes && t.pic.bytes.length > 64 && t.pic.bytes.length < 10 * 1048576) {
				try { out.cover = URL.createObjectURL(new Blob([t.pic.bytes], { type: t.pic.mime })); } catch (e) { /* senza copertina */ }
			}
			return out;
		}
		function read(path) {
			var e = ext(path);
			if (e !== 'mp3' && e !== 'flac') { return Promise.resolve(EMPTY); }
			return rng(path, 65536).then(function (b) {
				if (e === 'mp3') {
					var need = (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) ? 10 + ss(b, 6) : 0;
					if (need > b.length && need <= 10 * 1048576) { return rng(path, need).then(function (b2) { return id3(b2); }); }
					return id3(b);
				}
				var r = flac(b);
				if (r && r.need > b.length && r.need <= 12 * 1048576) {
					return rng(path, r.need).then(function (b2) { var r2 = flac(b2); return r2 && r2.t; });
				}
				return r && r.t;
			}).then(finish).catch(function () { return EMPTY; });
		}
		function pump() {
			while (busy < 2 && waiting.length) {
				(function (j) {
					busy++;
					read(j.path).then(j.ok).then(function () { busy--; pump(); });
				})(waiting.shift());
			}
		}
		/* urgent = serve subito (il brano che sta suonando) */
		function get(path, urgent) {
			if (!cache[path]) {
				cache[path] = new Promise(function (ok) {
					var job = { path: path, ok: ok };
					if (urgent) { waiting.unshift(job); } else { waiting.push(job); }
					pump();
				});
			}
			return cache[path];
		}
		function forget(path) { delete cache[path]; }
		return { get: get, forget: forget };
	})();

	/* copertina: immagine della cartella (cover.jpg…) oppure un disegno generato dal nome */
	function coverUrl(c) { return /^(blob:|data:)/.test(c) ? c : fileUrl(c); }
	function art(name, cover, cls) {
		if (cover) { return '<div class="es-art ' + (cls || '') + '"><img alt="" loading="lazy" src="' + esc(coverUrl(cover)) + '"></div>'; }
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
		'<button class="es-btn" id="es-pl" title="Le tue playlist">♫ Playlist</button>' +
		'<button class="es-btn" id="es-sessions" title="Riapri una sessione di studio salvata">🎚 Sessioni</button>' +
		'<button class="es-btn" id="es-phone" title="Ascolta dal telefono (Subsonic / Ampache)">📱 Telefono</button>' +
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
	root.querySelector('#es-pl').addEventListener('click', function () { Lib.showPlaylists(); window.scrollTo(0, 0); });
	root.querySelector('#es-phone').addEventListener('click', function () { Phone.open(); });
	root.querySelector('#es-sessions').addEventListener('click', function () { Mixer.openSessions(); });

	/* ------------------------------------------------------------ libreria (album a griglia, pagina dell'album) */
	var Lib = (function () {
		var path = store('libpath') || '/';
		var entries = [], groups = [], cover = '', err = '', loading = false, q = '', view = 'files';

		function go(p, after) {
			path = p; view = 'files'; loading = true; err = ''; q = '';
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
					else {
						var af = x.filter(function (f) { return !f.dir; })[0];
						if (af) { Tags.get(af.path).then(function (t) { var a2 = c.isConnected && c.querySelector('.es-art'); if (t && t.cover && a2) { a2.outerHTML = art(lastName(p), t.cover); } }); }
					}
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
			return '<li class="es-trk' + (now ? ' now' : '') + '" data-a="play" data-g="' + group + '" data-i="' + i + '" data-path="' + esc(f.path) + '"><span class="es-n">' + (now ? '♪' : (i + 1)) + '</span>' +
				'<span class="es-name">' + esc(baseName(f.name)) + '</span><span class="es-size">' + esc(fmtSize(f.size)) + '</span>' +
				'<button class="es-btn small es-share" data-a="share" data-g="' + group + '" data-i="' + i + '" title="Copia il link di ascolto (solo questo brano)">🔗</button>' +
				'<button class="es-btn small es-more" data-a="menu" data-g="' + group + '" data-i="' + i + '" title="Altre azioni (anche tasto destro)">⋯</button></li>';
		}

		function draw() {
			if (view !== 'files') { drawPl(); return; }
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
						'<button class="es-btn" data-a="study" title="Apre il mixer con tutte le tracce di questo brano">🎚 Sessione di studio</button>' +
							'<button class="es-btn" data-a="amenu" title="Altre azioni su questa cartella">⋯</button></div></div></section>';
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
			decorateTags();
		}

		function curPl() { var m = /^pl:(.+)$/.exec(view); return m ? Playlists.get(m[1]) : null; }
		function plPlural(n) { return n + (n === 1 ? ' brano' : ' brani'); }
		/* elenco delle playlist e pagina di una playlist */
		function drawPl() {
			var p = view === 'pls' ? null : curPl();
			if (view !== 'pls' && !p) { view = 'pls'; }
			var h = '<div class="es-crumbs"><button data-go="' + esc(path) + '">Tutti i file</button><span>›</span><button data-a="plhome">Playlist</button>' +
				(p ? '<span>›</span><button data-a="plopen" data-pl="' + esc(p.id) + '">' + esc(p.name) + '</button>' : '') + '</div>';
			if (!p) {
				h += '<div class="es-grid">' + Playlists.all().map(function (x) {
					return '<button class="es-card-album" data-a="plopen" data-pl="' + esc(x.id) + '">' + art(x.name, '') + '<b>' + esc(x.name) + '</b><span class="es-sub">' + plPlural(x.tracks.length) + '</span></button>';
				}).join('') + '<button class="es-card-album es-new" data-a="plnew"><div class="es-art"><span>＋</span></div><b>Nuova playlist</b><span class="es-sub">&nbsp;</span></button></div>';
				if (!Playlists.all().length) { h += '<div class="es-empty">Non hai ancora playlist. Creane una, poi aggiungi i brani dal tasto destro («Aggiungi a una playlist…»).</div>'; }
			} else {
				h += '<section class="es-album"><div class="es-album-art">' + art(p.name, '', 'big') + '</div><div class="es-album-info"><small>Playlist</small><h2>' + esc(p.name) + '</h2>' +
					'<p>' + plPlural(p.tracks.length) + '</p><div class="es-album-btn"><button class="es-btn pri" data-a="playall">▶ Riproduci</button><button class="es-btn" data-a="shuffleall">⤤ Casuale</button>' +
					'<button class="es-btn" data-a="plmenu" title="Rinomina o elimina la playlist">⋯</button></div></div></section>';
				var tr = listFor('pl').filter(function (f) { return matches(f.name); });
				h += tr.length ? '<ul class="es-tracks">' + tr.map(function (f, i) { return row(f, i, 'pl'); }).join('') + '</ul>'
					: '<div class="es-empty">La playlist è vuota. Dal tasto destro su un brano scegli «Aggiungi a una playlist…».</div>';
			}
			elLib.innerHTML = h;
			decorateTags();
		}
		/* titolo e artista scritti dentro ai file al posto del nome del file; copertina dell'album dal primo brano */
		function decorateTags() {
			[].slice.call(elLib.querySelectorAll('.es-trk[data-path]')).slice(0, 80).forEach(function (r) {
				var fp = r.getAttribute('data-path');
				Tags.get(fp).then(function (t) {
					if (!t || !r.isConnected) { return; }
					var nm = r.querySelector('.es-name');
					if (nm && t.title) { nm.innerHTML = esc(t.title) + (t.artist ? ' <small class="es-sub2">· ' + esc(t.artist) + '</small>' : ''); nm.title = lastName(fp); }
				});
			});
			if (view === 'files' && !cover) {
				var first = elLib.querySelector('.es-trk[data-g="main"][data-path]');
				if (first) {
					Tags.get(first.getAttribute('data-path')).then(function (t) {
						var a = elLib.querySelector('.es-album-art');
						if (t && t.cover && a && !cover && view === 'files') { cover = t.cover; a.innerHTML = art(lastName(path) || 'Tutti i file', t.cover, 'big'); }
					});
				}
			}
			[].slice.call(elLib.querySelectorAll('.es-card-album[data-pl]')).forEach(function (c) {
				var x = Playlists.get(c.getAttribute('data-pl'));
				if (x && x.tracks[0]) { Tags.get(x.tracks[0].path).then(function (t) { var a = c.isConnected && c.querySelector('.es-art'); if (t && t.cover && a) { a.outerHTML = art(x.name, t.cover); } }); }
			});
		}

		function listFor(group) {
			if (group === 'pl') { var cp = curPl(); return cp ? cp.tracks.map(function (t) { return { path: t.path, name: t.name, size: 0, dir: false }; }) : []; }
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
			var album = view === 'files' ? path : undefined, cov = view === 'files' ? cover : '';
			if (act === 'plhome') { view = 'pls'; draw(); }
			else if (act === 'plopen') { view = 'pl:' + a.getAttribute('data-pl'); draw(); window.scrollTo(0, 0); }
			else if (act === 'plnew') { Playlists.newOne(); }
			else if (act === 'plmenu') { var pp = curPl(); if (pp) { var rr = a.getBoundingClientRect(); Ctx.show(rr.left, rr.bottom + 4, Playlists.items(pp)); } }
			else if (act === 'play') {
				var list = listFor(a.getAttribute('data-g')), i = parseInt(a.getAttribute('data-i'), 10);
				var vis = list.filter(function (f) { return matches(f.name); });
				var f = vis[i];
				if (f) { Player.playList(vis.map(function (x) { return toTrack(x, album); }), i, cov); }
			} else if (act === 'share') {
				var sl = listFor(a.getAttribute('data-g')).filter(function (f) { return matches(f.name); })[parseInt(a.getAttribute('data-i'), 10)];
				if (sl) { shareFile(sl.path); }
			} else if (act === 'playall' || act === 'shuffleall') {
				var main = view === 'files' ? entries.filter(function (x) { return !x.dir; }) : listFor('pl');
				if (main.length) { Player.playList(main.map(function (x) { return toTrack(x, album); }), 0, cov, act === 'shuffleall'); }
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
		return {
			go: go, draw: draw, openFile: openFile, start: function () { go(path); },
			path: function () { return path; }, reload: function () { go(path); },
			/* la riga (gruppo, posizione) con tutto cio' che serve al menu */
			view: function () { return view; },
			showPlaylists: function () { view = 'pls'; draw(); State.ready().then(function () { if (view !== 'files') { draw(); } }); },
			openPlaylist: function (id) { view = 'pl:' + id; draw(); },
			rowInfo: function (group, i) {
				var vis = listFor(group).filter(function (f) { return matches(f.name); });
				if (!vis[i]) { return null; }
				var inPl = group === 'pl', cp = inPl ? curPl() : null;
				return {
					f: vis[i], list: vis, idx: i, album: inPl ? undefined : path, cover: inPl ? '' : cover,
					pl: cp ? cp.id : '', plIdx: cp ? cp.tracks.findIndex(function (x) { return x.path === vis[i].path; }) : -1
				};
			}
		};
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
			if (!t.tags) { Tags.get(t.path, true).then(function (tg) { t.tags = tg || {}; if (cur() === t) { media(); draw(); } }); }
			if (play) { audio.play().catch(function (er) { msg = (er && er.name === 'NotAllowedError') ? 'Il browser non fa partire l\'audio da solo: premi ▶.' : 'Il browser non riesce a riprodurre questo file.'; draw(); if (er && er.name === 'NotAllowedError') { toast('Premi ▶ per avviare il brano (il browser non permette l\'avvio automatico).'); } }); }
			media();
			draw();
			Lib.draw();
		}
		function media() {
			var t = cur();
			if (!('mediaSession' in navigator) || !t) { return; }
			try {
				var tg = t.tags || {};
				var md = { title: tg.title || baseName(t.name), artist: tg.artist || t.folder || '', album: tg.album || lastName(t.album || '') || 'EDITH Studio' };
				var cu = tg.cover || cover;
				if (cu) { md.artwork = [{ src: /^blob:/.test(cu) ? cu : location.origin + fileUrl(cu) }]; }
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
			var tg = t.tags || {}, title = tg.title || baseName(t.name), sub = msg || (tg.artist ? tg.artist + (tg.album ? ' · ' + tg.album : '') : (t.folder || ''));
			elPlayer.innerHTML =
				'<div class="es-mini-bar"><i id="es-mbar" style="width:' + (frac1000() / 10) + '%"></i></div><div class="es-mini-in">' +
				'<button class="es-mini-info" data-p="open">' + art(lastName(t.album || '') || title, tg.cover || cover, 'tiny') + '<span class="es-now"><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></span></button>' +
				'<div class="es-ctl"><button class="es-btn" data-p="prev" title="Precedente">⏮</button>' +
				'<button class="es-btn pri" data-p="toggle" title="Play / pausa">' + (audio.paused ? '▶' : '⏸') + '</button>' +
				'<button class="es-btn" data-p="next" title="Successivo">⏭</button></div></div>';
			if (npOpen()) { drawNp(); }
		}
		function drawNp() {
			var t = cur();
			if (!t) { return; }
			var tg = t.tags || {}, title = tg.title || baseName(t.name), sub = msg || (tg.artist ? tg.artist + (tg.album ? ' · ' + tg.album : '') : (t.folder || ''));
			var up = queue.slice(qi + 1, qi + 40);
			elNp.innerHTML =
				'<div class="es-sheet-h"><button class="es-btn" data-p="closenp" title="Chiudi">⌄</button><b>In riproduzione</b><span></span></div>' +
				'<div class="es-np-body' + (showQ ? '' : ' one') + '"><div class="es-np-main">' + art(lastName(t.album || '') || title, tg.cover || cover, 'huge') +
				'<div class="es-np-t"><h2>' + esc(title) + '</h2><p>' + esc(sub) + '</p></div>' +
				'<div class="es-seek"><span id="es-cur">' + fmt(audio.currentTime) + '</span><input type="range" id="es-seekr" min="0" max="1000" value="' + frac1000() + '"><span id="es-dur">' + fmt(audio.duration) + '</span></div>' +
				'<div class="es-npctl"><button class="es-btn' + (shuffle ? ' on' : '') + '" data-p="shuffle" title="Casuale">⤮</button><button class="es-btn" data-p="prev">⏮</button>' +
				'<button class="es-btn pri big" data-p="toggle">' + (audio.paused ? '▶' : '⏸') + '</button><button class="es-btn" data-p="next">⏭</button>' +
				'<button class="es-btn' + (repeat ? ' on' : '') + '" data-p="repeat" title="Ripeti">⟲</button>' +
				'<button class="es-btn' + (showQ ? ' on' : '') + '" data-p="queue" title="Mostra o nascondi la coda (Q)">☰</button></div>' +
				'<div class="es-npvol"><span>🔈</span><input type="range" id="es-volr" min="0" max="100" value="' + Math.round(audio.volume * 100) + '" title="Volume"></div>' +
				'<div class="es-npctl"><button class="es-btn" data-p="study" style="width:auto;border-radius:999px;padding:0 16px;font-size:14px">🎚 Studia questo brano</button><button class="es-btn" data-p="share" title="Copia il link di ascolto (solo questo brano)" style="width:auto;border-radius:999px;padding:0 16px;font-size:14px">🔗 Condividi</button><button class="es-btn" data-p="addpl" title="Aggiungi a una playlist" style="width:auto;border-radius:999px;padding:0 16px;font-size:14px">♫ Playlist</button></div></div>' +
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
			else if (a === 'addpl') { var tp = cur(); if (tp) { Playlists.pick([{ path: tp.path, name: tp.name }]); } }
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
			pause: function () { audio.pause(); },
			current: function () { return cur(); },
			/* "Riproduci dopo": mette il brano subito dopo quello in corso */
			playNext: function (t) {
				if (!queue.length) { queue = [t]; qi = 0; msg = ''; cover = ''; load(true); return; }
				queue.splice(qi + 1, 0, t); toast('Aggiunto: parte dopo il brano in corso.'); if (npOpen()) { drawNp(); }
			}
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
				if (it.s) { t.vol = it.s.vol; t.pan = it.s.pan; t.mute = !!it.s.mute; t.solo = !!it.s.solo; t.offset = it.s.offset || 0; }
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

		/* ---- sessioni salvate (per utente): quali tracce, volumi, bilanciamento, mute/solo, spostamenti ---- */
		function saveSession() {
			var saved = tracks.filter(function (t) { return t.path; });
			var local = tracks.length - saved.length;
			if (!saved.length) { toast('Nel mixer non ci sono tracce di Nextcloud da salvare.'); return; }
			Ctx.ask({
				title: 'Salva la sessione',
				text: 'Nome:' + (local ? ' (le ' + local + ' tracce caricate dal tuo computer non si possono salvare)' : ''),
				input: session && session.name && session.name !== 'Sessione libera' ? session.name : '', ok: 'Salva'
			}).then(function (v) {
				if (v == null) { return; }
				var name = v.trim().slice(0, 120) || 'Sessione';
				State.ready().then(function () {
					var listS = State.data().sessions;
					var s = {
						id: State.newId(), name: name, saved: Math.floor(Date.now() / 1000), master: masterVol, loop: loop,
						tracks: saved.map(function (t) { return { path: t.path, name: t.name, vol: t.vol, pan: t.pan, mute: !!t.mute, solo: !!t.solo, offset: t.offset || 0 }; })
					};
					var i = listS.findIndex(function (x) { return x.name === name; });
					if (i >= 0) { s.id = listS[i].id; listS[i] = s; } else { listS.push(s); }
					if (!session) { session = { name: name, path: '' }; } else { session.name = name; }
					redraw();
					State.save();
					toast('Sessione «' + name + '» salvata (' + saved.length + (saved.length === 1 ? ' traccia' : ' tracce') + ').');
				});
			});
		}
		function loadSession(s) {
			var go = function () {
				Player.pause();
				if (tracks.length) { stop(); tracks.slice().forEach(function (t) { remove(t.id); }); }
				session = { name: s.name, path: '' };
				masterVol = s.master != null ? s.master : 1; loop = !!s.loop;
				addPaths(s.tracks.map(function (t) { return { path: t.path, name: t.name, folder: lastName(parentOf(t.path)), s: t }; }));
				if (master) { master.gain.value = masterVol; }
				drawTransport();
				toast('Sessione «' + s.name + '» aperta.');
			};
			if (tracks.length) {
				Ctx.ask({ title: 'Aprire la sessione «' + s.name + '»?', text: 'Quella aperta adesso viene chiusa: se non l\'hai salvata, si perde.', ok: 'Apri' }).then(function (v) { if (v != null) { go(); } });
			} else { go(); }
		}
		function openSessions() {
			State.ready().then(function () {
				var listS = State.data().sessions.slice().sort(function (a, b) { return (b.saved || 0) - (a.saved || 0); });
				Ctx.list({
					title: 'Sessioni salvate',
					text: 'Aprendone una, il mixer ritrova le stesse tracce con i volumi di quando l\'hai salvata.',
					empty: 'Non hai ancora salvato sessioni: usa «Salva» nel mixer.',
					items: listS.map(function (s) {
						var when = s.saved ? new Date(s.saved * 1000).toLocaleDateString('it-IT') : '';
						return {
							label: s.name, sub: s.tracks.length + (s.tracks.length === 1 ? ' traccia' : ' tracce') + (when ? ' · ' + when : ''),
							buttons: [
								{ label: 'Apri', run: function () { loadSession(s); } },
								{
									label: 'Elimina', danger: true, run: function () {
										Ctx.ask({ title: 'Eliminare la sessione «' + s.name + '»?', text: 'I file restano dove sono.', ok: 'Elimina', danger: true }).then(function (v) {
											if (v == null) { return; }
											var arr = State.data().sessions, i = arr.indexOf(s);
											if (i >= 0) { arr.splice(i, 1); State.save(); toast('Sessione eliminata.'); }
										});
									}
								}
							]
						};
					})
				});
			});
		}

		/* ---- disegno ---- */
		function build() {
			elMix.innerHTML =
				'<div class="es-sheet-h"><button class="es-btn" data-a="closemix">⌄ Chiudi</button><b>Sessione di studio <span class="es-sname" id="es-sname"></span></b>' +
				'<span class="es-hbtn"><button class="es-btn small" data-a="savemix" title="Salva questa sessione (tracce, volumi, bilanciamento)">💾 Salva</button>' +
				'<button class="es-btn small" data-a="loadmix" title="Riapri una sessione salvata">📂 Sessioni salvate</button>' +
				'<button class="es-btn small" data-a="endmix">Termina sessione</button></span></div>' +
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
			else if (act === 'savemix') { saveSession(); }
			else if (act === 'loadmix') { openSessions(); }
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

		return { addPaths: addPaths, pause: pause, startSession: startSession, open: open, openSessions: openSessions };
	})();


	/* ------------------------------------------------------------ menu del tasto destro (come Files di Nextcloud) */
	var Ctx = (function () {
		var el = null;
		function close() { if (el) { el.remove(); el = null; } }

		function show(x, y, items) {
			close();
			el = document.createElement('div');
			el.className = 'es-ctx'; el.setAttribute('role', 'menu');
			items.forEach(function (it) {
				if (it === '-') { el.appendChild(document.createElement('hr')); return; }
				var b = document.createElement('button');
				b.type = 'button'; b.setAttribute('role', 'menuitem');
				b.className = it.danger ? 'danger' : '';
				b.innerHTML = '<span class="es-ci">' + it.icon + '</span><span>' + esc(it.label) + '</span>';
				b.addEventListener('click', function (e) { e.stopPropagation(); close(); it.run(); });
				el.appendChild(b);
			});
			root.appendChild(el);
			var r = el.getBoundingClientRect();
			el.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
			el.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
			var first = el.querySelector('button'); if (first) { first.focus(); }
		}

		/* piccola finestra di dialogo dentro la pagina (niente finestre del browser) */
		function ask(o) {
			return new Promise(function (resolve) {
				var d = document.createElement('div');
				d.className = 'es-dlg';
				d.innerHTML = '<div class="es-dbox" role="dialog" aria-modal="true"><h3>' + esc(o.title) + '</h3>' + (o.text ? '<p>' + esc(o.text) + '</p>' : '') +
					(o.input != null ? '<input type="text" class="es-dinput" value="' + esc(o.input) + '" autocomplete="off" spellcheck="false">' : '') +
					'<div class="es-dbtn"><button type="button" class="es-btn" data-d="no">Annulla</button><button type="button" class="es-btn ' + (o.danger ? 'danger' : 'pri') + '" data-d="ok">' + esc(o.ok || 'OK') + '</button></div></div>';
				root.appendChild(d);
				var inp = d.querySelector('input');
				function done(v) { document.removeEventListener('keydown', key, true); d.remove(); resolve(v); }
				function key(e) {
					if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
					else if (e.key === 'Enter' && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); e.stopPropagation(); done(inp ? inp.value : ''); }
					else { e.stopPropagation(); }
				}
				document.addEventListener('keydown', key, true);
				d.addEventListener('click', function (e) {
					var b = e.target.closest('[data-d]');
					if (b) { done(b.getAttribute('data-d') === 'ok' ? (inp ? inp.value : '') : null); }
					else if (e.target === d) { done(null); }
				});
				if (inp) { inp.focus(); var dot = inp.value.lastIndexOf('.'); inp.setSelectionRange(0, o.selectBase && dot > 0 ? dot : inp.value.length); }
				else { d.querySelector('[data-d="ok"]').focus(); }
			});
		}

		/* finestra con un elenco di voci (ognuna con i suoi pulsanti) e, se serve, un campo per crearne una nuova */
		function list(o) {
			return new Promise(function (resolve) {
				var d = document.createElement('div');
				d.className = 'es-dlg';
				var items = o.items || [];
				d.innerHTML = '<div class="es-dbox es-dlist" role="dialog" aria-modal="true"><h3>' + esc(o.title) + '</h3>' + (o.text ? '<p>' + esc(o.text) + '</p>' : '') +
					(items.length ? '<ul class="es-dl">' + items.map(function (it, i) {
						return '<li><span class="es-dl-l"><b>' + esc(it.label) + '</b>' + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</span><span class="es-dl-b">' +
							(it.buttons || []).map(function (b, k) { return '<button type="button" class="es-btn small' + (b.danger ? ' danger' : '') + '" data-i="' + i + '" data-b="' + k + '">' + esc(b.label) + '</button>'; }).join('') + '</span></li>';
					}).join('') + '</ul>' : '<p class="es-empty">' + esc(o.empty || 'Niente da mostrare.') + '</p>') +
					(o.input ? '<div class="es-dnew"><input type="text" class="es-dinput" placeholder="' + esc(o.input.placeholder || '') + '" autocomplete="off" maxlength="120"><button type="button" class="es-btn pri" data-n="1">' + esc(o.input.ok || 'Crea') + '</button></div>' : '') +
					'<div class="es-dbtn"><button type="button" class="es-btn" data-d="no">Chiudi</button></div></div>';
				root.appendChild(d);
				function done() { document.removeEventListener('keydown', key, true); d.remove(); resolve(); }
				function fireNew() { var v = d.querySelector('.es-dinput').value.trim(); if (!v) { return; } done(); o.input.run(v); }
				function key(e) {
					if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); }
					else if (e.key === 'Enter' && o.input && e.target.classList && e.target.classList.contains('es-dinput')) { e.preventDefault(); e.stopPropagation(); fireNew(); }
					else { e.stopPropagation(); }
				}
				document.addEventListener('keydown', key, true);
				d.addEventListener('click', function (e) {
					var b = e.target.closest('[data-b]');
					if (b) { var it = items[parseInt(b.getAttribute('data-i'), 10)], bt = it.buttons[parseInt(b.getAttribute('data-b'), 10)]; done(); bt.run(); return; }
					if (e.target.closest('[data-n]')) { fireNew(); return; }
					if (e.target.closest('[data-d]') || e.target === d) { done(); }
				});
				var inp = d.querySelector('.es-dinput');
				if (inp) { inp.focus(); }
			});
		}

		/* scritture su Nextcloud (WebDAV): servono sessione e intestazioni di sicurezza; l'eliminazione va nel Cestino */
		function dav(method, p, extra) {
			var h = { 'OCS-APIRequest': 'true', 'requesttoken': reqToken() };
			Object.keys(extra || {}).forEach(function (k) { h[k] = extra[k]; });
			return fetch(fileUrl(p), { method: method, credentials: 'same-origin', headers: h }).then(function (r) {
				if (r.status === 412) { throw new Error('Esiste già qualcosa con questo nome.'); }
				if (r.status === 403) { throw new Error('Non hai il permesso di farlo.'); }
				if (r.status === 404) { throw new Error('Non lo trovo più (forse è già stato spostato).'); }
				if (!r.ok) { throw new Error('Nextcloud ha risposto con un errore (' + r.status + ').'); }
				return r;
			});
		}
		function after(removedPath) {
			var cur = Lib.path();
			if (removedPath && (cur === removedPath || cur.indexOf(removedPath + '/') === 0)) { Lib.go(parentOf(removedPath) || '/'); } else { Lib.reload(); }
		}
		function doRename(it, isDir) {
			ask({ title: isDir ? 'Rinomina la cartella' : 'Rinomina il file', text: 'Nuovo nome:', input: it.name, ok: 'Rinomina', selectBase: !isDir }).then(function (v) {
				if (v == null) { return; }
				var nn = v.trim();
				if (!nn || nn === it.name) { return; }
				if (/[\/\\]/.test(nn) || nn === '.' || nn === '..') { toast('Il nome non può contenere / né \\.'); return; }
				var m = /\.[A-Za-z0-9]{1,5}$/.exec(it.name);
				if (!isDir && m && !/\.[A-Za-z0-9]{1,5}$/.test(nn)) { nn += m[0]; }
				var dest = (parentOf(it.path) === '/' ? '' : parentOf(it.path)) + '/' + nn;
				dav('MOVE', it.path, { 'Destination': location.origin + fileUrl(dest), 'Overwrite': 'F' }).then(function () {
					toast('Rinominato in «' + nn + '».');
					if (isDir && Lib.path() === it.path) { Lib.go(dest); } else { Lib.reload(); }
				}).catch(function (e) { toast(e.message); });
			});
		}
		function doDelete(it, isDir) {
			ask({
				title: isDir ? 'Eliminare la cartella «' + it.name + '»?' : 'Eliminare «' + it.name + '»?',
				text: (isDir ? 'Va nel Cestino di Nextcloud con tutto quello che contiene.' : 'Va nel Cestino di Nextcloud.') + ' Si può recuperare da lì.',
				ok: 'Elimina', danger: true
			}).then(function (v) {
				if (v == null) { return; }
				dav('DELETE', it.path).then(function () { toast('«' + it.name + '» è nel Cestino.'); after(isDir ? it.path : ''); }).catch(function (e) { toast(e.message); });
			});
		}
		function download(f) {
			var a = document.createElement('a');
			a.href = fileUrl(f.path); a.download = f.name; a.rel = 'noopener';
			document.body.appendChild(a); a.click(); a.remove();
		}
		function inFiles(dir) { window.open(WEB + '/index.php/apps/files/files?dir=' + encodeURIComponent(dir || '/'), '_blank', 'noopener'); }

		/* voci per un file; ctx dice come riprodurlo (lista e posizione) */
		function fileItems(f, ctx) {
			var base = [
				{ icon: '▶', label: 'Riproduci', run: function () { Player.playList(ctx.list.map(function (x) { return toTrack(x, ctx.album); }), ctx.idx, ctx.cover); } },
				{ icon: '⏭', label: 'Riproduci dopo', run: function () { Player.playNext(toTrack(f, ctx.album)); } },
				{ icon: '🎚', label: 'Aggiungi alla sessione di studio', run: function () { Mixer.addPaths([toTrack(f, ctx.album)]); Mixer.open(); } },
				{ icon: '♫', label: 'Aggiungi a una playlist…', run: function () { Playlists.pick([f]); } },
				'-',
				{ icon: '⬇', label: 'Scarica', run: function () { download(f); } },
				{ icon: '🔗', label: 'Copia link di ascolto', run: function () { shareFile(f.path); } },
				{ icon: '📂', label: 'Mostra in Files', run: function () { inFiles(parentOf(f.path)); } },
				'-',
				{ icon: '✏️', label: 'Rinomina', run: function () { doRename(f, false); } },
				{ icon: '🗑', label: 'Elimina', danger: true, run: function () { doDelete(f, false); } }
			];
			if (ctx.pl) {
				var pl = Playlists.get(ctx.pl);
				base.splice(4, 0, '-',
					{ icon: '−', label: 'Togli dalla playlist', run: function () { Playlists.removeAt(pl, ctx.plIdx); } },
					{ icon: '↑', label: 'Sposta su', run: function () { Playlists.move(pl, ctx.plIdx, -1); } },
					{ icon: '↓', label: 'Sposta giù', run: function () { Playlists.move(pl, ctx.plIdx, 1); } });
			}
			return base;
		}
		function dirItems(d, isRoot) {
			if (isRoot) { return [{ icon: '↗', label: 'Mostra in Files', run: function () { inFiles('/'); } }]; }
			return [
				{ icon: '📂', label: 'Apri', run: function () { Lib.go(d.path); window.scrollTo(0, 0); } },
				{ icon: '🎚', label: 'Sessione di studio', run: function () { Mixer.startSession(d.name, d.path); } },
				{ icon: '♫', label: 'Aggiungi tutto a una playlist…', run: function () { audioIn(d.path, 0).then(function (l) { if (l.length) { Playlists.pick(l.map(function (f) { return toTrack(f); })); } else { toast('In questa cartella non ci sono file audio.'); } }); } },
				{ icon: '📵', label: 'Nascondi o mostra nelle app del telefono', run: function () { Phone.toggleHidden(d); } },
				{ icon: '↗', label: 'Mostra in Files', run: function () { inFiles(d.path); } },
				'-',
				{ icon: '✏️', label: 'Rinomina', run: function () { doRename(d, true); } },
				{ icon: '🗑', label: 'Elimina cartella', danger: true, run: function () { doDelete(d, true); } }
			];
		}
		function openRow(row, x, y) {
			var info = Lib.rowInfo(row.getAttribute('data-g'), parseInt(row.getAttribute('data-i'), 10));
			if (info) { show(x, y, fileItems(info.f, info)); }
		}
		function openCard(card, x, y) {
			var p = card.getAttribute('data-dir');
			show(x, y, dirItems({ path: p, name: lastName(p) }, false));
		}
		function openCurrentTrack(x, y) {
			var t = Player.current();
			if (!t) { return; }
			var f = { path: t.path, name: t.name, size: 0 };
			show(x, y, fileItems(f, { list: [f], idx: 0, album: t.album, cover: '' }).slice(1));
		}

		/* tasto destro */
		root.addEventListener('contextmenu', function (e) {
			if (e.target.closest('.es-ctx, .es-dlg, input, textarea')) { return; }
			var row = e.target.closest('.es-trk'), card = e.target.closest('.es-card-album[data-dir]'), pcard = e.target.closest('.es-card-album[data-pl]');
			if (row) { e.preventDefault(); openRow(row, e.clientX, e.clientY); }
			else if (card) { e.preventDefault(); openCard(card, e.clientX, e.clientY); }
			else if (pcard) { var pp = Playlists.get(pcard.getAttribute('data-pl')); if (pp) { e.preventDefault(); show(e.clientX, e.clientY, Playlists.items(pp)); } }
			else if (e.target.closest('.es-mini-info, .es-np-main .es-art')) { e.preventDefault(); openCurrentTrack(e.clientX, e.clientY); }
		});
		/* pulsante con i tre puntini */
		root.addEventListener('click', function (e) {
			var b = e.target.closest('[data-a="menu"], [data-a="amenu"]');
			if (!b) { return; }
			e.stopPropagation();
			var r = b.getBoundingClientRect();
			if (b.getAttribute('data-a') === 'menu') { openRow(b.closest('.es-trk') || b, r.left, r.bottom + 4); }
			else { var p = Lib.path(); show(r.left, r.bottom + 4, dirItems({ path: p, name: lastName(p) || 'Tutti i file' }, p === '/')); }
		}, true);
		/* pressione lunga sul telefono */
		var lp = 0, lpFired = false, lpX = 0, lpY = 0;
		root.addEventListener('pointerdown', function (e) {
			if (e.pointerType !== 'touch' || e.target.closest('button, .es-ctx, .es-dlg')) { return; }
			var t = e.target.closest('.es-trk, .es-card-album[data-dir]');
			if (!t) { return; }
			lpX = e.clientX; lpY = e.clientY; lpFired = false;
			clearTimeout(lp);
			lp = setTimeout(function () {
				lpFired = true;
				if (t.classList.contains('es-trk')) { openRow(t, lpX, lpY); } else { openCard(t, lpX, lpY); }
				if (navigator.vibrate) { try { navigator.vibrate(15); } catch (er) { /* niente */ } }
			}, 550);
		});
		root.addEventListener('pointermove', function (e) { if (lp && (Math.abs(e.clientX - lpX) > 10 || Math.abs(e.clientY - lpY) > 10)) { clearTimeout(lp); lp = 0; } });
		['pointerup', 'pointercancel'].forEach(function (n) { root.addEventListener(n, function () { clearTimeout(lp); lp = 0; }, true); });
		document.addEventListener('scroll', function () { clearTimeout(lp); lp = 0; close(); }, true);
		root.addEventListener('click', function (e) { if (lpFired) { lpFired = false; e.stopPropagation(); e.preventDefault(); } }, true);

		/* chiusura */
		document.addEventListener('pointerdown', function (e) { if (el && !e.target.closest('.es-ctx')) { close(); } }, true);
		window.addEventListener('resize', close);
		document.addEventListener('keydown', function (e) {
			if (!el) { return; }
			if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault(); e.stopPropagation();
				var bs = [].slice.call(el.querySelectorAll('button')), i = bs.indexOf(document.activeElement);
				bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus();
			}
		}, true);
		return { close: close, ask: ask, show: show, list: list };
	})();


	/* ------------------------------------------------------------ playlist (per utente, riferimenti ai file) */
	var Playlists = (function () {
		function all() { return State.data().playlists; }
		function get(id) { return all().filter(function (p) { return p.id === id; })[0] || null; }
		function norm(tr) {
			return tr.filter(function (t) { return t && t.path; }).map(function (t) { return { path: t.path, name: t.name || lastName(t.path) }; });
		}
		function changed() { if (Lib.view() !== 'files') { Lib.draw(); } }
		function plural(n) { return n + (n === 1 ? ' brano' : ' brani'); }
		function create(name, tracks) {
			var p = { id: State.newId(), name: name, created: Math.floor(Date.now() / 1000), tracks: norm(tracks || []) };
			all().push(p); State.save(); changed();
			return p;
		}
		function addTo(p, tracks) {
			var have = {};
			p.tracks.forEach(function (t) { have[t.path] = 1; });
			var add = norm(tracks).filter(function (t) { return !have[t.path]; });
			p.tracks = p.tracks.concat(add);
			State.save(); changed();
			toast(add.length ? 'Aggiunto a «' + p.name + '»: ' + plural(add.length) + '.' : 'Era già nella playlist «' + p.name + '».');
		}
		/* sceglie la playlist a cui aggiungere questi brani (o ne crea una nuova) */
		function pick(tracks) {
			State.ready().then(function () {
				Ctx.list({
					title: 'Aggiungi a una playlist',
					text: tracks.length === 1 ? '«' + baseName(tracks[0].name) + '»' : plural(tracks.length),
					empty: 'Non hai ancora playlist: creane una qui sotto.',
					items: all().map(function (p) {
						return { label: p.name, sub: plural(p.tracks.length), buttons: [{ label: 'Aggiungi', run: function () { addTo(p, tracks); } }] };
					}),
					input: { placeholder: 'Nuova playlist…', ok: 'Crea e aggiungi', run: function (name) { var p = create(name, tracks); toast('Playlist «' + p.name + '» creata con ' + plural(p.tracks.length) + '.'); } }
				});
			});
		}
		function newOne() {
			Ctx.ask({ title: 'Nuova playlist', text: 'Come la chiami?', input: '', ok: 'Crea' }).then(function (v) {
				if (v == null || !v.trim()) { return; }
				var p = create(v.trim().slice(0, 120), []);
				Lib.openPlaylist(p.id);
			});
		}
		function rename(p) {
			Ctx.ask({ title: 'Rinomina la playlist', text: 'Nuovo nome:', input: p.name, ok: 'Rinomina' }).then(function (v) {
				if (v == null || !v.trim() || v.trim() === p.name) { return; }
				p.name = v.trim().slice(0, 120); State.save(); changed();
			});
		}
		function remove(p) {
			Ctx.ask({ title: 'Eliminare la playlist «' + p.name + '»?', text: 'I brani restano dove sono: si toglie solo la lista.', ok: 'Elimina', danger: true }).then(function (v) {
				if (v == null) { return; }
				var i = all().indexOf(p);
				if (i >= 0) { all().splice(i, 1); }
				State.save();
				if (Lib.view() === 'pl:' + p.id) { Lib.showPlaylists(); } else { changed(); }
				toast('Playlist eliminata.');
			});
		}
		function removeAt(p, i) {
			if (!p || i < 0 || i >= p.tracks.length) { return; }
			p.tracks.splice(i, 1); State.save(); changed();
		}
		function move(p, i, d) {
			var j = i + d;
			if (!p || i < 0 || j < 0 || i >= p.tracks.length || j >= p.tracks.length) { return; }
			var t = p.tracks.splice(i, 1)[0]; p.tracks.splice(j, 0, t);
			State.save(); changed();
		}
		function items(p) {
			return [
				{ icon: '✏️', label: 'Rinomina', run: function () { rename(p); } },
				{ icon: '🗑', label: 'Elimina la playlist', danger: true, run: function () { remove(p); } }
			];
		}
		return { all: all, get: get, create: create, addTo: addTo, pick: pick, newOne: newOne, rename: rename, remove: remove, removeAt: removeAt, move: move, items: items };
	})();

	/* ------------------------------------------------------------ telefono: Subsonic e Ampache (li fornisce l'app Music di Nextcloud) */
	var Phone = (function () {
		var MUSIC = WEB + '/apps/music/api/settings';
		function call(method, url, body) {
			var h = { 'OCS-APIRequest': 'true', 'Accept': 'application/json', 'requesttoken': reqToken() };
			var o = { method: method, credentials: 'same-origin', headers: h };
			if (body) { h['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
			return fetch(url, o).then(function (r) {
				if (!r.ok) { throw new Error('music ' + r.status); }
				return r.json();
			});
		}
		function noMusic() { toast('Non riesco a raggiungere l\'app Music di Nextcloud: serve per Subsonic e Ampache. Chi gestisce Nextcloud deve attivarla.'); }

		/* nasconde (o rimette) una cartella nelle app del telefono: Music la salta quando indicizza */
		function toggleHidden(d) {
			call('GET', MUSIC).then(function (s) {
				var ex = (s.excludedPaths || []).slice(), i = ex.indexOf(d.path);
				if (i >= 0) { ex.splice(i, 1); } else { ex.push(d.path); }
				return call('POST', MUSIC + '/user/exclude_paths', { value: ex }).then(function () {
					toast(i >= 0 ? '«' + d.name + '» tornerà visibile nelle app del telefono (dopo la prossima scansione di Music).'
						: '«' + d.name + '» non comparirà più nelle app del telefono (dopo la prossima scansione di Music).');
				});
			}).catch(noMusic);
		}

		function kv(label, value) {
			return '<div class="es-kv"><span>' + esc(label) + '</span><code>' + esc(value) + '</code><button type="button" class="es-btn small" data-copy="' + esc(value) + '">Copia</button></div>';
		}
		function keyRow(k) {
			return '<li data-key="' + esc(k.id) + '"><span class="es-dl-l"><b>' + esc(k.description || 'Senza nome') + '</b></span><span class="es-dl-b"><button type="button" class="es-btn small danger" data-revoke="' + esc(k.id) + '">Revoca</button></span></li>';
		}
		function show(s) {
			var d = document.createElement('div');
			d.className = 'es-dlg';
			var keys = Array.isArray(s.ampacheKeys) ? s.ampacheKeys : [];
			d.innerHTML = '<div class="es-dbox es-dphone" role="dialog" aria-modal="true"><h3>📱 Ascolta dal telefono</h3>' +
				'<p>Usa un\'app musicale che parla <b>Subsonic</b> o <b>Ampache</b> (per esempio Symfonium, Substreamer, Amperfy, DSub, Ultrasonic). Nell\'app scrivi:</p>' +
				kv('Indirizzo Subsonic', s.subsonicUrl || '') + kv('Indirizzo Ampache', s.ampacheUrl || '') + kv('Utente', s.user || UID) +
				'<p>Come password serve una <b>chiave</b>, non la password di Nextcloud. La crei qui e la puoi revocare quando vuoi.</p>' +
				'<ul class="es-dl" id="es-keys">' + (keys.length ? keys.map(keyRow).join('') : '') + '</ul>' + (keys.length ? '' : '<p class="es-empty" id="es-nokeys">Non hai ancora chiavi.</p>') +
				'<div class="es-dnew"><input type="text" class="es-dinput" id="es-keydesc" placeholder="Nome della chiave (es. il mio telefono)" maxlength="60" autocomplete="off"><button type="button" class="es-btn pri" data-newkey="1">Crea chiave</button></div>' +
				'<div id="es-keyshow"></div>' +
				'<p class="es-hint">Il telefono vede la libreria dell\'app Music. Se mancano dei brani, in Music premi «Riscansiona». Le cartelle delle tracce separate (Batteria, Chitarre…) si nascondono dal telefono col tasto destro sulla cartella → «Nascondi o mostra nelle app del telefono».</p>' +
				'<div class="es-dbtn"><button type="button" class="es-btn" data-d="no">Chiudi</button></div></div>';
			root.appendChild(d);
			function done() { document.removeEventListener('keydown', key, true); d.remove(); }
			function key(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); } else { e.stopPropagation(); } }
			document.addEventListener('keydown', key, true);
			d.addEventListener('click', function (e) {
				var c = e.target.closest('[data-copy]');
				if (c) {
					var v = c.getAttribute('data-copy');
					(navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(v).then(function () { return true; }, function () { return false; }) : Promise.resolve(false))
						.then(function (okc) { toast(okc ? 'Copiato.' : 'Non riesco a copiare da solo: selezionalo e copialo a mano.'); });
					return;
				}
				var r = e.target.closest('[data-revoke]');
				if (r) {
					var id = r.getAttribute('data-revoke');
					call('DELETE', MUSIC + '/user/keys/' + encodeURIComponent(id)).then(function () {
						var li = d.querySelector('li[data-key="' + id.replace(/"/g, '') + '"]'); if (li) { li.remove(); }
						toast('Chiave revocata: l\'app che la usava non entra più.');
					}).catch(function () { toast('Non sono riuscito a revocare la chiave.'); });
					return;
				}
				if (e.target.closest('[data-newkey]')) {
					var desc = d.querySelector('#es-keydesc').value.trim() || 'Telefono';
					call('POST', MUSIC + '/user/keys', { description: desc, length: 20 }).then(function (k) {
						var box = d.querySelector('#es-keyshow');
						box.innerHTML = '<div class="es-newkey"><b>Chiave creata. Copiala adesso: non la rivedrai.</b>' + kv('Password per l\'app', k.password) + '</div>';
						var nk = d.querySelector('#es-nokeys'); if (nk) { nk.remove(); }
						d.querySelector('#es-keys').insertAdjacentHTML('beforeend', keyRow({ id: k.id, description: desc }));
						d.querySelector('#es-keydesc').value = '';
					}).catch(function () { toast('Non sono riuscito a creare la chiave.'); });
					return;
				}
				if (e.target.closest('[data-d]') || e.target === d) { done(); }
			});
		}
		function open() { call('GET', MUSIC).then(show).catch(noMusic); }
		return { open: open, toggleHidden: toggleHidden };
	})();

	/* aperto dentro la pagina dei File (finestra sovrapposta): nasconde la barra di Nextcloud e passa Esc alla pagina che lo contiene */
	if (window.top !== window.self && /[?&]embed=1/.test(location.search)) {
		document.documentElement.classList.add('es-embed');
		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' && !e.defaultPrevented && !root.querySelector('.es-ctx, .es-dlg, #es-mixer:not(.es-hide), #es-np:not(.es-hide)')) { try { window.parent.postMessage('edithstudio-close', window.location.origin); } catch (er) { /* niente */ } }
		});
	}

	/* ------------------------------------------------------------ avvio */
	State.load();
	var deep = /[?&]play=([^&]+)/.exec(location.search);
	if (deep) { try { Lib.openFile(decodeURIComponent(deep[1])); } catch (e) { Lib.start(); } } else { Lib.start(); }
})();
