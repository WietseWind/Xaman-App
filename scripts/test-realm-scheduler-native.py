#!/usr/bin/env python3
"""Compile the installed Realm bridge with real UniqueFunction/CallInvoker headers.

The platform Scheduler and runtime queues are controlled host doubles. This tests
the cross-thread API boundary, priority and upstream task ownership; it
does not run Hermes, open a Realm file or claim to reproduce a native data race.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


SCHEDULER_HEADER = r"""
#pragma once
#include <memory>
#include <realm/util/functional.hpp>
namespace realm::util {
class Scheduler {
public:
    virtual ~Scheduler() = default;
    virtual void invoke(UniqueFunction<void()>&&) = 0;
    virtual bool is_on_thread() const noexcept = 0;
    virtual bool is_same_as(const Scheduler*) const noexcept = 0;
    virtual bool can_invoke() const noexcept = 0;
    using Factory = std::shared_ptr<Scheduler>(*)();
    static inline Factory factory = nullptr;
    static void set_default_factory(Factory value) { factory = value; }
    static std::shared_ptr<Scheduler> make_default() { return factory(); }
    static std::shared_ptr<Scheduler> make_platform_default() { return nullptr; }
};
}
"""

HARNESS = r"""
#include "react_scheduler.h"
#include <realm/object-store/util/scheduler.hpp>
#include <atomic>
#include <deque>
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

using facebook::react::CallFunc;
using facebook::react::CallInvoker;
using facebook::react::SchedulerPriority;
using realm::util::Scheduler;
using realm::util::UniqueFunction;
#ifdef __ANDROID__
constexpr bool android_mode = true;
#else
constexpr bool android_mode = false;
#endif

struct Queues {
    const std::thread::id owner = std::this_thread::get_id();
    std::mutex mutex;
    std::deque<CallFunc> ingress;
    std::deque<CallFunc> priority;
    std::atomic<int> ingress_calls{0}, priority_calls{0}, unsafe_priority{0}, wrong_priority{0};
    bool accept_ingress = true, accept_priority = true;

    void drain_ingress() {
        std::deque<CallFunc> batch;
        { std::lock_guard<std::mutex> lock(mutex); batch.swap(ingress); }
        for (auto& callback : batch) callback();
    }
    void drain_all() {
        for (int round = 0; round < 8; ++round) {
            drain_ingress();
            std::deque<CallFunc> batch;
            { std::lock_guard<std::mutex> lock(mutex); batch.swap(priority); }
            for (auto& callback : batch) callback();
            std::lock_guard<std::mutex> lock(mutex);
            if (ingress.empty() && priority.empty()) return;
        }
        throw std::runtime_error("Queue did not settle");
    }
    void discard() {
        std::deque<CallFunc> first, second;
        { std::lock_guard<std::mutex> lock(mutex); first.swap(ingress); second.swap(priority); }
    }
};

// Like RN's call invoker, this holds its runtime queue weakly. Capturing the
// invoker in a queued callback therefore does not make a runtime ownership cycle.
class Invoker : public CallInvoker {
public:
    explicit Invoker(std::shared_ptr<Queues> value, bool supported = android_mode)
        : queues(value), supports_priority(supported) {}
    void invokeAsync(CallFunc&& callback) noexcept override {
        if (auto state = queues.lock()) {
            ++state->ingress_calls;
            std::lock_guard<std::mutex> lock(state->mutex);
            if (state->accept_ingress) state->ingress.push_back(std::move(callback));
        }
    }
    void invokeAsync(SchedulerPriority priority, CallFunc&& callback) noexcept override {
        if (auto state = queues.lock()) {
            ++state->priority_calls;
            if (priority != SchedulerPriority::NormalPriority) ++state->wrong_priority;
            if (supports_priority) {
                if (std::this_thread::get_id() != state->owner) ++state->unsafe_priority;
                std::lock_guard<std::mutex> lock(state->mutex);
                if (state->accept_priority) state->priority.push_back(std::move(callback));
                return;
            }
        }
        // The actual RN base overload implements this fallback, not the double.
        CallInvoker::invokeAsync(priority, std::move(callback));
    }
    void invokeSync(CallFunc&& callback) override { callback(); }
private:
    std::weak_ptr<Queues> queues;
    bool supports_priority;
};

