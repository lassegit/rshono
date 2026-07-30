import { run } from './proc.mjs';

/**
 * Resident memory of a process *and its children*. `next start` and `vite preview` both fork, so
 * reading the RSS of the pid we spawned would undercount them and flatter whichever framework
 * pushes the most work into a child.
 */
export async function treeRss(rootPid) {
  const { code, stdout, error } = await run('ps', ['-eo', 'pid=,ppid=,rss=']);
  // Some sandboxes deny spawning `ps`. Memory is then simply not reported rather than failing a run
  // whose other metrics are fine.
  if (code !== 0 || error) return null;

  const children = new Map();
  const rss = new Map();
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/);
    if (!m) continue;
    const [, pid, ppid, kb] = m.map(Number);
    rss.set(pid, kb * 1024);
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid).push(pid);
  }
  if (!rss.has(rootPid)) return null;

  let total = 0;
  let count = 0;
  const stack = [rootPid];
  const seen = new Set();
  while (stack.length) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    total += rss.get(pid) ?? 0;
    count += 1;
    stack.push(...(children.get(pid) ?? []));
  }
  return { bytes: total, processes: count };
}
