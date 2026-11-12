/**
 * A problem found while validating a project or generating output.
 *
 * Errors block the export of G-code. Warnings are shown to the user but do
 * not block anything.
 */
export interface Issue {
  severity: 'error' | 'warning';
  /** Stable machine-readable identifier, e.g. `workArea.originOutside`. */
  code: string;
  /** Human-readable description in English. */
  message: string;
}

export function error(code: string, message: string): Issue {
  return { severity: 'error', code, message };
}

export function warning(code: string, message: string): Issue {
  return { severity: 'warning', code, message };
}

export function hasErrors(issues: readonly Issue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}
