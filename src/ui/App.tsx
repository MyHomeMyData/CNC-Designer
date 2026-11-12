import { APP_NAME, APP_VERSION } from '../core/version.ts';

export function App() {
  return (
    <main className="app">
      <h1>{APP_NAME}</h1>
      <p>Version {APP_VERSION}</p>
      <p>Project skeleton. No functionality yet.</p>
    </main>
  );
}
