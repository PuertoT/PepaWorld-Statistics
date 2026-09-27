# PepaWorld-Statistics

Datos públicos de **PepaWorld 3.0**.

Este repositorio está pensado para exponer únicamente información pública que puedan consumir el Launcher y otras herramientas de PepaWorld.

## Estructura

- `data/status.json` — estado público general.
- `data/achievements.json` — catálogo público de logros.
- `data/rankings.json` — rankings públicos.

Todos los JSON usan `schema: 1` como versión inicial del formato.

## Privacidad

Aquí **no** deben publicarse inventarios, Ender Chest, Curios, coordenadas, IP, logs administrativos ni otros datos privados de jugadores.

Los archivos actuales son plantillas. En la siguiente fase, Statistics generará y actualizará los datos públicos de forma controlada.

## Sincronización automática

La sincronización HTTPS → GitHub Actions está preparada para ejecutarse cada cinco minutos y manualmente, con validación completa y guardia de privacidad. Usa únicamente el GITHUB_TOKEN temporal del job. Los endpoints nuevos todavía requieren integrar y desplegar el cambio HTTP autorizado; mientras no estén disponibles se conserva el último contenido de `data/`.

Consulta [arquitectura, workflow y despliegue pendiente](docs/synchronization.md) y [pruebas y límites comprobados](docs/sync-test-results.md).
