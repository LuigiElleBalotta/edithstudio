<?php

declare(strict_types=1);

return [
	'routes' => [
		['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
		// Playlist e sessioni del mixer di ciascun utente (solo suoi, solo riferimenti ai file: nessun file passa da qui).
		['name' => 'api#get', 'url' => '/api/state', 'verb' => 'GET'],
		['name' => 'api#put', 'url' => '/api/state', 'verb' => 'PUT'],
	],
];
