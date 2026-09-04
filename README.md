README!
## Beschikbaarheid doorgeven

- Persoonlijke link: `availability.html?userId=123`
- Ouderlink per ploeg (aanbevolen): `availability.html?teamId=13412`
- Legacy ploegnaamlink: `availability.html?team=U9%20B`

De doorgestuurde ouderlink bevat uitsluitend de WordPress/SportsPress-team-ID en nooit de user-ID van de primaire afgevaardigde. In teammodus identificeert de ouder zich met voornaam, naam en gsm-nummer.

Een aangevinkte shift opent automatisch. Met **Start** en **Einde** kan de
vrijwilliger per kwartier een deel van de shift kiezen. Aangrenzende en
overlappende keuzes worden bij het opslaan samengevoegd via de idempotente
reconciliation op de server. Na deployment kan één harde refresh nodig zijn om
de vernieuwde offline assets te laden.

## WordPress Code Snippets

`wordpress/jvgh-team-delegates.php` is een normaal PHP-bestand en bevat daarom
een openende `<?php`-tag. Vervang de bestaande JVGH-snippet volledig wanneer je
de inhoud in de plugin **Code Snippets** overneemt: kopieer vanaf de eerste
`define`/`add_action` en dus zonder `<?php`. Activeer nooit twee kopieën tegelijk,
om dubbele functies en constanten te vermijden.
