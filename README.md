# EDITH Studio (app per Nextcloud)

Lettore musicale e **mixer multitraccia** per studiare i brani della band, con la grafica di E.D.I.T.H. Legge direttamente le cartelle di Nextcloud: carichi un file e lo vedi, senza scansioni.

- **Player (stile libreria musicale):** le cartelle sono album con copertina (`cover.jpg` nella cartella, oppure un disegno generato), pagina del brano con il mix completo e le tracce separate (Batteria, Chitarre…), mini-player in basso, schermata «In riproduzione» con coda, casuale, ripeti, comandi sul telefono (Media Session). Link diretto: `/apps/edithstudio/?play=/Musica/brano.mp3`.
- **Sessione di studio (mixer):** non è sempre aperto: si avvia da un brano («Sessione di studio» / «Studia questo brano»). Porta nel mixer tutte le tracce del brano, con volume, pan, mute, solo, spostamento nel tempo trascinando l'onda, cursore, ripeti e ordine delle corsie. Si possono aggiungere anche file dal proprio computer.
- **Telefono:** l'interfaccia è adattiva. Il mixer decodifica le tracce in memoria: sul telefono conviene «Risparmia memoria (mono)».
- **Privacy:** tutto passa dal WebDAV di Nextcloud con la sessione dell'utente. L'app vede solo ciò che l'utente può già vedere; nessun file passa dal server PHP dell'app.

Nessun Node, nessuna build: PHP minimo + un file JavaScript + un CSS.

## Installazione
Copia la cartella in `custom_apps/edithstudio` e abilita l'app (`occ app:enable edithstudio`, anche solo per un gruppo con `--groups=`).

## Da fare
- Interfaccia Subsonic e Ampache (per le app musicali sul telefono).
- Tag e copertine, playlist, salvataggio delle sessioni del mixer.

Licenza: AGPL-3.0-or-later.
