#!/usr/bin/env python3
# Regression proof on regular iPhones: the same set-up flow with a build of the app on a freshly erased simulator, and
# a screenshot of each screen. Run it with two builds (label "old" and "new"), then compare with
# compare-screens-diff.py. See docs/testing.md ("Screens on regular iPhones, old against new").
#
#   scripts/e2e/compare-screens.py <simulator name> <label> <path to a Release-iphonesimulator Xaman.app>
#
# THE SIMULATOR IS ERASED: give it a simulator made for this (xcrun simctl create cmp-se "iPhone SE (3rd generation)").
# Needs WebDriverAgent built for the simulator in $E2E_WDA_DIR (default $E2E_WORK/wda, as scripts/e2e/run-throwaway.sh
# uses it), with derived data in "dd-sim":
#   xcodebuild build-for-testing -project package/WebDriverAgent.xcodeproj -scheme WebDriverAgentRunner \\
#     -destination "generic/platform=iOS Simulator" -derivedDataPath dd-sim CODE_SIGNING_ALLOWED=NO
import json, os, subprocess, sys, time, urllib.request

SIM, LABEL, APP = sys.argv[1], sys.argv[2], sys.argv[3]
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.environ.get("E2E_WORK", os.path.expanduser("~/Code/e2e-runs"))
WDA_DIR = os.environ.get("E2E_WDA_DIR", os.path.join(WORK, "wda"))
OUT = os.path.join(os.environ.get("E2E_COMPARE_DIR", os.path.join(WORK, "screen-compare")), SIM, LABEL)
os.makedirs(OUT, exist_ok=True)
WDA = "http://localhost:8100"
BUNDLE = "com.xrpllabs.xumm"

def sh(*args, check=True):
    return subprocess.run(args, capture_output=True, text=True, check=check).stdout.strip()

def udid():
    for line in sh("xcrun", "simctl", "list", "devices").split("\n"):
        if f" {SIM} (" in line:
            return line.split("(")[1].split(")")[0]
    raise SystemExit("no simulator " + SIM)

def call(method, path, body=None, timeout=240):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(WDA + path, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode()).get("value")

U = udid()
passcode = sh("node", "-e", "console.log(require(process.argv[1]).getCurrentTestPasscode())", os.path.join(REPO, "e2e", "helpers", "testCredentials.js"))

# a fresh simulator, a fixed status bar
sh("xcrun", "simctl", "shutdown", U, check=False)
sh("xcrun", "simctl", "erase", U)
sh("xcrun", "simctl", "boot", U)
sh("xcrun", "simctl", "bootstatus", U, "-b")
sh("xcrun", "simctl", "status_bar", U, "override", "--time", "9:41", "--batteryState", "charged", "--batteryLevel", "100", "--wifiBars", "3", "--cellularBars", "4", check=False)
sh("xcrun", "simctl", "ui", U, "appearance", "light", check=False)
time.sleep(20)  # a new simulator is busy for a while after its first start
sh("xcrun", "simctl", "install", U, APP)

# WebDriverAgent for this simulator
subprocess.run("pkill -f 'xcodebuild test-without-building -project package/WebDriverAgent' ; true", shell=True)
time.sleep(2)
log = open(os.path.join(OUT, "wda.log"), "w")
wda = subprocess.Popen(["xcodebuild", "test-without-building", "-project", "package/WebDriverAgent.xcodeproj", "-scheme", "WebDriverAgentRunner", "-destination", f"id={U}", "-derivedDataPath", "dd-sim"],
                       cwd=WDA_DIR, stdout=log, stderr=log)
for _ in range(60):
    try:
        if call("GET", "/status", timeout=3).get("ready"): break
    except Exception:
        pass
    time.sleep(3)
else:
    raise SystemExit("WebDriverAgent did not start")

