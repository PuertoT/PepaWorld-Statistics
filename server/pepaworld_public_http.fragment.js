// LOCAL INTEGRATION FRAGMENT, NOT AN INDEPENDENT SERVER SCRIPT.
// Merge into pepaworld_stats_http.js after reviewing its real source.
// Call pepaworldRegisterPublicRoutes(existingHttpServer) BEFORE its existing start().
// Never replace /stats.json, create a second listener or alter its port/lifecycle.
function pepaworldRegisterPublicRoutes(http) {
  var Files = Java.loadClass('java.nio.file.Files');
  var Path = Java.loadClass('java.nio.file.Path');
  var LinkOption = Java.loadClass('java.nio.file.LinkOption');
  var JavaString = Java.loadClass('java.lang.String');
  var StandardCharsets = Java.loadClass('java.nio.charset.StandardCharsets');
  var HTTPMethod = Java.loadClass('dev.latvian.apps.tinyserver.http.HTTPMethod');
  var HTTPStatus = Java.loadClass('dev.latvian.apps.tinyserver.http.response.HTTPStatus');
  var root = Path.of('pepaworld-public').toAbsolutePath().normalize();
  var maxBytes = 2 * 1024 * 1024;

  function reply(status) {
    return status.header('Cache-Control', 'no-cache')
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('X-Content-Type-Options', 'nosniff');
  }

  function add(name) {
    // name comes ONLY from the literal whitelist below, never from a request.
    var endpoint = '/' + name;
    var file = root.resolve(name);
    function handle(request) {
      // TinyServer 1.0.0-build.33 exposes path() without the leading slash.
      if (String(request.path()) !== name || String(request.queryString()) !== '') {
        return reply(HTTPStatus.NOT_FOUND);
      }
      if (request.method() !== HTTPMethod.GET && request.method() !== HTTPMethod.HEAD) {
        return reply(HTTPStatus.METHOD_NOT_ALLOWED).header('Allow', 'GET, HEAD');
      }
      var input = null;
      try {
        if (Files.isSymbolicLink(root) || !Files.isDirectory(root, LinkOption.NOFOLLOW_LINKS)
            || Files.isSymbolicLink(file) || !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) {
          return reply(HTTPStatus.NOT_FOUND);
        }
        if (Files.size(file) > maxBytes) return reply(HTTPStatus.SERVICE_UNAVAILABLE);
        input = Files.newInputStream(file, LinkOption.NOFOLLOW_LINKS);
        var bytes = input.readNBytes(maxBytes + 1);
        if (bytes.length > maxBytes) return reply(HTTPStatus.SERVICE_UNAVAILABLE);
        // Rhino's native Java-array wrapper needs a JS array for byte[] overloads.
        var publicBytes = [];
        for (var i = 0; i < bytes.length; i++) publicBytes.push(bytes[i]);
        // A truncated/malformed export is unavailable, never replaced with fabricated JSON.
        var decoded = new JavaString['(byte[],java.nio.charset.Charset)'](publicBytes, StandardCharsets.UTF_8);
        var roundTrip = decoded.getBytes(StandardCharsets.UTF_8);
        if (roundTrip.length !== bytes.length) return reply(HTTPStatus.SERVICE_UNAVAILABLE);
        for (var j = 0; j < bytes.length; j++) if (bytes[j] !== roundTrip[j]) return reply(HTTPStatus.SERVICE_UNAVAILABLE);
        var document = JSON.parse(String(decoded));
        if (!document || document.schema !== 1 || document.project !== 'PepaWorld 3.0') {
          return reply(HTTPStatus.SERVICE_UNAVAILABLE);
        }
        // TinyServer suppresses the body for HEAD; same content length and type as GET.
        return reply(HTTPStatus.OK)['content(byte[],java.lang.String)'](publicBytes, 'application/json; charset=utf-8');
      } catch (error) {
        // Do not send/log exception details, filesystem paths or request data.
        return reply(HTTPStatus.SERVICE_UNAVAILABLE);
      } finally {
        if (input !== null) { try { input.close(); } catch (ignored) {} }
      }
    }
    http.http(HTTPMethod.GET, endpoint, handle);
    http.http(HTTPMethod.HEAD, endpoint, handle);
  }
  add('status.json');
  add('achievements.json');
  add('rankings.json');
}
