/**
 * Which cargo door is open right now, per doors obstacle: obstacle id -> lane (metres
 * right of the road centre). Written by the obstacle sim when it re-rolls a gantry,
 * read by the CPU racers so they drive through the open door. A tiny module of its own
 * so the bots (main chunk) don't pull the obstacle sim (stage chunk) in.
 */
export const doorLanes = new Map()
