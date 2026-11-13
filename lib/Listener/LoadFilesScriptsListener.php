<?php

declare(strict_types=1);

namespace OCA\EdithStudio\Listener;

use OCA\EdithStudio\AppInfo\Application;
use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * Nell'app File carica lo script che aggiunge l'azione "Apri con EDITH Studio" sui file audio
 * (e la rende l'azione predefinita al clic).
 *
 * @template-implements IEventListener<Event>
 */
class LoadFilesScriptsListener implements IEventListener {
	public function handle(Event $event): void {
		if (!($event instanceof LoadAdditionalScriptsEvent)) {
			return;
		}
		Util::addInitScript(Application::APP_ID, 'files-open');
	}
}
