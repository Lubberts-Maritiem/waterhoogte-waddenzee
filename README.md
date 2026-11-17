# Waterhoogte Waddenzee

Mobielvriendelijke viewer voor de waterhoogte op 16 locaties langs de Waddenzee en Scheveningen:
meting, verwachting van Rijkswaterstaat en astronomisch getij, met een tijdschuif die op iOS én Android werkt.

## Hoe het werkt

| Bestand | Wat |
|---|---|
| `index.html` | De viewer (één pagina, geen build-stap nodig). Haalt data op via `api/data`. |
| `api/data.js` | Vercel serverless functie. Haalt de data live op bij de openbare [Rijkswaterstaat Waterwebservices](https://rijkswaterstaatdata.nl/waterdata/) en geeft één compact JSON-bestand terug. Vercel bewaart het antwoord 10 minuten in de cache. |
| `vercel.json` | Geeft de functie maximaal 60 seconden. |

De Waterwebservices staan geen directe aanvragen vanuit de browser toe (geen CORS), daarom loopt het via de functie.
De pagina ververst zichzelf elke 10 minuten zolang hij openstaat.

## Locaties

De lijst staat bovenaan `api/data.js` (`LOCATIONS`). Een locatie toevoegen: zoek de code op in de
catalogus van de Waterwebservices en voeg een regel `['Naam', 'code']` toe.

Bijzonderheden:
- **Holwerd**: meting van `holwerd.vaargeul`, getij van `holwerd.veersteiger`. Geen RWS-verwachting.
- **Eemshaven**: Rijkswaterstaat levert hier nu geen meting of verwachting via de openbare dienst; alleen het getij.

## Lokaal testen

```bash
npx vercel dev
```

Bron: Rijkswaterstaat. Meting en verwachting zijn ruwe, niet-gevalideerde gegevens.