struct Counts {
    std::atomic<int> ran{0}, destroyed{0}, wrong_thread{0};
};
struct Lifetime {
    std::shared_ptr<Counts> counts;
    explicit Lifetime(std::shared_ptr<Counts> value) : counts(std::move(value)) {}
    ~Lifetime() { ++counts->destroyed; }
};
UniqueFunction<void()> work(std::shared_ptr<Counts> counts, std::thread::id owner, bool throws = false) {
    return [life = std::make_unique<Lifetime>(counts), counts, owner, throws] {
        ++counts->ran;
        if (std::this_thread::get_id() != owner) ++counts->wrong_thread;
        if (throws) throw std::runtime_error("fixture callback failure");
    };
}
struct Context {
    std::shared_ptr<Queues> queues = std::make_shared<Queues>();
    std::shared_ptr<Invoker> invoker;
    std::shared_ptr<Scheduler> scheduler;
    explicit Context(bool supports = android_mode) : invoker(std::make_shared<Invoker>(queues, supports)) {
        realm::js::react_scheduler::create_scheduler(invoker);
        scheduler = Scheduler::make_default();
    }
    void release_scheduler() {
        realm::js::react_scheduler::reset_scheduler();
        scheduler.reset(); invoker.reset();
    }
    ~Context() { release_scheduler(); queues->discard(); }
};
std::vector<std::pair<std::string, bool>> checks;
void check(const char* name, bool value) { checks.emplace_back(name, value); }
void background(Context& context, std::shared_ptr<Counts> counts) {
    auto scheduler = context.scheduler;
    auto owner = context.queues->owner;
    std::thread producer([scheduler, counts, owner] { scheduler->invoke(work(counts, owner)); });
    producer.join();
}

