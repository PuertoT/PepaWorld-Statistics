# Pausa reversible de Statistics

## Preparación entregada

Este cambio mantiene el cron actual y no modifica ningún JSON público. No se ha accedido ni escrito en Minecraft, hosting, DNS o proxy. No se ha desactivado Actions. El aviso de Updates indica cierre el 13/10/2026 y regreso aproximado en noviembre; no hay hora de corte ni fecha firme de regreso. La pausa exige confirmación del cierre real, nunca solo un fallo HTTP o cero jugadores.

La ejecución 38072491066 del 10/10 a las 17:37:24 UTC fue correcta. La documentación anterior de despliegue pendiente es histórica.

## Al confirmar el cierre

Primero integrar la preparación en main. Los siguientes pasos son operativos y se realizan cuando el servidor haya cerrado, no ahora:

1. En GitHub → Actions → **Sync public PepaWorld data** → menú → **Disable workflow**. Desactivar impide futuros arranques, pero no garantiza detener ejecuciones ya iniciadas. Esperar a que todas las ejecuciones en curso o en cola terminen o estén canceladas. No permitir ejecuciones manuales de otras personas durante la operación.
2. Partir de un clon limpio y actualizado de main. Así se conserva la última publicación exitosa, no una copia antigua del 10 de octubre. No usar `reset --hard` sobre trabajo propio. Si el último envío ya falló por cierre, los rankings disponibles son la última exportación pública exitosa, no necesariamente el último segundo jugado.
3. Ejecutar desde la raíz:

   ```sh
   git status --short
   git pull --ff-only
   node scripts/statistics-lifecycle.mjs pause --confirm-server-closed
   node --test tests/*.test.mjs
   git diff --check
   git diff --stat
   git status --short
   ```

4. Revisar los cambios: `data/status.json` queda offline, online=false y jugadores=0; rankings y logros de `data/` conservan exactamente sus bytes y fechas. `history/<fecha UTC>/` guarda los tres JSON previos, sin modificar, y `maintenance/paused.json` explica la pausa, la fecha de última exportación y la ruta histórica. Se retira exclusivamente `schedule` del workflow, manteniendo la ejecución manual.
5. Publicar todos los cambios juntos, desde main, después de revisarlos:

   ```sh
   git add -- .github/workflows/sync-public-data.yml data/status.json maintenance/paused.json history/
   git commit -m "chore: pause Statistics after confirmed server closure"
   git push origin HEAD:main
   ```

   Si main está protegido, usar una rama y PR con estos mismos cambios; mantener el workflow desactivado hasta que se integre. Si el push se rechaza, no forzarlo: revisar la nueva main y repetir la preparación en un clon limpio. No publicar un estado offline suelto dejando fuera el marcador o el workflow.
6. Verificar en main el commit y los cuatro puntos: offline público, cron ausente, marcador presente y rankings históricos idénticos. Mantener el workflow desactivado durante las vacaciones. No archivar ni eliminar el repositorio: los lectores necesitan seguir accediendo a sus JSON.

El comando prepara archivos locales: no hace commit, push ni desactiva Actions por sí mismo. Si falla una escritura local, no publicar el resultado parcial: revisar o repetir desde un clon limpio. El commit Git es la publicación atómica. La segunda pausa con el marcador ya presente no sobrescribe el archivo histórico.

El marcador impide descargar o publicar incluso si se lanza manualmente la sincronización por error. Retirar el cron evita que se generen ejecuciones cada cinco minutos; un simple `if` que salte el job no eliminaría esas ejecuciones. La desactivación previa y la espera evitan carreras con runners que ya habían descargado la versión antigua del código.

## Estado público y compatibilidad

Se mantiene el esquema cerrado v1: `status` sigue siendo `online`/`offline`; no se introduce un valor `paused` incompatible. Durante el cierre confirmado, `generatedAt` de status representa la publicación administrativa del estado; la exportación original queda en el archivo histórico y en `lastExportAt`. Las fechas de rankings y logros no se rejuvenecen artificialmente. No se modifica el exportador ni se fabrican contadores.

El aviso existente de Updates comunica las vacaciones. No se ha verificado ni cambiado el código del Launcher: su caché y su presentación deben comprobarse tras publicar la pausa. Los consumidores deben tratar un estado online antiguo como **sin datos recientes**, no como prueba de conexión actual. Un error de red no demuestra que Minecraft esté offline. Esta preparación resuelve el cierre administrativo confirmado; no añade un monitor de disponibilidad ni caducidad automática a clientes ajenos a este repositorio.

## Cuando vuelva PepaWorld

1. Arrancar Minecraft y comprobar los tres endpoints HTTPS públicos. Si cambia el dominio, revisar `BASE_URL` en el sincronizador antes de continuar. No restaurar el status online archivado ni tocar los contadores para aparentar actividad.
2. Con Actions aún desactivado, actualizar un clon limpio de main y ejecutar:

   ```sh
   git pull --ff-only
   node scripts/statistics-lifecycle.mjs resume
   node --test tests/*.test.mjs
   git diff --check
   git diff --stat
   ```

   Se descargan y validan los tres documentos en un temporal. Solo se prepara la reactivación si status es online y tiene como máximo 30 minutos, con hasta un minuto de tolerancia de reloj futuro. Si algo falla, el estado pausado permanece. Revisar también que los rankings recibidos corresponden al mundo restaurado esperado antes de publicar.
3. Revisar y publicar juntos los tres JSON, la recuperación del cron y la eliminación del marcador:

   ```sh
   git add -- .github/workflows/sync-public-data.yml data/status.json data/achievements.json data/rankings.json maintenance/paused.json
   git commit -m "chore: resume Statistics with fresh validated public data"
   git push origin HEAD:main
   ```

   Las carpetas `history/` permanecen intactas. Para main protegida, integrar mediante PR antes del siguiente paso.
4. Actions → workflow → **Enable workflow**. Ejecutarlo manualmente sobre main y comprobar éxito y fechas de los JSON. Comprobar después una ejecución programada. GitHub puede retrasar el cron: cinco minutos no es una garantía de puntualidad. Verificar el Launcher tras refrescar su caché.
5. Si la comprobación de regreso falla, desactivar de nuevo el workflow, esperar a que no haya ejecuciones y revisar. No declarar cierre por un fallo de red aislado. Si se confirma una nueva pausa real, repetir el procedimiento de cierre; creará otro archivo histórico.

## Comprobaciones realizadas

33 pruebas locales correctas: sincronización normal, esquema y privacidad, fallos de red y publicación, confirmación explícita, conservación exacta de archivos históricos/rankings/logros, pausa idempotente, bloqueo de sincronizador/publicador, reactivación válida, rechazo de datos offline, antiguos, futuros, inválidos o inaccesibles. Se usan repositorios y respuestas sintéticas aislados. No se ha activado la pausa real ni se ha validado el comportamiento visual del Launcher.
