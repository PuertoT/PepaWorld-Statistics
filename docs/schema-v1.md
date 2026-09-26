# Esquema público v1

Los archivos de `data/` están pensados para ser generados por Statistics y consumidos por el Launcher y otras herramientas públicas de PepaWorld 3.0.

## Reglas generales

- `schema`: versión del formato. Actualmente `1`.
- `project`: siempre `PepaWorld 3.0`.
- `generatedAt`: fecha/hora ISO 8601 UTC de la última exportación.
- UTF-8 y JSON válido.
- La exportación no contiene credenciales ni datos administrativos.

## data/status.json

Estado público general del servidor y versión del mod exportador.

No debe incluir IP de jugadores, coordenadas, inventarios, Ender Chest, Curios ni logs.

## data/achievements.json

Catálogo público de logros.

Cada logro podrá definir más adelante, como mínimo:

- `id`
- `name`
- `description`
- `hidden`
- `category`
- `icon`
- `reward`

Las recompensas públicas son descriptivas. La ejecución real de recompensas permanece en el servidor.

## data/rankings.json

Rankings públicos:

- `deaths`
- `zombies`
- `playtime`

Cada entrada pública deberá limitarse a datos necesarios para mostrar el ranking, por ejemplo:

```json
{
  "name": "Jugador",
  "value": 123
}
```

No se publicarán snapshots privados ni datos administrativos.

## Compatibilidad

Statistics puede evolucionar internamente sin cambiar este formato. Si en el futuro hay un cambio incompatible del JSON, se incrementará `schema`.
