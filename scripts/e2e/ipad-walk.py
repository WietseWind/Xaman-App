#!/usr/bin/env python3
# The app on an iPad (issue 553, docs/ipad.md): one walk through the app on an iPad simulator, with a picture of each
# step. Run it with two builds (label "old" and "new") to compare them.
#
#   scripts/e2e/ipad-walk.py <simulator name> <label> <path to a Release-iphonesimulator Xaman.app> [update app]
#
# The walk: fresh install, set-up, the lock screen, the window as small as the system lets it be (and a start of the
# app in it), as large as it lets it be, landscape while the app runs, a start in landscape, back to portrait, the
# lock screen while the iPad turns. With "update app": that build is then installed over the first one and started,
# as on an update from the App Store (the system keeps the window of the app).
#
# THE SIMULATOR IS ERASED: give it a simulator made for this, for example
#   xcrun simctl create walk-ipad "iPad (A16)" com.apple.CoreSimulator.SimRuntime.iOS-27-2
# Everything goes through WebDriverAgent (touches of the system; the resize handle of the window is an element of
# the system), so it works with a Release build. WebDriverAgent as for compare-screens.py: built for the simulator in
# $E2E_WDA_DIR (default $E2E_WORK/wda), derived data in "dd-sim".
# Pictures: $E2E_COMPARE_DIR/ipad-walk/<simulator>/<label>/ (default $E2E_WORK/screen-compare/...).
import json, os, subprocess, sys, time, urllib.request

SIM, LABEL, APP = sys.argv[1], sys.argv[2], sys.argv[3]
UPDATE = sys.argv[4] if len(sys.argv) > 4 else None
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.environ.get("E2E_WORK", os.path.expanduser("~/Code/e2e-runs"))
WDA_DIR = os.environ.get("E2E_WDA_DIR", os.path.join(WORK, "wda"))
OUT = os.path.join(os.environ.get("E2E_COMPARE_DIR", os.path.join(WORK, "screen-compare")), "ipad-walk", SIM, LABEL)
os.makedirs(OUT, exist_ok=True)
PORT = os.environ.get("E2E_WDA_PORT", "8100")
WDA = "http://localhost:" + PORT
BUNDLE = "com.xrpllabs.xumm"

