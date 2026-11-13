<?php

declare(strict_types=1);

namespace OCA\EdithStudio\AppInfo;

use OCA\EdithStudio\Listener\LoadFilesScriptsListener;
use OCA\EdithStudio\Share\AudioShareProvider;
use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

class Application extends App implements IBootstrap {
	public const APP_ID = 'edithstudio';

	public function __construct() {
		parent::__construct(self::APP_ID);
	}

	public function register(IRegistrationContext $context): void {
		// Un link di condivisione normale di Nextcloud (/s/<codice>) che punta a UN file audio si apre su EDITH Studio,
		// in modalita' "solo ascolto". Password, scadenza e permessi restano quelli della condivisione di Nextcloud.
		$context->registerPublicShareTemplateProvider(AudioShareProvider::class);
		// Nell'app File: clic su un file audio = apri nel player di EDITH Studio.
		$context->registerEventListener(LoadAdditionalScriptsEvent::class, LoadFilesScriptsListener::class);
	}

	public function boot(IBootContext $context): void {
	}
}
