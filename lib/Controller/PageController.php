<?php

declare(strict_types=1);

namespace OCA\EdithStudio\Controller;

use OCA\EdithStudio\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
use OCP\IUserSession;
use OCP\Util;

/**
 * Una sola pagina: tutto il resto (elenco cartelle, ascolto, mixer) lo fa il browser parlando con il WebDAV di Nextcloud
 * con la sessione dell'utente. Quindi l'app vede SOLO ciò che l'utente può già vedere, e nessun file passa da qui.
 */
class PageController extends Controller {
	public function __construct(IRequest $request, private IUserSession $userSession) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function index(): TemplateResponse {
		Util::addStyle(Application::APP_ID, 'studio');
		Util::addScript(Application::APP_ID, 'studio');
		$user = $this->userSession->getUser();
		return new TemplateResponse(Application::APP_ID, 'main', [
			'uid' => $user ? $user->getUID() : '',
			'webroot' => \OC::$WEBROOT,
		]);
	}
}
