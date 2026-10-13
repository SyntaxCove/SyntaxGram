// Left navigation sidebar: Dashboard / Instagram / Downloads / Queue /
// Failed / History / Settings. Shows a pending-jobs badge, collapses to an
// icon rail and carries the app version in its footer. The active page id
// lives in the ui store.

import {
  AlertCircle,
  AtSign,
  Camera,
  ChevronLeft,
  Download,
  History,
  LayoutDashboard,
  ListOrdered,
  Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SIDEBAR_W_COLLAPSED } from '../../../shared/layout';
import { useDownloadsStore } from '../stores/downloads';
import { useUiStore } from '../stores/ui';
import type { PageId } from '../stores/ui';

interface NavItem {
  id: PageId;
  label: string;
  icon: LucideIcon;
}

const ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'instagram', label: 'Instagram', icon: AtSign },
  { id: 'downloads', label: 'Downloads', icon: Download },
  { id: 'queue', label: 'Queue', icon: ListOrdered },
  { id: 'failed', label: 'Failed', icon: AlertCircle },
  { id: 'history', label: 'History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const page = useUiStore((s) => s.page);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const setPage = useUiStore((s) => s.setPage);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const stats = useDownloadsStore((s) => s.stats);
  const pending = (stats?.active ?? 0) + (stats?.queued ?? 0) + (stats?.failed ?? 0);

  return (
    <nav
      className="flex shrink-0 flex-col border-r border-line bg-surface py-3 transition-[width] duration-200"
      style={{ width: collapsed ? SIDEBAR_W_COLLAPSED : 240 }}
    >
      <div className="flex flex-1 flex-col gap-0.5 px-2">
        {ITEMS.map((item) => {
          const active = page === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              title={collapsed ? item.label : undefined}
              onClick={() => setPage(item.id)}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                active ? 'bg-app text-t1' : 'text-t2 hover:bg-app hover:text-t1'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              {active ? <span className="igd-gradient absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full" /> : null}
              <Icon size={17} className={item.id === 'instagram' && active ? 'text-brand-2' : ''} />
              {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
              {!collapsed && item.id === 'downloads' && pending > 0 && (
                <span className="rounded-full bg-brand-2/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-2">{pending}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-col gap-0.5 px-2">
        <button
          type="button"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={toggleSidebar}
          className="flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-t3 transition-colors hover:bg-app hover:text-t1"
        >
          <ChevronLeft size={17} className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
          {!collapsed && <span className="flex-1 text-left">Collapse</span>}
        </button>
        <div className={`mt-1 flex items-center gap-2 px-3 text-[10px] text-t4 ${collapsed ? 'justify-center' : ''}`}>
          <Camera size={11} />
          {!collapsed && <span>Unofficial client · v0.2.3</span>}
        </div>
      </div>
    </nav>
  );
}
