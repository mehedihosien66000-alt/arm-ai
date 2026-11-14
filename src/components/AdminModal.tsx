import { Activity, AlertTriangle, Check, RefreshCw, Shield, Sliders, Users, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import type { ApiErrorLogItem, PlatformConfig, UserProfile } from '../types/chat';
import {
  fetchAllUsersAdminCloud,
  fetchApiErrorsAdminCloud,
  savePlatformConfigCloud,
} from '../firebase';

interface AdminModalProps {
  isOpen: boolean;
  user: User | null;
  platformConfig: PlatformConfig;
  onClose: () => void;
}

interface ServerOverviewResponse {
  ok: boolean;
  serverUptimeSec: number;
  recentErrors: Array<{
    id: string;
    route: string;
    statusCode: number;
    message: string;
    timestamp: number;
  }>;
}

export function AdminModal({
  isOpen,
  user,
  platformConfig,
  onClose,
}: AdminModalProps) {
  const [draftConfig, setDraftConfig] = useState<PlatformConfig>(platformConfig);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [cloudErrors, setCloudErrors] = useState<ApiErrorLogItem[]>([]);
  const [serverOverview, setServerOverview] = useState<ServerOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAdminData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const [userList, errorList, serverRes] = await Promise.all([
        fetchAllUsersAdminCloud(),
        fetchApiErrorsAdminCloud(),
        fetch('/api/admin/overview', {
          headers: { Authorization: `Bearer ${idToken}` },
        }).then((r) => (r.ok ? (r.json() as Promise<ServerOverviewResponse>) : null)),
      ]);
      setUsers(userList);
      setCloudErrors(errorList);
      setServerOverview(serverRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin metrics.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!isOpen) return;
    setDraftConfig(platformConfig);
    setNotice(null);
    void loadAdminData();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, platformConfig, loadAdminData, onClose]);

  if (!isOpen) return null;

  const handleSaveConfig = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await savePlatformConfigCloud(draftConfig);
      setNotice('Platform configuration saved globally.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save platform configuration.');
    } finally {
      setSaving(false);
    }
  };

  const totalRequestsAll = users.reduce((acc, u) => acc + (u.totalRequests || 0), 0);
  const totalTokensAll = users.reduce((acc, u) => acc + (u.totalTokens || 0), 0);

  const featureFlags: Array<{ key: keyof Omit<PlatformConfig, 'dailyRequestLimit'>; label: string }> = [
    { key: 'voiceEnabled', label: 'AI Voice Assistant (STT / TTS)' },
    { key: 'visionEnabled', label: 'Image & Camera Understanding' },
    { key: 'memoryEnabled', label: 'Personal AI Memory' },
    { key: 'documentsEnabled', label: 'PDF, DOCX & Document Analysis' },
    { key: 'codingModeEnabled', label: 'Dedicated Coding Mode' },
    { key: 'researchModeEnabled', label: 'Dedicated Web Research Mode' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-[#050505] border border-[#292929] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#292929]">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-[#FFFFFF] shrink-0" />
            <div>
              <h2 id="admin-modal-title" className="text-base font-semibold text-[#FFFFFF]">
                ARM AI Admin Console
              </h2>
              <p className="text-xs text-[#A0A0A0] mt-0.5">
                Platform controls, user activity, and error monitoring
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={loading}
              onClick={loadAdminData}
              aria-label="Refresh admin stats"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-[#171717] hover:bg-[#262626] border border-[#292929] text-[#FFFFFF] transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 text-[#FFFFFF] ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close admin console"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg bg-[#171717] hover:bg-[#262626] border border-[#292929] text-[#FFFFFF] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5 text-[#FFFFFF]" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {error && (
            <div role="alert" className="p-3 rounded-xl bg-[#111111] border border-red-500/40 text-xs text-red-200">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="p-3 rounded-xl bg-[#111111] border border-[#292929] text-xs text-[#FFFFFF]">
              {notice}
            </div>
          )}

          {/* Top Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-[#111111] border border-[#292929]">
              <div className="text-[11px] text-[#A0A0A0] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#FFFFFF]" />
                <span>Registered Users</span>
              </div>
              <div className="text-lg font-semibold text-[#FFFFFF] mt-1 tabular-nums">
                {users.length}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#111111] border border-[#292929]">
              <div className="text-[11px] text-[#A0A0A0] flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-[#FFFFFF]" />
                <span>Total Requests</span>
              </div>
              <div className="text-lg font-semibold text-[#FFFFFF] mt-1 tabular-nums">
                {totalRequestsAll.toLocaleString()}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#111111] border border-[#292929]">
              <div className="text-[11px] text-[#A0A0A0]">Tracked Tokens</div>
              <div className="text-lg font-semibold text-[#FFFFFF] mt-1 tabular-nums">
                {totalTokensAll.toLocaleString()}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#111111] border border-[#292929]">
              <div className="text-[11px] text-[#A0A0A0]">Server Uptime</div>
              <div className="text-lg font-semibold text-[#FFFFFF] mt-1 tabular-nums">
                {serverOverview ? `${serverOverview.serverUptimeSec}s` : '—'}
              </div>
            </div>
          </div>

          {/* Feature Controls & Quotas */}
          <div className="p-4 rounded-xl bg-[#111111] border border-[#292929] space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#FFFFFF]">
                <Sliders className="w-4 h-4 text-[#FFFFFF]" />
                <span>Feature Controls & Daily Quota</span>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveConfig}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#262626] hover:bg-[#333333] border border-[#404040] disabled:opacity-50 text-xs font-medium text-[#FFFFFF] cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 text-[#FFFFFF]" />
                <span>{saving ? 'Saving...' : 'Save Controls'}</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-[#171717] border border-[#292929]">
              <div>
                <div className="text-xs font-medium text-[#FFFFFF]">Daily Request Limit per User</div>
                <div className="text-[11px] text-[#A0A0A0]">Applies to Free tier accounts</div>
              </div>
              <input
                type="number"
                min={1}
                max={100000}
                value={draftConfig.dailyRequestLimit}
                onChange={(e) =>
                  setDraftConfig((c) => ({
                    ...c,
                    dailyRequestLimit: Math.max(1, Number(e.target.value) || 1),
                  }))
                }
                aria-label="Daily request limit per user"
                className="w-28 h-9 px-3 rounded-lg bg-[#111111] border border-[#292929] text-xs text-[#FFFFFF] tabular-nums focus:outline-none focus:border-[#525252]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {featureFlags.map((flag) => {
                const active = draftConfig[flag.key];
                return (
                  <div
                    key={flag.key}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#171717] border border-[#292929]"
                  >
                    <span className="text-xs text-[#FFFFFF]">{flag.label}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={active}
                      onClick={() =>
                        setDraftConfig((c) => ({ ...c, [flag.key]: !c[flag.key] }))
                      }
                      className={`w-10 h-5 rounded-full border p-0.5 transition-colors cursor-pointer shrink-0 ${
                        active
                          ? 'bg-[#404040] border-[#666666]'
                          : 'bg-[#111111] border-[#292929]'
                      }`}
                    >
                      <span
                        className={`block w-3.5 h-3.5 rounded-full transition-transform ${
                          active
                            ? 'translate-x-5 bg-[#FFFFFF]'
                            : 'translate-x-0 bg-[#A0A0A0]'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Registered Users Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-[#FFFFFF]">User Activity</h3>
            <div className="overflow-x-auto rounded-xl border border-[#292929]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-[#111111] text-[#FFFFFF] border-b border-[#292929]">
                  <tr>
                    <th className="px-3 py-2 font-medium">User</th>
                    <th className="px-3 py-2 font-medium">Plan</th>
                    <th className="px-3 py-2 font-medium">Today</th>
                    <th className="px-3 py-2 font-medium">Total Req</th>
                    <th className="px-3 py-2 font-medium">Tokens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#292929] bg-[#0A0A0A]">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-[#A0A0A0]">
                        No registered cloud users yet.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.uid}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-[#FFFFFF]">{u.name}</div>
                          <div className="text-[11px] text-[#A0A0A0]">{u.email}</div>
                        </td>
                        <td className="px-3 py-2 uppercase text-[#FFFFFF]">{u.plan}</td>
                        <td className="px-3 py-2 tabular-nums text-[#A0A0A0]">
                          {u.dailyRequestsUsed}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-[#A0A0A0]">
                          {u.totalRequests}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-[#A0A0A0]">
                          {u.totalTokens.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Error Monitoring */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-[#FFFFFF] flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Recent API Error Monitoring</span>
            </h3>
            <div className="rounded-xl border border-[#292929] bg-[#111111] divide-y divide-[#292929] max-h-48 overflow-y-auto">
              {[
                ...(serverOverview?.recentErrors || []).map((e) => ({
                  id: e.id,
                  route: e.route,
                  statusCode: e.statusCode,
                  message: e.message,
                  time: e.timestamp,
                })),
                ...cloudErrors.map((e) => ({
                  id: e.id,
                  route: e.route,
                  statusCode: e.statusCode,
                  message: e.message,
                  time: e.createdAt,
                })),
              ].length === 0 ? (
                <div className="p-4 text-center text-xs text-[#A0A0A0]">
                  No recent API errors recorded.
                </div>
              ) : (
                [
                  ...(serverOverview?.recentErrors || []).map((e) => ({
                    id: `srv_${e.id}`,
                    route: e.route,
                    statusCode: e.statusCode,
                    message: e.message,
                    time: e.timestamp,
                  })),
                  ...cloudErrors.map((e) => ({
                    id: `cld_${e.id}`,
                    route: e.route,
                    statusCode: e.statusCode,
                    message: e.message,
                    time: e.createdAt,
                  })),
                ]
                  .slice(0, 20)
                  .map((errItem) => (
                    <div key={errItem.id} className="px-3 py-2 text-xs flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-mono text-amber-300 mr-2">
                          {errItem.statusCode}
                        </span>
                        <span className="font-mono text-[#A0A0A0] mr-2">{errItem.route}</span>
                        <span className="text-[#FFFFFF] break-words">{errItem.message}</span>
                      </div>
                      <span className="text-[11px] text-[#A0A0A0] shrink-0 tabular-nums">
                        {new Date(errItem.time).toLocaleTimeString()}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
