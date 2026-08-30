# JVGH Kantineplanning PWA

## Publicatie

Publiceer alle bestanden met behoud van de directorystructuur onder
`/wp-content/uploads/kantinedienst/`. De serviceworker krijgt door zijn locatie automatisch
alleen die map als scope. Publiceer via HTTPS en wijzig geen URLs naar root-relatieve URLs.

De webserver moet `.webmanifest` aanbieden als `application/manifest+json`. Als de WordPress-
hosting dit niet doet, stel dat MIME-type voor deze extensie in bij de host. `index.html` en
alle manifesticonen moeten een HTTP 200-antwoord geven.

## Cache en privacy

`service-worker.js` bevat een expliciete `APP_SHELL`. Alleen die lokale, statische bestanden
worden gecachet. Navigatie gebruikt network-first en valt offline terug op `index.html`.
Niet-GET-verzoeken, externe requests, `/wp-json/`, `/wp-admin/`, `admin-ajax.php` en URLs voor
WhatsApp, authenticatie, nonces en tracking worden nooit door de serviceworker gecachet.

Verhoog bij elke release die een shellbestand wijzigt `STATIC_CACHE`, bijvoorbeeld van
`jvgh-planning-static-v1` naar `jvgh-planning-static-v2`. Een wachtende versie toont een
melding; pas na een klik op **Bijwerken** wordt `SKIP_WAITING` verstuurd en eenmaal herladen.

## Installatie voor eindgebruikers

### Android en desktop

1. Open de pagina in Chrome, Samsung Internet of een ondersteunde desktopbrowser.
2. Kies **App installeren**.
3. Bevestig de installatie.

### iPhone en iPad

1. Open de pagina in Safari en kies **App installeren** voor uitleg.
2. Tik op de deelknop.
3. Kies **Zet op beginscherm**.
4. Kies **Voeg toe**.

Installatie, safe areas en het Apple Touch Icon moeten finaal op echte iOS- en Android-
apparaten worden gecontroleerd; browseremulatie kan het beginschermgedrag niet volledig testen.

## PNG-iconen handmatig toevoegen

Deze commit gebruikt tijdelijk het tekstgebaseerde `icons/app-icon.svg`; daardoor bevat de
commit geen binaire bestanden en zijn er geen ontbrekende icon-URLs. Voor optimale ondersteuning,
vooral voor het Apple Touch Icon, uploadt een beheerder later de volgende PNG-bestanden via de
GitHub-interface naar exact de map `icons/`:

- `favicon-32.png`
- `icon-48.png`, `icon-72.png`, `icon-96.png`, `icon-128.png`, `icon-144.png`, `icon-152.png`
- `apple-touch-icon-180.png`
- `icon-192.png`, `icon-384.png`, `icon-512.png`
- `maskable-192.png`, `maskable-512.png`

Pas in dezelfde vervolgwijziging de manifest-iconen en de favicon/Apple Touch Icon-tags aan en
voeg de PNG-bestanden pas dan aan `APP_SHELL` toe. Tot die tijd blijven manifest, HTML en
serviceworker bewust uitsluitend naar het aanwezige SVG-bestand verwijzen.
