<?php

declare(strict_types=1);

namespace OCA\EdithStudio\Share;

use OCA\EdithStudio\AppInfo\Application;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\Files\File;
use OCP\Share\IPublicShareTemplateProvider;
use OCP\Share\IShare;
use OCP\Util;

/**
 * Pagina pubblica di EDITH Studio per i link di condivisione di UN solo file audio.
 *
 * Nextcloud chiama questa classe solo DOPO aver controllato codice, scadenza e password della condivisione.
 * La pagina non ha elenco cartelle e non sa nulla del resto: riceve solo nome, tipo e dimensione di quel file
 * e lo suona dall'indirizzo pubblico della condivisione (public.php/dav/files/<codice>).
 * Cartelle condivise e file non audio restano sulla pagina standard di Nextcloud.
 */
class AudioShareProvider implements IPublicShareTemplateProvider {
	private const EXT = ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'weba'];

	public function shouldRespond(IShare $share): bool {
		if (!in_array($share->getShareType(), [IShare::TYPE_LINK, IShare::TYPE_EMAIL], true)) {
			return false;
		}
		try {
			$node = $share->getNode();
		} catch (\Throwable $e) {
			return false;
		}
		if (!($node instanceof File)) {
			return false;
		}
		$ext = strtolower(pathinfo($node->getName(), PATHINFO_EXTENSION));
		return str_starts_with((string)$node->getMimeType(), 'audio/') || in_array($ext, self::EXT, true);
	}

	public function renderPage(IShare $share, string $token, string $path): TemplateResponse {
		$node = $share->getNode();
		Util::addStyle(Application::APP_ID, 'public');
		Util::addScript(Application::APP_ID, 'public');
		return new TemplateResponse(Application::APP_ID, 'public', [
			'token' => $token,
			'name' => $node->getName(),
			'size' => (int)$node->getSize(),
			'hideDownload' => $share->getHideDownload(),
			'webroot' => \OC::$WEBROOT,
		], TemplateResponse::RENDER_AS_BASE);
	}
}
