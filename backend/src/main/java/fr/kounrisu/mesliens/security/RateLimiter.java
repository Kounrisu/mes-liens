package fr.kounrisu.mesliens.security;

import java.time.Clock;
import java.util.concurrent.ConcurrentHashMap;

/** Fenêtre fixe d'une minute, par clé (IP). En mémoire : suffisant pour un VPS à un seul processus. */
public class RateLimiter {

    private record Window(long minute, int count) {}

    private final int limit;
    private final Clock clock;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    public RateLimiter(int limit, Clock clock) {
        this.limit = limit;
        this.clock = clock;
    }

    /** Compte un appel ; retourne false si la limite de la minute courante est dépassée. */
    public boolean tryAcquire(String key) {
        long minute = clock.millis() / 60_000;
        if (windows.size() > 10_000) {
            windows.entrySet().removeIf(e -> e.getValue().minute() < minute);
        }
        Window w = windows.merge(key, new Window(minute, 1),
                (old, fresh) -> old.minute() == minute ? new Window(minute, old.count() + 1) : fresh);
        return w.count() <= limit;
    }

    /** Dépassement sans compter (pour tester l'état d'un bannissement temporaire). */
    public boolean isBlocked(String key) {
        Window w = windows.get(key);
        return w != null && w.minute() == clock.millis() / 60_000 && w.count() >= limit;
    }
}
