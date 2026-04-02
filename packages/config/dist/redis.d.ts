type App = "community" | "portal";
/**
 * Creates a namespaced Redis key to ensure namespace isolation between apps.
 *
 * @example
 * createRedisKey("community", "session", "abc") // "community:session:abc"
 * createRedisKey("portal", "session", "abc")    // "portal:session:abc"
 */
declare function createRedisKey(app: App, domain: string, id: string): string;

export { createRedisKey };
