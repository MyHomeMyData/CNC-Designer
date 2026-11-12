import type { Job, ProgramEnd } from '../toolpath/index.ts';

/** Everything that goes into one G-code file: the jobs of a single tool. */
export interface Program {
  readonly name: string;
  readonly toolName: string;
  readonly jobs: readonly Job[];
  readonly end: ProgramEnd;
}

/**
 * Split jobs into one program per tool, since tools are changed by hand
 * between programs. Programs appear in the order their tool is first used;
 * within a program the jobs keep their order.
 */
export function groupJobsByTool(
  projectName: string,
  jobs: readonly Job[],
  end: ProgramEnd,
): Program[] {
  const byTool = new Map<string, Job[]>();
  for (const job of jobs) {
    const list = byTool.get(job.operation.toolName);
    if (list) list.push(job);
    else byTool.set(job.operation.toolName, [job]);
  }
  return [...byTool.entries()].map(([toolName, toolJobs]) => ({
    name: projectName,
    toolName,
    jobs: toolJobs,
    end,
  }));
}
