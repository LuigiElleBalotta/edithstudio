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

## Condivisione (solo ascolto)

Un link di condivisione normale di Nextcloud (`/s/<codice>`) che punta a **un solo file audio** si apre su EDITH Studio:
un player pulito con copertina, barra e volume. Chi lo apre senza account **non vede cartelle e non può navigare**.
Password, scadenza e permessi restano quelli della condivisione di Nextcloud. Le cartelle condivise e i file non audio
restano sulla pagina standard di Nextcloud.

Il link si crea da Files (Condividi) oppure da Studio col pulsante 🔗 (crea o riusa un link di sola lettura).

**Proxy:** perché si possa saltare avanti nei brani lunghi, il proxy davanti a Nextcloud deve lasciar passare le richieste
parziali (`Range`). Con nginx: niente `proxy_cache` sul sito di Nextcloud (`proxy_cache off;` nel blocco `location`).

## Tastiera

Player: Spazio play/pausa, ← → ±5 s (Maiusc ±30), J/L ±10 s, ↑ ↓ volume, M muto, N/P brano dopo/prima, S casuale,
R ripeti, Q coda, 0-9 salta, Invio schermo intero, Esc chiude, ? aiuto.
Mixer: Spazio, ← → ±5 s (Maiusc ±15), J −10 s, Home/End, L ripeti, 1-9 muta traccia (Maiusc = solo), Esc.

## Menu del tasto destro

Su file e cartelle (e col pulsante ⋯, o pressione lunga sul telefono): Riproduci, Riproduci dopo, Aggiungi alla sessione
di studio, Scarica, Copia link di ascolto, Mostra in Files, Rinomina, Elimina. L'eliminazione va nel **Cestino** di
Nextcloud e chiede sempre conferma.

## Apri dai File

Nell'app File un clic su un file audio lo apre nel player di EDITH Studio (azione predefinita, priorita' piu' alta di quella di Music). Resta nel menu anche come "Apri con EDITH Studio".

Nota: dai File lo Studio si apre in una finestra sopra la pagina (iframe con `?embed=1`), cosi' il clic vale anche per l'audio e il brano parte da solo; `Esc` o "Chiudi" tornano ai file, "↗" apre la pagina intera.

## Licenza

GNU AGPL-3.0 (vedi `LICENSE`), come richiesto per le app Nextcloud. Copyright (c) 2026 Luigi Balotta.

## Tag e copertine

Titolo, artista, album e copertina si leggono **dentro ai file** (MP3 con ID3 v2.2/2.3/2.4 e FLAC con commenti Vorbis e immagine).
Si scarica solo l'inizio del file, mai il brano intero (serve il supporto alle richieste parziali, vedi sopra). Se la cartella
ha `cover.jpg` (o `folder`, `front`, `copertina`...) vince quella; altrimenti si usa la copertina del primo brano. Senza tag
resta il nome del file. In sola lettura: i file non vengono mai modificati.

## Playlist

Per ogni utente: «♫ Playlist» in alto, tasto destro su un brano o su una cartella → «Aggiungi a una playlist…». Si possono
rinominare, riordinare e togliere brani. Una playlist contiene solo riferimenti ai file: chi non vede un file, non lo sente.
I dati stanno nella cartella dati dell'app (`appdata`), uno per utente, non in `Files`.

## Sessioni del mixer salvate

«💾 Salva» nel mixer registra tracce, volumi, bilanciamento, mute/solo, spostamenti, master e ripeti; «🎚 Sessioni» in alto
(o «📂 Sessioni salvate» nel mixer) le riapre. Le tracce caricate dal proprio computer non si possono salvare.

## Dal telefono: Subsonic e Ampache

I due protocolli li fornisce l'app **Music** di Nextcloud (da attivare). «📱 Telefono» mostra gli indirizzi, l'utente e permette
di creare e revocare le **chiavi** da usare come password nelle app (Symfonium, Substreamer, Amperfy, DSub, Ultrasonic...).
Col tasto destro su una cartella → «Nascondi o mostra nelle app del telefono» si escludono dalla libreria di Music le
cartelle delle tracce separate (Batteria, Chitarre...). Music riscansiona da solo; se mancano brani, «Riscansiona» in Music.

## Sviluppo

- `.github/workflows/ci.yml`: sintassi PHP e JavaScript, `info.xml` contro lo schema ufficiale di Nextcloud, nessun segreto/IP/email
  (`python3 scripts/check_privacy.py`). Le azioni sono fissate a una versione precisa; Dependabot le aggiorna.
- `.github/workflows/release.yml`: con un tag `vX.Y.Z` uguale alla versione di `appinfo/info.xml` costruisce il pacchetto
  `edithstudio-X.Y.Z.tar.gz` (con somma di controllo) e crea la release.
- Installazione manuale: scompatta in `custom_apps/edithstudio`, poi `occ app:enable edithstudio`.
