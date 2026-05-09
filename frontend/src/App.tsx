import { useState } from 'react';

import { Analytics } from './pages/Analytics';
import { Dashboard } from './pages/Dashboard';
import { MatchLab } from './pages/MatchLab';
import { Players } from './pages/Players';
import { SavedMatches } from './pages/SavedMatches';

type PageKey = 'dashboard' | 'players' | 'match-lab' | 'saved-matches' | 'analytics';

type NavItem = {
  key: PageKey;
  label: string;
};

const navItems: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'players', label: 'Players' },
  { key: 'match-lab', label: 'Match Lab' },
  { key: 'saved-matches', label: 'Saved Matches' },
  { key: 'analytics', label: 'Analytics' },
];

function renderPage(activePage: PageKey, setActivePage: (page: PageKey) => void) {
  switch (activePage) {
    case 'players':
      return <Players />;
    case 'match-lab':
      return <MatchLab onOpenPlayers={() => setActivePage('players')} onOpenSavedMatches={() => setActivePage('saved-matches')} />;
    case 'saved-matches':
      return <SavedMatches onOpenAnalytics={() => setActivePage('analytics')} />;
    case 'analytics':
      return <Analytics />;
    case 'dashboard':
    default:
      return <Dashboard />;
  }
}

export function App() {
  const [activePage, setActivePage] = useState<PageKey>('dashboard');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">SML</div>
          <div>
            <span>Squash</span>
            <strong>Match Lab</strong>
          </div>
        </div>

        <nav aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              className={item.key === activePage ? 'nav-link nav-link--active' : 'nav-link'}
              key={item.key}
              onClick={() => setActivePage(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="content-panel">{renderPage(activePage, setActivePage)}</main>
    </div>
  );
}
