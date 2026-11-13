# EDITH Studio (app per Nextcloud)

Lettore musicale e **mixer multitraccia** per studiare i brani della band, con la grafica di E.D.I.T.H. Legge direttamente le cartelle di Nextcloud: carichi un file e lo vedi, senza scansioni.

- **Libreria:** naviga le cartelle (una cartella per brano, con il mix completo e sottocartelle come «Batteria» o «Chitarre»), ascolta, coda, avanti/indietro, comandi sul telefono (Media Session).
- **Mixer:** porta nel mixer le tracce (anche tutta una canzone con le sottocartelle), volume, pan, mute, solo, sposta una traccia nel tempo trascinando l'onda, cursore, ripeti, ordine delle corsie. Si possono aggiungere anche file dal proprio computer.
- **Telefono:** l'interfaccia è adattiva. Il mixer decodifica le tracce in memoria: sul telefono conviene «Risparmia memoria (mono)».
- **Privacy:** tutto passa dal WebDAV di Nextcloud con la sessione dell'utente. L'app vede solo ciò che l'utente può già vedere; nessun file passa dal server PHP dell'app.

Nessun Node, nessuna build: PHP minimo + un file JavaScript + un CSS.

## Installazione
Copia la cartella in `custom_apps/edithstudio` e abilita l'app (`occ app:enable edithstudio`, anche solo per un gruppo con `--groups=`).

## Da fare
- Interfaccia Subsonic e Ampache (per le app musicali sul telefono).
- Tag e copertine, playlist, salvataggio delle sessioni del mixer.

Licenza: AGPL-3.0-or-later.
