#!/usr/bin/env python3
"""Compile and exercise the shipped native OTT scope/transport without a phone.
Uses Android API doubles for JVM I/O tests; this is not an APK/device test.
Run after applying patches (npm ci + postinstall)."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT / 'node_modules/react-native-webview'
JAVA = NATIVE / 'android/src/main/java/com/reactnativecommunity/webview'
RULES = json.loads((ROOT / 'src/common/libs/xapp/publicSuffixRules.json').read_text())['rules']

STUBS = {
'android/net/Uri.java': '''package android.net;
public class Uri {
 private final java.net.URI uri;
 private Uri(String value) { uri=java.net.URI.create(value); }
 public static Uri parse(String value) { return new Uri(value); }
 public String getScheme(){return uri.getScheme();}
 public String getHost(){return uri.getHost();}
 public String getPath(){return uri.getPath();}
 public String toString(){return uri.toString();}
}''',
'android/os/Build.java': '''package android.os;
public class Build {
 public static class VERSION {public static final int SDK_INT=34;}
 public static class VERSION_CODES {public static final int N=24;}
}''',
'android/webkit/WebResourceRequest.java': '''package android.webkit;
public interface WebResourceRequest {
 android.net.Uri getUrl(); java.util.Map<String,String> getRequestHeaders();
 String getMethod(); boolean isForMainFrame(); boolean isRedirect();
}''',
'android/webkit/WebResourceResponse.java': '''package android.webkit;
public class WebResourceResponse {
 public final int status; public final java.io.InputStream data;
 public WebResourceResponse(String mime,String encoding,int status,String reason,
 java.util.Map<String,String> headers,java.io.InputStream data){this.status=status;this.data=data;}
}''',
'android/webkit/CookieManager.java': '''package android.webkit;
public class CookieManager {
 private static final CookieManager INSTANCE=new CookieManager();
 private final java.util.Map<String,String> cookies=new java.util.HashMap<>();
 public static CookieManager getInstance(){return INSTANCE;}
 public String getCookie(String url){return cookies.get(java.net.URI.create(url).getHost());}
 public void setCookie(String url,String value){
  String host=java.net.URI.create(url).getHost();
  if(value.contains("Max-Age=0")) cookies.remove(host);
  else cookies.put(host,value.split(";",2)[0]);
 }
}''',
'com/reactnativecommunity/webview/RNCWebView.java': '''package com.reactnativecommunity.webview;
public class RNCWebView {
 public volatile String xamanOttUserAgent="xumm/xapp:310 (ott:test-secret)";
 public String loadedUrl;
 public String pageUrl;
 public String getUrl(){return pageUrl;}
 public boolean post(Runnable task){task.run();return true;}
 public void loadUrl(String url){loadedUrl=url;}
}''',
}

HARNESS = '''package com.reactnativecommunity.webview;
import android.webkit.*;
import android.net.Uri;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
public class OttProbe {
 static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
 static class Request implements WebResourceRequest {
  final String url,method; final boolean main; final Map<String,String> headers;
  Request(String url,String method,boolean main){this(url,method,main,true,null);}
  Request(String url,String method,boolean main,boolean incomingCookie,String credentialMode){
   this.url=url;this.method=method;this.main=main;headers=new HashMap<>();
   headers.put("Authorization","private-source-auth");
   if(incomingCookie) headers.put("Cookie","source=private");
   if(credentialMode!=null) headers.put("X-Xaman-Credentials",credentialMode);
  }
  public Uri getUrl(){return Uri.parse(url);} public Map<String,String> getRequestHeaders(){return headers;}
  public String getMethod(){return method;} public boolean isForMainFrame(){return main;}
  public boolean isRedirect(){return false;}
 }
 public static void main(String[] args)throws Exception {
  check(!XamanOttScope.sameSite("app.wallet.co.in","collector.unrelated.co.in"),"co.in isolation");
  check(!XamanOttScope.sameSite("wallet.onrender.com","unrelated.onrender.com"),"private suffix isolation");
  check(!XamanOttScope.sameSite("a.foo.ck","b.foo.ck"),"wildcard isolation");
  check(!XamanOttScope.sameSite("app.a.公司.cn","collector.b.公司.cn"),"Unicode suffix isolation");
  check(XamanOttScope.sameSite("a.www.ck","b.www.ck"),"PSL exception");
  final List<Map<String,String>> received=new ArrayList<>();
  // Loopback HTTP stands in for TLS I/O; the production routing still sees HTTPS URLs.
  URL.setURLStreamHandlerFactory(protocol -> protocol.equals("https") ? new URLStreamHandler() {
   protected URLConnection openConnection(URL url) throws java.io.IOException {
    return new URL("http",url.getHost().equals("xaman.app") ? "127.0.0.1" : url.getHost(),url.getPort(),url.getFile()).openConnection();
   }
  } : null);
  HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
  int port=server.getAddress().getPort();
  server.createContext("/",ex->{
   Map<String,String> row=new HashMap<>();
   row.put("path",ex.getRequestURI().getPath());
   row.put("ua",ex.getRequestHeaders().getFirst("User-Agent"));
   row.put("auth",ex.getRequestHeaders().getFirst("Authorization"));
   row.put("cookie",ex.getRequestHeaders().getFirst("Cookie"));
   row.put("ott",ex.getRequestHeaders().getFirst("X-OTT"));
   received.add(row);
   if(ex.getRequestURI().getPath().equals("/redirect")){
    ex.getResponseHeaders().add("Location","https://localhost:"+port+"/collector");
    ex.sendResponseHeaders(302,-1);
   } else {
    byte[] body="OK".getBytes(StandardCharsets.UTF_8);
    if(ex.getRequestURI().getPath().equals("/gzip")){
     java.io.ByteArrayOutputStream buf=new java.io.ByteArrayOutputStream();
     try(java.util.zip.GZIPOutputStream zip=new java.util.zip.GZIPOutputStream(buf)){zip.write(body);}
     body=buf.toByteArray();ex.getResponseHeaders().add("Content-Encoding","gzip");
    }
    if(ex.getRequestURI().getPath().equals("/logout")){
     ex.getResponseHeaders().add("Set-Cookie","session=own; Max-Age=0");
    } else if(!ex.getRequestURI().getPath().equals("/omit")){
     ex.getResponseHeaders().add("Set-Cookie","session=own");
    }
    ex.sendResponseHeaders(200,body.length);ex.getResponseBody().write(body);
   }
   ex.close();
  });
  server.start();
  try {
   XamanOttScope bootstrapScope=new XamanOttScope();
   RNCWebView bootstrapView=new RNCWebView();
   WebResourceResponse bootstrap=XamanOttInterceptor.intercept(bootstrapScope,bootstrapView,
     new Request("https://xaman.app:"+port+"/bootstrap","GET",true));
   bootstrap.data.close();
   check("test-secret".equals(received.get(0).get("ott")),"owned bootstrap X-OTT restored by transport");
   received.clear();
   String own="https://127.0.0.1:"+port;
   XamanOttScope scope=new XamanOttScope();
   scope.observe("127.0.0.1","/",true,false);scope.noteDocumentStatus(200);
   RNCWebView view=new RNCWebView();
   view.pageUrl=own+"/";
   WebResourceResponse response=XamanOttInterceptor.intercept(scope,view,new Request(own+"/redirect","GET",false));
   check(new String(response.data.readAllBytes(),StandardCharsets.UTF_8).equals("OK"),"redirect response");
   response.data.close();
   check(received.get(0).get("ua").contains("(ott:"),"own resource gets token");
   check(!received.get(1).get("ua").contains("(ott:"),"third-party redirected resource stripped");
   check(received.get(1).get("auth")==null,"cross-origin Authorization stripped");
   check(received.get(1).get("cookie")==null,"cross-origin Cookie stripped");
   response=XamanOttInterceptor.intercept(scope,view,new Request(own+"/gzip","GET",false));
   check(new String(response.data.readAllBytes(),StandardCharsets.UTF_8).equals("OK"),"gzip decoded");
   response.data.close();
   check("session=own".equals(android.webkit.CookieManager.getInstance().getCookie(own)),"cookies retained at proper host");
   received.clear();
   response=XamanOttInterceptor.intercept(scope,view,new Request(own+"/again","GET",false,false,null));
   response.data.close();
   check("session=own".equals(received.get(0).get("cookie")),"same-origin request sends saved cookie");
   received.clear();
   response=XamanOttInterceptor.intercept(scope,view,new Request(own+"/omit","GET",false,false,"omit"));
   response.data.close();
   check(received.get(0).get("cookie")==null,"credentials omit does not send saved cookie");
   check("session=own".equals(android.webkit.CookieManager.getInstance().getCookie(own)),"omit does not drop the saved session");
   received.clear();
   response=XamanOttInterceptor.intercept(scope,view,new Request(own+"/logout","GET",false,false,null));
   response.data.close();
   check(android.webkit.CookieManager.getInstance().getCookie(own)==null,"logout removes the saved cookie");
   response=XamanOttInterceptor.intercept(scope,view,new Request(own+"/redirect","GET",true));
   check(response.status==204,"main redirect restarts navigation");
   check(view.loadedUrl.equals("https://localhost:"+port+"/collector"),"main redirect preserves destination origin");
   check(XamanOttInterceptor.intercept(scope,view,new Request(own+"/post","POST",false))==null,"POST uses token-free Chromium");
   check(!XamanOttScope.stripOtt(view.xamanOttUserAgent).contains("(ott:"),"Chromium default stripped");
  } finally {server.stop(0);}
  System.out.println("Java: suffix/wildcard/exception, redirect token scope, auth/cookie isolation, gzip and main origin passed");
 }
}
'''

with tempfile.TemporaryDirectory(prefix='xaman-ott-probe-') as folder:
    tmp = Path(folder)
    for path, source in STUBS.items():
        p = tmp / path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(source)
    target = tmp / 'com/reactnativecommunity/webview'
    for name in ['XamanOttScope.java', 'XamanOttInterceptor.java']:
        shutil.copy(JAVA / name, target / name)
    (target / 'OttProbe.java').write_text(HARNESS)
    java = (JAVA / 'XamanOttScope.java').read_text()
    section = java.split('String.join("", new String[] {', 1)[1].split('}).split', 1)[0]
    native_rules = ''.join(json.loads(line.strip().rstrip(',')) for line in section.splitlines() if line.strip())
    assert native_rules.splitlines() == RULES, 'Java PSL snapshot differs'
    objc = (NATIVE / 'apple/XamanOttSchemeHandler.m').read_text()
    section = objc.split('NSString *text = [@[', 1)[1].split('] componentsJoinedByString', 1)[0]
    native_rules = ''.join(json.loads(line.strip().lstrip('@').rstrip(',')) for line in section.splitlines() if line.strip())
    assert native_rules.splitlines() == RULES, 'Objective-C PSL snapshot differs'
    subprocess.run(['javac', '-encoding', 'UTF-8', '-d', str(tmp), *map(str, tmp.rglob('*.java'))], check=True)
    subprocess.run(['java', '-cp', str(tmp), 'com.reactnativecommunity.webview.OttProbe'], check=True)
    # Exercise the actual Foundation-only scope class on macOS, without WebKit.
    if shutil.which('xcrun'):
        start = objc.index('@interface XamanOttScope :')
        impl = objc.index('@implementation XamanOttScope', start)
        end = objc.index('@end', impl) + len('@end')
        probe = tmp / 'ScopeProbe.m'
        probe.write_text('#import <Foundation/Foundation.h>\n' + objc[start:end] + '''
int main() { @autoreleasepool {
 if ([XamanOttScope sameSite:@"app.wallet.co.in" asHost:@"collector.unrelated.co.in"] ||
     [XamanOttScope sameSite:@"wallet.onrender.com" asHost:@"unrelated.onrender.com"] ||
     [XamanOttScope sameSite:@"a.foo.ck" asHost:@"b.foo.ck"] ||
     [XamanOttScope sameSite:@"app.a.公司.cn" asHost:@"collector.b.公司.cn"] ||
     ![XamanOttScope sameSite:@"a.www.ck" asHost:@"b.www.ck"]) return 1;
 puts("Objective-C: suffix/wildcard/exception scope passed");
} return 0; }
''')
        subprocess.run(['xcrun', 'clang', '-fobjc-arc', '-w', '-framework', 'Foundation',
                        str(probe), '-o', str(tmp / 'scope-probe')], check=True)
        subprocess.run([str(tmp / 'scope-probe')], check=True)