def sh(*a, check=True): return subprocess.run(a, capture_output=True, text=True, check=check).stdout.strip()
def call(method, path, body=None, timeout=240):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(WDA + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r: return json.loads(r.read().decode()).get("value")
    except urllib.error.HTTPError as e: return json.loads(e.read().decode()).get("value")
def udid():
    for line in sh("xcrun", "simctl", "list", "devices").split("\n"):
        if f" {SIM} (" in line: return line.split("(")[1].split(")")[0]
    raise SystemExit("no simulator " + SIM)

U = udid()
passcode = sh("node", "-e", "console.log(require(process.argv[1]).getCurrentTestPasscode())", os.path.join(REPO, "e2e", "helpers", "testCredentials.js"))

# a fresh simulator
sh("xcrun", "simctl", "shutdown", U, check=False)
sh("xcrun", "simctl", "erase", U)
sh("xcrun", "simctl", "boot", U)
sh("xcrun", "simctl", "bootstatus", U, "-b")

time.sleep(60)  # a simulator that was erased is busy for a while after its first start: an install can fail

# WebDriverAgent for this simulator (its install can fail on a simulator that is still busy: three tries)
log = open(os.path.join(OUT, "wda.log"), "w")
def start_wda():
    return subprocess.Popen(["xcodebuild", "test-without-building", "-project", "package/WebDriverAgent.xcodeproj", "-scheme", "WebDriverAgentRunner",
                             "-destination", f"id={U}", "-derivedDataPath", "dd-sim", f"USE_PORT={PORT}"],
                            cwd=WDA_DIR, stdout=log, stderr=log, env={**os.environ, "USE_PORT": PORT})
def wda_ready():
    try: return json.loads(urllib.request.urlopen(WDA + "/status", timeout=3).read().decode())["value"].get("ready")
    except Exception: return False
wda = None
for _ in range(3):
    wda = start_wda()
    for _ in range(60):
        if wda_ready() or wda.poll() is not None: break
        time.sleep(3)
    if wda_ready(): break
    wda.terminate(); time.sleep(5)
else: raise SystemExit("WebDriverAgent did not start")
req = urllib.request.Request(WDA + "/session", data=json.dumps({"capabilities": {"alwaysMatch": {"shouldWaitForQuiescence": False}}}).encode(), method="POST", headers={"Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=120) as r: sid = json.loads(r.read().decode())["sessionId"]
S = "/session/" + sid
def app_mode(on):
    call("POST", S + "/appium/settings", {"settings": {"waitForIdleTimeout": 0, "animationCoolOffTimeout": 0, "snapshotMaxDepth": 60, "defaultActiveApplication": BUNDLE if on else "auto"}})
app_mode(True)
def find(tid):
    v = call("POST", S + "/elements", {"using": "accessibility id", "value": tid})
    return v[0]["ELEMENT"] if isinstance(v, list) and v else None
def wait(tid, seconds=40):
    end = time.time() + seconds
    while time.time() < end:
        e = find(tid)
        if e: return e
        time.sleep(1)
def tap(tid, seconds=40):
    e = wait(tid, seconds)
    if not e: raise RuntimeError("no element " + tid)
    call("POST", S + f"/element/{e}/click", {})
def tap_to(tid, then, tries=4):
    # a tap during the change of a screen can be lost: tap again until the next screen is there
    for _ in range(tries):
        if find(tid): tap(tid, 10)
        if wait(then, 8): return
    raise RuntimeError("no " + then + " after " + tid)
def typepc():
    if not wait(f"{passcode[0]}-key", 40): raise RuntimeError("no pin pad")
    for d in passcode: tap(f"{d}-key", 10); time.sleep(0.3)
def shot(name):
    time.sleep(2.5)
    p = os.path.join(OUT, name + ".png")
    sh("xcrun", "simctl", "io", U, "screenshot", p, check=False)
    print("shot", name, "app window", window(), flush=True)
def window():
    v = call("POST", S + "/elements", {"using": "class name", "value": "XCUIElementTypeWindow"})
    if isinstance(v, list) and v:
        r = call("GET", S + f"/element/{v[0]['ELEMENT']}/rect"); return (r.get("width"), r.get("height")) if isinstance(r, dict) else None
def system(using, value):
    # an element of the system (SpringBoard): the card of the app window, its resize handle
    app_mode(False); call("POST", S + "/appium/settings", {"settings": {"defaultActiveApplication": "com.apple.springboard"}})
    try:
        v = call("POST", S + "/elements", {"using": using, "value": value})
        if isinstance(v, list) and v:
            r = call("GET", S + f"/element/{v[0]['ELEMENT']}/rect")
            return r if isinstance(r, dict) else None
    finally:
        app_mode(True)
def resize(to_x, to_y):
    g = system("accessibility id", "resize-grabber")
    if not g: raise RuntimeError("no resize handle")
    drag(g["x"] + g["width"] / 2.0, g["y"] + g["height"] / 2.0, to_x, to_y)
def screen():
    # the screen of the device in points (the window size of the session is that of the app window)
    r = call("GET", S + "/wda/screen"); s = r.get("screenSize") or {}
    return s.get("width"), s.get("height")
def rotate(o):
    call("POST", S + "/orientation", {"orientation": o}); time.sleep(4)
def drag(x1, y1, x2, y2):
    # touches of the system in screen points: the window handle is not a part of the app
    call("POST", S + "/wda/dragfromtoforduration", {"fromX": x1, "fromY": y1, "toX": x2, "toY": y2, "duration": 1.5}); time.sleep(3)
def relaunch():
    sh("xcrun", "simctl", "terminate", U, BUNDLE, check=False); time.sleep(1.5)
    sh("xcrun", "simctl", "launch", U, BUNDLE); time.sleep(8)
def step(name, fn):
    try: fn()
    except Exception as e:
        print("STEP FAILED", name, repr(e)[:200], flush=True)
        sh("xcrun", "simctl", "io", U, "screenshot", os.path.join(OUT, "failed-" + name.replace(" ", "-") + ".png"), check=False)

rotate("PORTRAIT")
sh("xcrun", "simctl", "terminate", U, BUNDLE, check=False); sh("xcrun", "simctl", "uninstall", U, BUNDLE, check=False)
sh("xcrun", "simctl", "install", U, APP); sh("xcrun", "simctl", "launch", U, BUNDLE)
time.sleep(20)  # a new simulator is busy for a while after its first start
if not wait("start-button", 40):
    # the first start of the app on a new simulator can stay on the splash: start it again
    relaunch()
    if not wait("start-button", 120): raise SystemExit("onboarding did not show")
W, H = screen(); w0, h0 = window(); print("screen", W, H, "window", w0, h0, flush=True)
shot("01-start")
def setup():
    tap_to("start-button", "pin-code-explanation-view"); tap_to("go-button", "pin-code-entry-view")
    shot("02-set-passcode")
    typepc(); tap("next-button"); time.sleep(1.5); typepc(); tap("next-button")
    for _ in range(4):
        time.sleep(3)
        if find("agreement-setup-screen"): break
        for b in ("skip-button", "maybe-later-button"):
            e = find(b)
            if e: call("POST", S + f"/element/{e}/click", {}); break
    if not wait("agreement-setup-screen", 60): raise RuntimeError("no agreement screen")
    e = wait("confirm-button", 60)
    for _ in range(60):
        if call("GET", S + f"/element/{e}/enabled"): break
        time.sleep(1)
    call("POST", S + f"/element/{e}/click", {})
    if not wait("home-tab-empty-view", 60): raise RuntimeError("no home")
    shot("03-home")
setup()
unlocked_at = time.time()
def lock(name):
    # the app asks for the passcode again after it was away for the lock time (1 minute)
    sh("xcrun", "simctl", "terminate", U, BUNDLE, check=False)
    time.sleep(max(2.0, 70.0 - (time.time() - unlocked_at)))
    sh("xcrun", "simctl", "launch", U, BUNDLE); time.sleep(8)
    if not wait(f"{passcode[0]}-key", 60): raise RuntimeError("no lock screen")
    shot(name)
def unlock(name):
    global unlocked_at
    typepc()
    if not wait("home-tab-empty-view", 60): raise RuntimeError("no home after unlock")
    unlocked_at = time.time()
    shot(name)
step("lock", lambda: lock("04-lock"))
step("unlock", lambda: unlock("05-home-unlocked"))
# The handle in the lower right corner of the window: as small as the system lets it be, a start in that window,
# then as large as it lets it be.
def small():
    resize(150, 150); shot("06-home-small-window")
step("small", small)
step("lock small", lambda: lock("07-lock-small-window"))
step("unlock small", lambda: unlock("08-home-small-window-started"))
def large():
    resize(W - 20, H - 30); shot("09-home-large-window")
step("large", large)
def landscape():
    rotate("LANDSCAPE"); shot("10-home-landscape")
step("landscape", landscape)
step("lock landscape", lambda: lock("11-lock-landscape-started"))
step("unlock landscape", lambda: unlock("12-home-landscape-started"))
def portrait():
    rotate("PORTRAIT"); shot("13-home-portrait-again")
step("portrait", portrait)
def lock_turn():
    lock("14-lock-portrait"); rotate("LANDSCAPE"); shot("15-lock-turned-to-landscape"); rotate("PORTRAIT")
step("lock turn", lock_turn)
if UPDATE:
    def update():
        sh("xcrun", "simctl", "terminate", U, BUNDLE, check=False)
        sh("xcrun", "simctl", "install", U, UPDATE)
        lock("20-after-update-lock"); unlock("21-after-update-home")
        rotate("LANDSCAPE"); shot("22-after-update-home-landscape"); rotate("PORTRAIT")
        resize(150, 150); shot("23-after-update-home-small-window")
        resize(W - 20, H - 30); shot("24-after-update-home-large-window")
    step("update", update)
print("done:", OUT, flush=True)
wda.terminate()
sh("xcrun", "simctl", "shutdown", U, check=False)
