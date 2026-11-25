package androidx.lifecycle;
public class Lifecycle {
    public enum State {
        DESTROYED, INITIALIZED, CREATED, STARTED, RESUMED;
        public boolean isAtLeast(State state) { return compareTo(state) >= 0; }
    }
    public State state = State.RESUMED;
    public State getCurrentState() { return state; }
}
