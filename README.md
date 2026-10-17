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

Los archivos de `data/` contienen las exportaciones públicas sincronizadas de Statistics. Los contadores históricos no se reinician durante una pausa.

## Sincronización automática

La sincronización HTTPS → GitHub Actions está preparada para ejecutarse cada cinco minutos y manualmente, con validación completa y guardia de privacidad. Usa únicamente el GITHUB_TOKEN temporal del job. La ejecución del 10 de octubre de 2026 a las 17:37 UTC terminó correctamente. Si una descarga falla, se conserva el último contenido de `data/`; su fecha de exportación puede quedar antigua.

Consulta [arquitectura y workflow](docs/synchronization.md) y [pruebas y límites comprobados](docs/sync-test-results.md).

## Cierre temporal y regreso

El cierre está anunciado para el 13 de octubre de 2026, sin hora confirmada. La preparación no pausa el servicio. Seguir [el procedimiento de pausa y reactivación](docs/pause-resume.md) cuando se confirme el cierre real. Noviembre es orientativo: no se programa una reactivación automática.
