// Local-only integration harness: actual TinyServer + actual Rhino from the installed KubeJS build.
// No Minecraft server, credentials or production data. Requires Java 21.
import dev.latvian.apps.tinyserver.HTTPServer;
import dev.latvian.apps.tinyserver.http.HTTPRequest;
import dev.latvian.apps.tinyserver.http.response.HTTPResponse;
import dev.latvian.mods.rhino.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.io.*;
import java.util.*;

public class TinyServerProbe {
  static int checks = 0;
  static void check(boolean yes, String label) {
    if (!yes) throw new AssertionError(label);
    checks++; System.out.println("PASS " + label);
  }
  public static void main(String[] args) throws Exception {
    var context = new ContextFactory().enter();
    var scope = context.initStandardObjects();
    var java = context.newObject(scope);
    ScriptableObject.putProperty(java, "loadClass", new BaseFunction() {
      public Object call(Context cx, Scriptable s, Scriptable self, Object[] arguments) {
        try { return new NativeJavaClass(cx, scope, Class.forName(cx.toString(arguments[0]))); }
        catch (Exception e) { throw new RuntimeException(e); }
      }
    }, context);
    ScriptableObject.putProperty(scope, "Java", java, context);
    context.evaluateString(scope, Files.readString(Path.of(args[0])), "public-fragment", 1, null);
    var server = new HTTPServer<HTTPRequest>(HTTPRequest::new);
    int port;
    try (var reservation = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) { port = reservation.getLocalPort(); }
    server.setAddress("127.0.0.1"); server.setPort(port); server.setDaemon(true);
    server.get("/stats.json", req -> HTTPResponse.ok().json("{\"legacy\":true}"));
    ScriptableObject.putProperty(scope, "probeServer", context.javaToJS(server, scope), context);
    context.evaluateString(scope, "pepaworldRegisterPublicRoutes(probeServer)", "register", 1, null);
    server.start();
    var root = Path.of("pepaworld-public"); Files.createDirectories(root);
    var json = "{\"schema\":1,\"project\":\"PepaWorld 3.0\",\"generatedAt\":\"2026-09-27T00:00:00Z\"}";
    try {
      for (String name : List.of("status.json", "achievements.json", "rankings.json")) Files.writeString(root.resolve(name), json);
      var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
      for (String name : List.of("status.json", "achievements.json", "rankings.json")) {
        var uri = URI.create("http://127.0.0.1:" + port + "/" + name);
        var get = client.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(5)).GET().build(), HttpResponse.BodyHandlers.ofString());
        check(get.statusCode() == 200, "A " + name + " HTTP 200 (actual " + get.statusCode() + ")");
        check(get.headers().firstValue("content-type").orElse("").equals("application/json; charset=utf-8"), "B Content-Type " + name);
        check(get.body().equals(json), "C original complete JSON " + name);
        check(get.headers().firstValue("cache-control").orElse("").equals("no-cache"), "Cache-Control " + name);
        check(get.headers().firstValue("access-control-allow-origin").isEmpty(), "No wildcard CORS " + name);
        var head = client.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(5)).method("HEAD", HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        check(head.statusCode() == 200 && head.body().isEmpty(), "HEAD " + name);
        var post = client.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(5)).POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        check(post.statusCode() >= 400 && post.statusCode() < 500, "POST rejected " + name);
      }
      for (String target : List.of("/missing.json", "/../world/playerdata", "/%2e%2e/world/playerdata", "/%2e%2e/status.json", "/foo/../status.json", "/world", "/config/statistics/server.json", "/statistics/players/test.json", "/", "/status.json/extra", "/status.json?file=../secret")) {
        // Raw socket preserves traversal strings (no URL client normalization).
        try (var socket = new Socket("127.0.0.1", port)) {
          socket.setSoTimeout(5000);
          socket.getOutputStream().write(("GET " + target + " HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
          var line = new BufferedReader(new InputStreamReader(socket.getInputStream())).readLine();
          check(line != null && line.matches("HTTP/1\\.[01] (400|403|404).*"), "D/E/F rejected " + target);
        }
      }
      var old = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/stats.json")).GET().build(), HttpResponse.BodyHandlers.ofString());
      check(old.statusCode() == 200 && old.body().equals("{\"legacy\":true}"), "Existing /stats.json handler preserved in harness");
      Files.delete(root.resolve("rankings.json"));
      var missing = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/rankings.json")).GET().build(), HttpResponse.BodyHandlers.ofString());
      check(missing.statusCode() == 404, "Missing export 404");
      Files.writeString(root.resolve("status.json"), "{broken");
      var broken = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/status.json")).GET().build(), HttpResponse.BodyHandlers.ofString());
      check(broken.statusCode() == 503, "Malformed export 503");
      System.out.println("TOTAL " + checks + " passed");
    } finally { server.stop(); }
  }
}
