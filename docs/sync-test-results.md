# Pruebas de sincronización

Las pruebas usan datos sintéticos exclusivamente en directorios temporales y repositorios Git bare locales. Ningún fixture se publica en `data/`.

## Node / Git

Comando: `node --test tests/*.test.mjs` (Node 24 local; Node 22 en Actions).

24 pruebas aprobadas localmente. Incluyen actualización de tres documentos y push a un repositorio bare aislado; mismo contenido sin commit; JSON roto en el segundo documento sin publicación parcial; schema incorrecto; project incorrecto; campo privado anidado; generatedAt ausente o fecha imposible; logro oculto; campo desconocido; arrays inválidos; números inseguros; conexión fallida; offline válido; guardia recursiva; fechas UTC antiguas y nanosegundos; HTTP 301/302/404/500/503; HTML, UTF-8 inválido y tamaño excesivo; cambios staged ajenos bloqueados; estructura del workflow.

La comprobación estática de workflow_dispatch no se confunde con una sincronización real correcta. El resultado remoto de la ejecución manual se recoge en la entrega.

## HTTP local con bibliotecas reales

[TinyServerProbe.java](../tests/TinyServerProbe.java) ejecuta el fragmento real mediante Rhino y levanta TinyServer en loopback, puerto efímero. Requiere Java 21 y classpath con TinyServer 1.0.0-build.33 (embebido en KubeJS 2101.7.2-build.377), Rhino 2101.2.7-build.85, Gson 2.10.1 y Guava 32.1.2-jre. No se redistribuyen los JAR ni se instalan en Minecraft. Se compila con `javac -cp <classpath> -d <qa-dir> tests/TinyServerProbe.java` y se ejecuta desde un directorio QA vacío con `java -cp <qa-dir>:<classpath> TinyServerProbe <ruta-absoluta-fragmento>`; usar `;` como separador de classpath en Windows.

35 comprobaciones aprobadas: los tres GET responden 200 con JSON completo; content type, no-cache y ausencia de CORS; HEAD 200 sin cuerpo; POST rechazado; fichero inexistente; traversal literal y codificado (socket sin normalización del cliente); rutas privadas, raíz, sufijos y query strings rechazados; ruta /stats.json preexistente intacta dentro del harness; exportación ausente 404; JSON roto 503.

La preparación detectó y corrigió diferencias reales de Rhino/TinyServer: path sin slash inicial y adaptación de byte[]/sobrecargas Java. No se afirma haber ejecutado el script completo del servidor ni probado su proxy.

## Matriz solicitada

| Caso | Evidencia | Alcance |
|---|---|---|
| A/B/C | 3 rutas 200, cabeceras y JSON | TinyServer local real; producción sigue 404 |
| D/E/F | Inexistentes, traversal y privados rechazados | Socket local real |
| G | Validación, commit y push de tres JSON | Git bare local |
| H | Sin cambios, sin commit | Git bare local |
| I/J/K/L | JSON, esquema, proyecto, privacidad | Node + conservación de archivos/commit |
| M/N | Endpoint caído o mezcla válida/rota | Node + ningún reemplazo ni commit |
| O | Dispatcher real | Ver ejecución remota en entrega; éxito final depende de HTTP desplegado |

No se ha modificado producción ni publicado datos de prueba. No se certifica una sincronización real completa hasta que las tres rutas HTTPS sirvan los JSON del servidor.