sid = None
def session():
    # the app is started by simctl; the session works on the app in front and does not wait for it to be idle
    global sid
    sh("xcrun", "simctl", "launch", U, BUNDLE)
    time.sleep(6)
    body = {"capabilities": {"alwaysMatch": {"shouldWaitForQuiescence": False}}}
    req = urllib.request.Request(WDA + "/session", data=json.dumps(body).encode(), method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        sid = json.loads(r.read().decode())["sessionId"]
    try:
        call("POST", f"/session/{sid}/appium/settings", {"settings": {"waitForIdleTimeout": 0, "animationCoolOffTimeout": 0, "snapshotMaxDepth": 60}})
    except Exception as e:
        print("settings:", e)

def find(tid):
    v = call("POST", f"/session/{sid}/elements", {"using": "accessibility id", "value": tid})
    return v[0]["ELEMENT"] if isinstance(v, list) and v else None

def wait(tid, seconds=40):
    end = time.time() + seconds
    while time.time() < end:
        e = find(tid)
        if e: return e
        time.sleep(1)
    return None

def tap(tid, seconds=40):
    e = wait(tid, seconds)
    if not e: raise SystemExit(f"{LABEL}: no element {tid}")
    call("POST", f"/session/{sid}/element/{e}/click", {})

n = [0]
def shot(name, settle=2.5):
    time.sleep(settle)
    n[0] += 1
    path = os.path.join(OUT, f"{n[0]:02d}-{name}.png")
    sh("xcrun", "simctl", "io", U, "screenshot", path)
    print(f"{LABEL} {n[0]:02d}-{name}", flush=True)

def type_passcode():
    wait(f"{passcode[0]}-key", 20)
    for d in passcode:
        tap(f"{d}-key", 10)
        time.sleep(0.25)

session()
if not wait("start-button", 120):
    # a first start on a new simulator can take long: start the app once more
    sh("xcrun", "simctl", "terminate", U, BUNDLE, check=False); time.sleep(2)
    session()
    if not wait("start-button", 180): raise SystemExit(f"{LABEL}: onboarding did not show")
shot("onboarding", 4)
tap("start-button")
wait("pin-code-explanation-view"); shot("passcode-explanation")
tap("go-button")
wait("pin-code-entry-view"); shot("passcode-entry")
type_passcode(); shot("passcode-typed", 1.5)
tap("next-button"); time.sleep(1.5); shot("passcode-repeat")
type_passcode(); tap("next-button")
# the set-up questions that show on this simulator
for _ in range(4):
    time.sleep(3)
    if find("agreement-setup-screen"): break
    for q in ("biometric-setup-view", "push-notification-setup-view"):
        if find(q): shot(q, 1)
    for b in ("skip-button", "maybe-later-button"):
        e = find(b)
        if e:
            call("POST", f"/session/{sid}/element/{e}/click", {})
            break
if not wait("agreement-setup-screen", 60): raise SystemExit(f"{LABEL}: no agreement screen")
shot("agreement", 6)
e = wait("confirm-button", 60)
for _ in range(60):
    if call("GET", f"/session/{sid}/element/{e}/enabled"): break
    time.sleep(1)
shot("agreement-ready", 1)
call("POST", f"/session/{sid}/element/{e}/click", {})
if not wait("home-tab-empty-view", 60): raise SystemExit(f"{LABEL}: no home screen")
shot("home-empty", 5)
tap("tab-Settings"); wait("settings-tab-screen"); shot("settings")
tap("tab-Events"); shot("events", 4)
tap("tab-XApps"); shot("xapps-tab-bar-only", 6)
tap("tab-Home"); wait("home-tab-empty-view"); shot("home-again", 2)
tap("tab-Settings"); wait("settings-tab-screen")
tap("advanced-button"); wait("advanced-settings-screen"); shot("settings-advanced")
# the lock screen: the app comes back from the home screen of iOS after the lock time, or on a new start
sh("xcrun", "simctl", "terminate", U, BUNDLE, check=False); time.sleep(1)
session()
if wait("virtual-keyboard", 30): shot("lock", 3)
wda.terminate()
print(f"{LABEL} done", flush=True)
