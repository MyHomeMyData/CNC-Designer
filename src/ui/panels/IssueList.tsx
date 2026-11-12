import type { Issue } from '../../core/issues.ts';

export function IssueList({ issues }: { readonly issues: readonly Issue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="issues">
      {issues.map((issue, index) => (
        <li key={index} className={issue.severity}>
          <span className="issue-kind">{issue.severity === 'error' ? 'Error' : 'Warning'}</span>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}
