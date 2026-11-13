<?php

declare(strict_types=1);

namespace OCA\EdithStudio\Controller;

use OCA\EdithStudio\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\IAppData;
use OCP\Files\NotFoundException;
use OCP\Files\SimpleFS\ISimpleFolder;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * Playlist e sessioni del mixer di OGNI utente.
 *
 * Si salvano solo riferimenti (percorso, nome, volumi...), mai file: l'accesso ai file resta quello di Nextcloud,
 * quindi una playlist che punta a un file che l'utente non vede semplicemente non funziona.
 * Ogni utente legge e scrive solo il proprio stato; tutto quello che arriva viene ripulito e limitato.
 */
class ApiController extends Controller {
	private const MAX_PLAYLISTS = 300;
	private const MAX_TRACKS = 3000;
	private const MAX_SESSIONS = 200;
	private const MAX_MIX_TRACKS = 32;

	public function __construct(
		IRequest $request,
		private IUserSession $userSession,
		private IAppData $appData,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	public function get(): JSONResponse {
		$uid = $this->uid();
		if ($uid === '') {
			return new JSONResponse(['message' => 'non autenticato'], Http::STATUS_UNAUTHORIZED);
		}
		return new JSONResponse($this->read($uid));
	}

	#[NoAdminRequired]
	public function put(array $playlists = [], array $sessions = []): JSONResponse {
		$uid = $this->uid();
		if ($uid === '') {
			return new JSONResponse(['message' => 'non autenticato'], Http::STATUS_UNAUTHORIZED);
		}
		$state = [
			'playlists' => $this->cleanPlaylists($playlists),
			'sessions' => $this->cleanSessions($sessions),
		];
		$json = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		if ($json === false || strlen($json) > 2 * 1024 * 1024) {
			return new JSONResponse(['message' => 'troppi dati'], Http::STATUS_REQUEST_ENTITY_TOO_LARGE);
		}
		$folder = $this->folder();
		$name = $this->fileName($uid);
		try {
			$folder->getFile($name)->putContent($json);
		} catch (NotFoundException $e) {
			$folder->newFile($name, $json);
		}
		return new JSONResponse($state);
	}

	private function uid(): string {
		$u = $this->userSession->getUser();
		return $u ? $u->getUID() : '';
	}

	private function fileName(string $uid): string {
		return 'u-' . hash('sha256', $uid) . '.json';
	}

	private function folder(): ISimpleFolder {
		try {
			return $this->appData->getFolder('state');
		} catch (NotFoundException $e) {
			return $this->appData->newFolder('state');
		}
	}

	private function read(string $uid): array {
		try {
			$raw = $this->folder()->getFile($this->fileName($uid))->getContent();
			$d = json_decode($raw, true);
			if (is_array($d)) {
				return ['playlists' => array_values($d['playlists'] ?? []), 'sessions' => array_values($d['sessions'] ?? [])];
			}
		} catch (NotFoundException $e) {
			// primo accesso: nessuno stato salvato
		}
		return ['playlists' => [], 'sessions' => []];
	}

	private function str($v, int $max): string {
		$s = is_string($v) ? $v : '';
		$s = preg_replace('/[\x00-\x1F\x7F]/u', '', $s) ?? '';
		return mb_substr($s, 0, $max);
	}

	private function id($v): string {
		$s = is_string($v) ? $v : '';
		return preg_match('/^[A-Za-z0-9_-]{1,40}$/', $s) ? $s : bin2hex(random_bytes(8));
	}

	private function num($v, float $min, float $max, float $default): float {
		if (!is_numeric($v)) {
			return $default;
		}
		return max($min, min($max, (float)$v));
	}

	private function cleanPath($v): ?string {
		$p = $this->str($v, 1024);
		// niente salti di cartella: sono solo riferimenti che il browser userà con i permessi dell'utente
		if ($p === '' || $p[0] !== '/' || str_contains($p, '/../') || str_ends_with($p, '/..')) {
			return null;
		}
		return $p;
	}

	private function cleanPlaylists(array $in): array {
		$out = [];
		foreach (array_slice($in, 0, self::MAX_PLAYLISTS) as $pl) {
			if (!is_array($pl)) {
				continue;
			}
			$tracks = [];
			foreach (array_slice(is_array($pl['tracks'] ?? null) ? $pl['tracks'] : [], 0, self::MAX_TRACKS) as $t) {
				$path = is_array($t) ? $this->cleanPath($t['path'] ?? null) : null;
				if ($path !== null) {
					$tracks[] = ['path' => $path, 'name' => $this->str($t['name'] ?? basename($path), 255)];
				}
			}
			$name = $this->str($pl['name'] ?? '', 120);
			$out[] = [
				'id' => $this->id($pl['id'] ?? ''),
				'name' => $name !== '' ? $name : 'Playlist',
				'created' => (int)$this->num($pl['created'] ?? 0, 0, 4102444800, 0),
				'tracks' => $tracks,
			];
		}
		return $out;
	}

	private function cleanSessions(array $in): array {
		$out = [];
		foreach (array_slice($in, 0, self::MAX_SESSIONS) as $s) {
			if (!is_array($s)) {
				continue;
			}
			$tracks = [];
			foreach (array_slice(is_array($s['tracks'] ?? null) ? $s['tracks'] : [], 0, self::MAX_MIX_TRACKS) as $t) {
				$path = is_array($t) ? $this->cleanPath($t['path'] ?? null) : null;
				if ($path === null) {
					continue;
				}
				$tracks[] = [
					'path' => $path,
					'name' => $this->str($t['name'] ?? basename($path), 255),
					'vol' => $this->num($t['vol'] ?? 1, 0, 1.5, 1),
					'pan' => $this->num($t['pan'] ?? 0, -1, 1, 0),
					'mute' => (bool)($t['mute'] ?? false),
					'solo' => (bool)($t['solo'] ?? false),
					'offset' => $this->num($t['offset'] ?? 0, 0, 3600, 0),
				];
			}
			$name = $this->str($s['name'] ?? '', 120);
			$out[] = [
				'id' => $this->id($s['id'] ?? ''),
				'name' => $name !== '' ? $name : 'Sessione',
				'saved' => (int)$this->num($s['saved'] ?? 0, 0, 4102444800, 0),
				'master' => $this->num($s['master'] ?? 1, 0, 1.2, 1),
				'loop' => (bool)($s['loop'] ?? false),
				'tracks' => $tracks,
			];
		}
		return $out;
	}
}
