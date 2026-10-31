---
name: clima-local
description: Obtiene el clima actual y el pronóstico de los próximos días para Santiago, Chile (por defecto) o para otra ciudad indicada. Úsala cuando el usuario pida el clima, la temperatura, si va a llover o el pronóstico.
argument-hint: "[ciudad opcional]"
allowed-tools: Bash(curl *)
---

# Clima local

Consulta el clima con wttr.in. No requiere API key.

## Pasos

1. Si el usuario no indicó ciudad, usa por defecto `Santiago,Chile`. Si indicó otra ciudad (`$ARGUMENTS`), úsala en la URL, con espacios como `+`.

2. Obtén los datos en JSON:

   ```bash
   curl -s "https://wttr.in/<ciudad>?format=j1&lang=es"
   ```

   Ejemplos: `https://wttr.in/Santiago,Chile?format=j1&lang=es` (por defecto), `https://wttr.in/Valparaiso?format=j1&lang=es`.

3. Si `curl` falla o la respuesta no es JSON válido, prueba la versión de texto: `curl -s "https://wttr.in/<ciudad>?0&lang=es"`. Si también falla, informa el error y no inventes datos.

4. Extrae del JSON:
   - Ubicación: `nearest_area[0].areaName[0].value` y `country[0].value`.
   - Ahora (`current_condition[0]`): `temp_C`, `FeelsLikeC`, `humidity`, `windspeedKmph`, `lang_es[0].value` (descripción).
   - Próximos días (`weather[]`): `date`, `mintempC`, `maxtempC`, y `hourly[].chanceofrain` (máximo del día).

5. Responde en español, breve: ubicación, condición actual y pronóstico de 3 días en una línea por día.
## Notas

- Unidades métricas (°C, km/h) por defecto.
- Solo lectura: no escribe archivos ni modifica el proyecto.