int main() {
    {
        Context context;
        auto counts = std::make_shared<Counts>();
        background(context, counts);
        check("background_submission_is_async", counts->ran == 0);
        check("first_hop_matches_platform", context.queues->priority_calls == (android_mode ? 0 : 1));
        context.queues->drain_all(); context.queues->drain_all();
        check("callback_runs_once_on_owner", counts->ran == 1 && counts->wrong_thread == 0);
        check("normal_priority_retained", context.queues->priority_calls == 1 && context.queues->wrong_priority == 0);
        check("priority_queue_only_touched_on_owner", context.queues->unsafe_priority == 0);
        check("work_destroyed_once_after_execution", counts->destroyed == 1);
        check("non_android_retains_one_hop", android_mode || context.queues->ingress_calls == 1);
    }
    {
        Context context(false);
        auto counts = std::make_shared<Counts>();
        background(context, counts); context.queues->drain_all();
        check("base_priority_fallback_runs_once", counts->ran == 1 && counts->destroyed == 1);
        check("fallback_hops_match_platform", context.queues->ingress_calls == (android_mode ? 2 : 1));
    }
    {
        Context context;
        auto counts = std::make_shared<Counts>();
        std::weak_ptr<Invoker> weak = context.invoker;
        background(context, counts); context.release_scheduler();
        check("android_invoker_survives_first_hop", !android_mode || !weak.expired());
        context.queues->drain_all();
        check("scheduler_reset_does_not_dangle_this", counts->ran == 1 && counts->wrong_thread == 0);
        check("invoker_released_after_delivery", weak.expired());
    }
    {
        Context context;
        auto counts = std::make_shared<Counts>();
        std::weak_ptr<Invoker> weak = context.invoker;
        background(context, counts); context.release_scheduler(); context.queues->discard();
        check("dropped_first_hop_keeps_upstream_ownership", counts->ran == 0 && counts->destroyed == 0);
        check("dropped_first_hop_releases_invoker", weak.expired());
    }
    {
        Context context;
        auto counts = std::make_shared<Counts>();
        background(context, counts);
        if (android_mode) context.queues->drain_ingress();
        context.queues->discard();
        check("dropped_final_hop_keeps_upstream_ownership", counts->ran == 0 && counts->destroyed == 0);
    }
    {
        Context context;
        auto counts = std::make_shared<Counts>();
        context.queues->accept_ingress = false;
        background(context, counts);
        check("unavailable_runtime_keeps_upstream_ownership", counts->ran == 0 && counts->destroyed == 0);
    }
    {
        Context context;
        auto counts = std::make_shared<Counts>();
        context.scheduler->invoke(work(counts, context.queues->owner, true));
        bool caught = false;
        try { context.queues->drain_all(); } catch (const std::runtime_error&) { caught = true; }
        check("throwing_work_releases_ownership", caught && counts->ran == 1 && counts->destroyed == 1);
    }
    {
        Context context;
        auto counts = std::make_shared<Counts>();
        std::vector<std::thread> producers;
        for (int i = 0; i < 4; ++i) producers.emplace_back([&] {
            for (int n = 0; n < 16; ++n) context.scheduler->invoke(work(counts, context.queues->owner));
        });
        for (auto& producer : producers) producer.join();
        context.queues->drain_all();
        check("concurrent_producers_deliver_once", counts->ran == 64 && counts->destroyed == 64);
        check("concurrent_producers_never_touch_priority_queue", context.queues->unsafe_priority == 0);
    }
    bool passed = true;
    std::cout << "{\"android\":" << (android_mode ? "true" : "false") << ",\"checks\":[";
    for (size_t i = 0; i < checks.size(); ++i) {
        if (i) std::cout << ',';
        std::cout << "{\"name\":\"" << checks[i].first << "\",\"passed\":"
                  << (checks[i].second ? "true" : "false") << '}';
        passed = passed && checks[i].second;
    }
    std::cout << "],\"passed\":" << (passed ? "true" : "false") << "}\n";
    return passed ? 0 : 1;
}
"""


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_source(realm_root, react_native_root, compiler):
    source = realm_root / "binding/jsi/react_scheduler.cpp"
    core = realm_root / "prebuilds/android/arm64-v8a/include"
    unique_function = core / "realm/util/functional.hpp"
    invoker = react_native_root / "ReactCommon/callinvoker/ReactCommon/CallInvoker.h"
    for file in (source, unique_function, invoker):
        if not file.is_file():
            raise RuntimeError("Required installed source/header is missing: " + str(file))
    report = {"source_sha256": digest(source), "unique_function_sha256": digest(unique_function),
              "call_invoker_sha256": digest(invoker), "platforms": []}
    with tempfile.TemporaryDirectory(prefix="realm-scheduler-native-") as directory:
        temp = Path(directory)
        scheduler = temp / "realm/object-store/util/scheduler.hpp"
        scheduler.parent.mkdir(parents=True)
        scheduler.write_text(SCHEDULER_HEADER)
        assertion = temp / "realm/util/assert.hpp"
        assertion.parent.mkdir(parents=True)
        assertion.write_text("#pragma once\n#include <cassert>\n#define REALM_ASSERT(value) assert(value)\n")
        program = temp / "harness.cpp"
        program.write_text(HARNESS)
        for android in (False, True):
            binary = temp / ("android-contract" if android else "ios-contract")
            command = [compiler, "-std=c++17", "-pthread", "-O1", "-DREALM_NO_CONFIG=1",
                       "-I" + str(temp), "-I" + str(core), "-I" + str(source.parent),
                       "-I" + str(react_native_root / "ReactCommon/callinvoker")]
            if android:
                command.append("-D__ANDROID__=1")
            command.extend([str(source), str(program), "-o", str(binary)])
            subprocess.run(command, check=True, capture_output=True, text=True, timeout=60)
            result = subprocess.run([str(binary)], capture_output=True, text=True, timeout=15)
            value = json.loads(result.stdout)
            value["exit_code"] = result.returncode
            report["platforms"].append(value)
    report["passed"] = all(platform["passed"] and platform["exit_code"] == 0 for platform in report["platforms"])
    return report


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--realm-root", type=Path, default=root / "node_modules/realm")
    parser.add_argument("--react-native-root", type=Path, default=root / "node_modules/react-native")
    parser.add_argument("--baseline-root", type=Path, help="Also prove a pristine source fails the Android contract")
    parser.add_argument("--json-output", type=Path)
    args = parser.parse_args()
    compiler = os.environ.get("CXX") or shutil.which("clang++") or shutil.which("g++")
    if not compiler:
        raise RuntimeError("A C++17 compiler is required")
    report = {"scope": "Actual Realm bridge/UniqueFunction and RN CallInvoker; controlled host runtime queues",
              "candidate": run_source(args.realm_root.resolve(), args.react_native_root.resolve(), compiler)}
    if args.baseline_root:
        report["baseline"] = run_source(args.baseline_root.resolve(), args.react_native_root.resolve(), compiler)
        android = next(value for value in report["baseline"]["platforms"] if value["android"])
        unsafe = next(value for value in android["checks"] if value["name"] == "priority_queue_only_touched_on_owner")
        report["baseline_reproduced_unsafe_priority"] = not unsafe["passed"] and android["exit_code"] != 0
    passed = report["candidate"]["passed"] and report.get("baseline_reproduced_unsafe_priority", True)
    report["passed"] = passed
    output = json.dumps(report, indent=2) + "\n"
    if args.json_output:
        args.json_output.write_text(output)
    print(output, end="")
    return 0 if passed else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.stderr or str(error))
