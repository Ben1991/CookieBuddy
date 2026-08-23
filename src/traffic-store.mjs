/**
 * Serialize per-key traffic mutations so concurrent request events cannot
 * overwrite one another in the storage adapter.
 */
export function createSerializedTrafficStore({ read, write, remove, limit, queueKey = (key) => key }) {
  if (typeof read !== "function" || typeof write !== "function" || typeof remove !== "function") {
    throw new TypeError("traffic store requires read, write, and remove functions");
  }
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("traffic store limit must be a positive integer");

  const queues = new Map();

  function keyFor(value) {
    return String(value);
  }

  function enqueue(key, operation) {
    const previous = queues.get(key) || Promise.resolve();
    const queued = previous.catch(() => {}).then(operation);
    queues.set(key, queued);
    queued.finally(() => {
      if (queues.get(key) === queued) queues.delete(key);
    }).catch(() => {});
    return queued;
  }

  return {
    append(keyValue, entry, { accept = () => true } = {}) {
      const key = keyFor(keyValue);
      return enqueue(queueKey(key), async () => {
        if (!accept()) return null;
        const current = await read(key);
        const traffic = Array.isArray(current) ? current : [];
        const next = [...traffic, entry].slice(-limit);
        await write(key, next);
        return next;
      });
    },

    async snapshot(keyValue) {
      const key = keyFor(keyValue);
      return enqueue(queueKey(key), async () => {
        const current = await read(key);
        return Array.isArray(current) ? [...current] : [];
      });
    },

    clear(keyValue) {
      const key = keyFor(keyValue);
      return enqueue(queueKey(key), async () => {
        await remove(key);
        return [];
      });
    },

    async waitForAll() {
      await Promise.all(Array.from(queues.values(), (pending) => pending.catch(() => {})));
    }
  };
}
