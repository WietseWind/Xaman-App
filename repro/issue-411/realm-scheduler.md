# Android Realm notification scheduling

An Android account-import E2E run stopped with a native `SIGSEGV` at address
`0x60`. Matching native symbols identify this path:

```text
Realm DaemonThread::listen
  → RealmCoordinator::on_change
  → WeakRealmNotifier::notify
  → ReactScheduler::invoke
  → RuntimeSchedulerCallInvoker::invokeAsync(priority, callback)
  → RuntimeScheduler_Legacy::scheduleTask
  → TaskPriorityComparer
```

The daemon is a background commit-notification thread. Its displayed thread name
does not establish that it is React Native's JS executor thread.

The installed versions have incompatible scheduling requirements at this call:

- [Realm Core's Scheduler interface](https://github.com/realm/realm-core/blob/c2552e1d36867cb42b28130e894a81fc17081062/src/realm/object-store/util/scheduler.hpp#L52)
  permits `invoke()` from any thread. This Core commit is the submodule pinned by
  Realm JS 12.13.0.
- [Realm JS 12.13.0](https://github.com/realm/realm-js/blob/v12.13.0/packages/realm/binding/jsi/react_scheduler.cpp#L57)
  directly uses the normal-priority invoker overload.
- [React Native 0.74.2's invoker](https://github.com/react/react-native/blob/v0.74.2/packages/react-native/ReactCommon/react/renderer/runtimescheduler/RuntimeSchedulerCallInvoker.cpp#L19)
  routes ordinary async work through the runtime executor, but routes the priority
  overload directly into `scheduleTask()`.
- [The legacy scheduler contract](https://github.com/react/react-native/blob/v0.74.2/packages/react-native/ReactCommon/react/renderer/runtimescheduler/RuntimeScheduler_Legacy.h#L50)
  requires external synchronization for priority-queue access.
- [The base CallInvoker priority overload](https://github.com/react/react-native/blob/v0.74.2/packages/react-native/ReactCommon/callinvoker/ReactCommon/CallInvoker.h#L26)
  falls back to ordinary async dispatch when priority scheduling is unsupported.

The Realm patch now enters the ordinary JS queue first on Android, then requests
normal priority from that thread. It retains the current notification priority
and captures the invoker for the first hop. The non-Android branch keeps the
original one-hop call. The existing 16 KB linker-alignment patch is retained.

Task ownership remains the upstream released-pointer contract: reconstruct and
destroy the move-only task only when its JS callback executes. Dropped tasks keep
the upstream behavior. This change does not introduce task destruction after a
runtime has shut down.

## Host regression check

```sh
python3 scripts/test-realm-scheduler-native.py
```

The check compiles the actual installed `react_scheduler.cpp`, Realm Core's real
move-only `UniqueFunction`, and React Native's real `CallInvoker` headers. Only
the platform Scheduler and runtime queues are host doubles. It checks Android
background-to-JS-to-normal dispatch, non-Android one-hop dispatch, priority
fallback, exact-once execution, owner-thread execution, scheduler reset, invoker
lifetime, exceptions, and unchanged dropped-task ownership.

For the before/after proof, pass `--baseline-root` with a pristine Realm 12.13.0
package directory and `--realm-root` with the patched directory. The pristine
Android bridge must fail the owner-thread priority check; both patched platform
modes must pass. Source/header hashes are included in the JSON report.

This is a deterministic API-contract check. It does not run Hermes, open wallet
storage, reproduce the native queue race itself, or replace native E2E checks.

Refs #411.
