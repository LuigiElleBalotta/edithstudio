/* EDITH Studio nell'app File: un clic su un file audio lo apre nel player di EDITH (al posto di altri lettori).
   Si registra come azione predefinita con priorita' piu' alta (numero piu' basso) di quella di Music (-1).
   Nessuna dipendenza: usa il registro delle azioni di Files (window._nc_fileactions). */
(function () {
	'use strict';
	var EXT = ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'weba'];
	var ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>';

	function isAudio(node) {
		if (!node || node.type !== 'file') { return false; }
		var mime = String(node.mime || '');
		if (mime.indexOf('audio/') === 0) { return true; }
		var m = /\.([A-Za-z0-9]+)$/.exec(String(node.basename || node.path || ''));
		return !!m && EXT.indexOf(m[1].toLowerCase()) >= 0;
	}
	function loggedIn() {
		try { return !!(window.OC && window.OC.getCurrentUser && window.OC.getCurrentUser().uid); } catch (e) { return false; }
	}
	function firstNode(a) {
		/* le versioni nuove di Files passano un oggetto {nodes, ...}, le vecchie un elenco di nodi */
		if (a && a.nodes) { return a.nodes.length === 1 ? a.nodes[0] : null; }
		if (Array.isArray(a)) { return a.length === 1 ? a[0] : null; }
		return a || null;
	}
	function urlFor(node) {
		var web = (window.OC && window.OC.webroot) || '';
		return web + '/apps/edithstudio/?play=' + encodeURIComponent(node.path);
	}

	window._nc_fileactions = window._nc_fileactions || [];
	if (window._nc_fileactions.some(function (x) { return x.id === 'edithstudio-open'; })) { return; }
	window._nc_fileactions.push({
		id: 'edithstudio-open',
		displayName: function () { return 'Apri con EDITH Studio'; },
		title: function () { return 'Apri questo brano nel player di EDITH Studio'; },
		iconSvgInline: function () { return ICON; },
		default: 'default',
		order: -100,
		inline: function () { return false; },
		enabled: function (a) { return loggedIn() && isAudio(firstNode(a)); },
		exec: function (a) {
			var node = a && a.nodes ? a.nodes[0] : (Array.isArray(a) ? a[0] : a);
			if (node && node.path) { window.location.href = urlFor(node); }
			return Promise.resolve(null);
		}
	});
})();
