# Sincronización de datos públicos

## Estado comprobado el 10 de octubre de 2026

La [ejecución 38072491066](https://github.com/PuertoT/PepaWorld-Statistics/actions/runs/38072491066), iniciada a las 17:37:24 UTC, terminó con éxito. El JSON publicado indica online, 0 jugadores, Statistics 0.2.0 y exportación 17:35:49 UTC. No hay PR abiertos en la revisión inicial. La sincronización ya está operativa; las referencias a endpoints pendientes que siguen abajo documentan la entrega original, no el estado actual.

Para el cierre anunciado el 13 de octubre, seguir [pausa y regreso](pause-resume.md). La copia del servidor ya está descargada y no se repite.

## Arquitectura y registro histórico de entrega

Statistics 0.2.0 escribe `pepaworld-public/*.json` dentro del directorio del servidor. El servicio TinyServer existente debe añadir tres rutas explícitas. El dominio HTTPS expone esos JSON; GitHub Actions los descarga, valida los tres y publica un único commit en este repositorio.

No se ha instalado nada en Minecraft. No se ha modificado el mod. El script HTTP original no está disponible localmente; se conoce su ruta `/home/container/kubejs/server_scripts/pepaworld_stats_http.js`, proporcionada por administración. El fragmento propuesto está probado con las bibliotecas reales, pero **pendiente de fusionar con ese script y de autorizar su instalación**. No sustituye al script original.

Comprobación pública previa: `/stats.json` responde 200, `application/json; charset=utf-8`, cabecera Server `solar-system, PepaWorld Stats`. Las tres rutas nuevas responden 404. Esas cabeceras no permiten deducir la configuración del reverse proxy, a la que no se ha accedido.

Rutas elegidas (objetivo, todavía no disponibles en producción):

- https://stats-pepaworld.minecra.fr/status.json
- https://stats-pepaworld.minecra.fr/achievements.json
- https://stats-pepaworld.minecra.fr/rankings.json

Se mantiene https://stats-pepaworld.minecra.fr/stats.json con su controlador actual. Las rutas nuevas leen exclusivamente `/home/container/pepaworld-public/{status,achievements,rankings}.json` cuando el proceso se ejecuta desde `/home/container`. No se publica el directorio privado `statistics/`.

## Workflow completo

El archivo ejecutable completo es [sync-public-data.yml](../.github/workflows/sync-public-data.yml). No hay pasos privados ni dependencias npm. Sus tres scripts y los tests se versionan junto a él:

- [validate-public-data.mjs](../scripts/validate-public-data.mjs): esquema cerrado y privacidad.
- [sync-public-data.mjs](../scripts/sync-public-data.mjs): descarga HTTPS, staging y reemplazo.
- [publish-public-data.mjs](../scripts/publish-public-data.mjs): validación final, diff, commit y push.

Ejecución manual mediante Actions → **Sync public PepaWorld data** → Run workflow → main. Frecuencia solicitada: cada cinco minutos (`*/5 * * * *`, UTC). GitHub puede retrasar u omitir ejecuciones bajo carga; no es una garantía de tiempo real. En repositorios públicos también puede desactivar schedules tras 60 días sin actividad. [Documentación oficial](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Usa runners hospedados Ubuntu 24.04, Node 22, timeout de cinco minutos y una única concurrencia, sin cancelar una publicación en curso. Solo ejecuta en `PuertoT/PepaWorld-Statistics`, rama main. Las acciones checkout/setup-node están fijadas por SHA. Cada ejecución pasa primero los tests locales aislados.

## Descarga y validación

- Dominio HTTPS fijo; sin inputs remotos configurables, autenticación HTTP, redirects ni cookies.
- Timeout de 20 segundos por descarga, incluyendo lectura del cuerpo. Exige HTTP 200 y Content-Type application/json.
- Hasta 2 MiB por documento, controlando Content-Length y bytes realmente recibidos.
- Descarga primero a un directorio temporal del runner. Hasta que TODOS se validan no se escribe en `data/`.
- UTF-8 estricto y JSON válido; schema numérico 1, project exacto `PepaWorld 3.0`.
- generatedAt ISO 8601 UTC terminado en Z, con 0–9 decimales, calendario real y hora válida. Compatible con Java Instant. Fechas antiguas siguen siendo válidas. No se genera una fecha alternativa.
- Campos obligatorios y tipos según el exportador: status/server/mod, achievements array, rankings/deaths/zombies/playtime arrays. Campos desconocidos se rechazan.
- Estado online/offline coherente con boolean y cantidades; contadores enteros no negativos; máximo 100 filas por ranking, 10.000 logros y 2 MiB. IDs, nombres y metadatos con límites.
- Logros hidden=true se rechazan. Recompensas solo descriptivas, sin comandos ni payloads.
- La privacy guard recorre objetos y arrays; normaliza mayúsculas y separadores de claves. Bloquea inventory, inventories, enderChest, ender_chest, curios, coordinates, position, ip, address, launcher, password, secret(s), token(s), logs, snapshot(s), securitycraft, uuid, playerdata, commands y credentials. Límites de profundidad y nodos. No vuelca contenido rechazado en logs.

El esquema cerrado refuerza la lista de claves: cualquier campo adicional necesita revisión explícita. Ningún validador de estructura puede garantizar que un administrador no escriba un secreto en una descripción pública permitida. Los textos del catálogo deben ser intencionadamente públicos.

El contador playtime llega del exportador sin conversión y está en segundos. Su autoridad sigue siendo KubeJS `pepaworld_stats_data → players[UUID] → playtimeSeconds`; no se calcula otro contador en GitHub.

## Atomicidad, errores y offline

Se conservan los bytes del exportador. Si no hay diff no se crea commit vacío. Si lo hay, solo se añaden los tres JSON, se crea `chore: update public PepaWorld data` con identidad PepaWorld Bot y se hace push a main, sin force. Cambios ajenos o staged inesperado detienen la publicación.

Un error HTTP, timeout, fichero ausente, UTF-8 inválido, JSON corrupto, schema incompatible o privacidad fallida termina con error y conserva el último commit remoto. Nunca sustituye datos por `{}`, arrays inventados ni estados derivados del fallo de conexión.

`status: offline` exportado por un cierre limpio es válido. Si TinyServer se detiene con Minecraft antes de que Actions lo lea, puede quedar el último online en GitHub: **inaccesible no equivale a offline**. Para garantizar lectura después del cierre haría falta un servicio HTTP del hosting que continúe activo y sirva esos mismos archivos; no se ha supuesto que exista.

La transacción pública es un único commit de Git. Los tres reemplazos de archivos en el runner no son una transacción de filesystem: si uno falla, el paso falla y no se llama al publicador. El runner es efímero. Una actualización concurrente de main puede rechazar el push; se deja fallar y el siguiente ciclo parte de main actual. No se fuerza ni reescribe historia.

El exportador también escribe por archivo. Se permiten generatedAt distintos entre los tres documentos; representan su última exportación válida. No se afirma que sean una captura indivisible del mismo tick. Exigir igualdad podría bloquear indefinidamente datos válidos si una fuente interna no se actualiza.

## Credenciales

Solo `GITHUB_TOKEN` efímero del job, permiso `contents: write`; los demás permisos quedan sin conceder. Checkout recibe ese token automáticamente y lo limpia al finalizar. No se crea ni utiliza un PAT en la sincronización, no hay secrets propios ni `.env`, ni credenciales GitHub enviadas al servidor Minecraft. La identidad de commit no es una credencial. [Permisos del token](https://docs.github.com/en/actions/concepts/security/github_token).

## Cambios HTTP preparados en local

[pepaworld_public_http.fragment.js](../server/pepaworld_public_http.fragment.js) define `pepaworldRegisterPublicRoutes(http)`. Para integrarlo, revisar primero el script original; insertar la función y llamar **una vez**, sobre su instancia TinyServer ya creada, antes de su `start()`. No es un script autónomo y no debe instalarse como sustitución del archivo actual. No inicia listeners, no registra eventos KubeJS, no toca `/stats.json` y no altera puerto ni lifecycle.

El fragmento usa whitelist literal de tres nombres, rutas GET y HEAD exactas, rechaza query strings, nunca resuelve nombres tomados del cliente. No registra file servers genéricos ni listados. No sigue symlinks del archivo/directorio público; lee hasta 2 MiB con NOFOLLOW_LINKS. Fichero ausente → 404; ilegible, demasiado grande, UTF-8 o JSON corrupto → 503. No expone errores internos. Content-Type `application/json; charset=utf-8`, Cache-Control `no-cache`, X-Content-Type-Options `nosniff`; sin CORS añadido. HEAD utiliza la supresión de cuerpo de TinyServer. Los otros métodos no tienen controlador.

La API se contrastó con TinyServer 1.0.0-build.33 incluido en KubeJS 2101.7.2-build.377 y Rhino 2101.2.7-build.85. El adaptador de prueba reproduce Java.loadClass, pero no el motor completo de eventos de KubeJS ni el script real. No requiere Node en Minecraft. No requiere recompilar Statistics.

Pendiente de hosting: comprobar si el proxy ya reenvía cualquier ruta hacia el puerto 25736 o solo `/stats.json`. Si filtra rutas, añadir exclusivamente las tres rutas nuevas manteniendo TLS, upstream y ruta antigua. Confirmar preservación de métodos/cabeceras y ausencia de caché persistente. No se proporciona una configuración nginx/Caddy inventada. No se ha modificado DNS ni proxy.

## Comprobación tras instalación autorizada

1. Leer el script real y fusionar el fragmento en local. Conservar copia del original.
2. Confirmar con hosting las rutas del proxy y el directorio de trabajo `/home/container`.
3. Autorizar e instalar el cambio del servicio HTTP; comprobar que la candidata ya genera los tres JSON reales. No subir fixtures.
4. Repetir GET/HEAD, content type, 404, traversal literal/codificado y acceso privado; verificar `/stats.json` anterior.
5. Ejecutar workflow_dispatch y revisar que solo cambian los tres JSON reales. Una segunda ejecución con los mismos bytes debe terminar sin commit.

Las plantillas actuales de `data/` no se rellenan artificialmente. Mientras no estén disponibles los endpoints reales válidos, el workflow falla de forma intencional, conserva esas plantillas y puede generar notificaciones normales de fallo en GitHub.
