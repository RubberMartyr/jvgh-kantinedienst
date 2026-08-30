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

## Tijdelijk tekstgebaseerd app-icoon

Deze tekst-only wijziging gebruikt voorlopig opnieuw `icons/app-icon.svg` voor de favicon,
headers en het PWA-manifest. Daardoor verwijzen HTML, manifest en serviceworker niet naar
ontbrekende binaire bestanden.

Het aangeleverde rasterlogo en de afgeleide bestanden moeten afzonderlijk worden toegevoegd
wanneer de commitomgeving binaire bestanden ondersteunt, met exact deze paden:

- `icons/jvgh-logo.jpg`
- `icons/icon-192.png`
- `icons/icon-512.png`
- `icons/icon-maskable-512.png`
- `icons/apple-touch-icon.png`

Werk pas in diezelfde binaire vervolgwijziging de verwijzingen opnieuw bij. Het maskable formaat
moet het volledige logo op ongeveer 79% van een zwart canvas tonen, zodat de witte buitenring
binnen gangbare Android-maskers veilig blijft.
