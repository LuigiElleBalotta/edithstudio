<?php
/** @var array $_ */
?>
<div id="edithstudio-public"
	data-token="<?php p($_['token']); ?>"
	data-name="<?php p($_['name']); ?>"
	data-size="<?php p((string)$_['size']); ?>"
	data-hide-download="<?php p($_['hideDownload'] ? '1' : '0'); ?>"
	data-webroot="<?php p($_['webroot']); ?>">
	<noscript>EDITH Studio ha bisogno di JavaScript per suonare.</noscript>
</div>
