import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  Hash, Users, Repeat2, Clock, Globe, Smartphone,
  Search, ShieldCheck, Flame, TrendingUp, RefreshCw,
  Database, Activity, CheckCircle2, ChevronRight, MessageSquare
} from 'lucide-react';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4', '#64748B'];

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Analytical data states
  const [health, setHealth] = useState(null);
  const [overview, setOverview] = useState(null);
  const [hashtags, setHashtags] = useState({ top_hashtags: [], top_pairs: [] });
  const [influencers, setInfluencers] = useState({ top_mentions: [], viral_accounts: [], verified_comparison: [] });
  const [viral, setViral] = useState({ composition: [], top_amplified: [] });
  const [temporal, setTemporal] = useState({ hourly: [], days: [] });
  const [geospatial, setGeospatial] = useState({ countries: [], cities: [], stats: {} });
  const [clients, setClients] = useState({ clients: [], total: 0 });

  // Text search state
  const [searchQuery, setSearchQuery] = useState('javascript');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Fetch all analytics data
  const fetchData = async () => {
    try {
      setRefreshing(true);
      const [
        hRes, oRes, hashRes, infRes, virRes, tempRes, geoRes, cliRes
      ] = await Promise.all([
        fetch('/api/health').then(r => r.json()),
        fetch('/api/overview').then(r => r.json()),
        fetch('/api/hashtags').then(r => r.json()),
        fetch('/api/influencers').then(r => r.json()),
        fetch('/api/viral').then(r => r.json()),
        fetch('/api/temporal').then(r => r.json()),
        fetch('/api/geospatial').then(r => r.json()),
        fetch('/api/clients').then(r => r.json())
      ]);

      setHealth(hRes);
      setOverview(oRes);
      setHashtags(hashRes);
      setInfluencers(infRes);
      setViral(virRes);
      setTemporal(tempRes);
      setGeospatial(geoRes);
      setClients(cliRes);
      setError(null);
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError('Failed to connect to backend API server. Ensure backend is running.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Perform live text search
  const executeSearch = async (term) => {
    const queryTerm = term !== undefined ? term : searchQuery;
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(queryTerm)}&limit=15`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    executeSearch('javascript');
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    executeSearch(searchQuery);
  };

  const handleQuickTagClick = (tag) => {
    setSearchQuery(tag);
    executeSearch(tag);
    setActiveTab('search');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0F19] flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-400 font-medium tracking-wide">Connecting to MongoDB Atlas Analytics Engine...</p>
      </div>
    );
  }

  const kpis = overview?.kpis || {};

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-gray-800 bg-[#111827]/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Twitter Analytics
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                  Atlas Engine
                </span>
              </h1>
              <p className="text-xs text-gray-400">
                End-to-end BSON Ingestion & Aggregation Suite
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Connection Status Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{health?.target || 'MongoDB Atlas Connected'}</span>
            </div>

            <button
              onClick={fetchData}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-300 transition-all border border-gray-700"
              title="Refresh live data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto mt-4 flex items-center gap-2 overflow-x-auto pb-1 text-sm border-t border-gray-800/60 pt-3">
          {[
            { id: 'overview', label: 'Overview & KPIs', icon: Activity },
            { id: 'hashtags', label: 'Hashtags & Trends (01)', icon: Hash },
            { id: 'influencers', label: 'Influencers & Virality (02)', icon: Users },
            { id: 'viral', label: 'Retweet Cascades (03)', icon: Repeat2 },
            { id: 'temporal', label: 'Temporal Cadence (04)', icon: Clock },
            { id: 'geospatial', label: 'Geospatial & Places (05)', icon: Globe },
            { id: 'clients', label: 'Client Devices (06)', icon: Smartphone },
            { id: 'search', label: 'Live Text Search', icon: Search }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg whitespace-nowrap transition-all font-medium text-xs ${
                  active
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Body Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="p-4 rounded-xl bg-red-900/30 border border-red-700 text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="glass-card p-4 rounded-xl">
            <span className="text-xs text-gray-400 font-medium">Total Tweets</span>
            <div className="text-2xl font-bold text-white mt-1">
              {(kpis.total_tweets || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-blue-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Fully Ingested
            </div>
          </div>

          <div className="glass-card p-4 rounded-xl">
            <span className="text-xs text-gray-400 font-medium">Unique Authors</span>
            <div className="text-2xl font-bold text-white mt-1">
              {(kpis.unique_authors_count || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              Active Contributors
            </div>
          </div>

          <div className="glass-card p-4 rounded-xl">
            <span className="text-xs text-gray-400 font-medium">Cumulative Retweets</span>
            <div className="text-2xl font-bold text-amber-400 mt-1">
              {(kpis.total_retweets || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              Signal Amplifications
            </div>
          </div>

          <div className="glass-card p-4 rounded-xl">
            <span className="text-xs text-gray-400 font-medium">Cumulative Likes</span>
            <div className="text-2xl font-bold text-rose-400 mt-1">
              {(kpis.total_favorites || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              Favorite Endorsements
            </div>
          </div>

          <div className="glass-card p-4 rounded-xl">
            <span className="text-xs text-gray-400 font-medium">Avg RTs / Tweet</span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {kpis.avg_retweets_per_tweet || 0}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              Cascade Velocity
            </div>
          </div>

          <div className="glass-card p-4 rounded-xl">
            <span className="text-xs text-gray-400 font-medium">Avg Hashtags / Tweet</span>
            <div className="text-2xl font-bold text-cyan-400 mt-1">
              {kpis.avg_hashtags_per_tweet || 0}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              Tag Density
            </div>
          </div>
        </div>

        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Hashtag Bar Chart */}
              <div className="lg:col-span-2 glass-card p-5 rounded-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      <Hash className="w-4 h-4 text-blue-400" />
                      Top Normalized Trending Hashtags
                    </h3>
                    <p className="text-xs text-gray-400">Extracted with $unwind, $toLower, and $group</p>
                  </div>
                  <span className="text-xs text-blue-400 font-mono">15 Trends</span>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hashtags.top_hashtags.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                      <XAxis type="number" stroke="#64748B" fontSize={11} />
                      <YAxis dataKey="hashtag" type="category" stroke="#94A3B8" fontSize={11} tickFormatter={(val) => `#${val}`} />
                      <Tooltip contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', borderRadius: '8px', color: '#F8FAFC' }} />
                      <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Client Distribution Donut */}
              <div className="glass-card p-5 rounded-2xl">
                <div className="mb-4">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    Client Devices & Syndication
                  </h3>
                  <p className="text-xs text-gray-400">Parsed HTML source origins</p>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={clients.clients}
                        dataKey="count"
                        nameKey="platform"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                      >
                        {clients.clients.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', borderRadius: '8px', color: '#F8FAFC' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                  {clients.clients.slice(0, 4).map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-gray-300">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>
                      <span className="truncate">{c.platform}</span>
                      <span className="text-gray-400 font-mono ml-auto">{c.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Keyword Topics */}
            <div className="glass-card p-5 rounded-2xl">
              <h3 className="font-semibold text-white text-sm mb-3 flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" />
                Popular Live Query Tags (Click to Search in Atlas)
              </h3>
              <div className="flex flex-wrap gap-2">
                {['nodejs', 'javascript', 'angularjs', 'fcblive', 'mongodb', 'express', 'hiring', 'webinar'].map(tag => (
                  <button
                    key={tag}
                    onClick={() => handleQuickTagClick(tag)}
                    className="px-3 py-1.5 rounded-lg bg-gray-800/80 hover:bg-blue-600 hover:text-white border border-gray-700 text-xs font-mono text-gray-300 transition-colors flex items-center gap-1.5"
                  >
                    <span>#{tag}</span>
                    <ChevronRight className="w-3 h-3 opacity-60" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Hashtags & Co-Occurrence */}
        {activeTab === 'hashtags' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card p-5 rounded-2xl">
              <div className="mb-4">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Hash className="w-4 h-4 text-blue-400" />
                  Top 15 Normalized Hashtags
                </h3>
                <p className="text-xs text-gray-400">Lowercase normalized frequency ranking</p>
              </div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {hashtags.top_hashtags.map((h, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-800/40 hover:bg-gray-800/70 border border-gray-800 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center text-xs font-mono text-gray-500 font-semibold">{idx + 1}</span>
                      <span className="font-medium text-blue-400 text-sm">#{h.hashtag}</span>
                    </div>
                    <span className="font-mono text-xs text-white font-semibold px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
                      {h.count} tweets
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card p-5 rounded-2xl">
              <div className="mb-4">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                  Top Co-Occurring Hashtag Pairs (Topic Clusters)
                </h3>
                <p className="text-xs text-gray-400">Hashtag pairs present simultaneously in the same tweet</p>
              </div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {hashtags.top_pairs.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-800/40 hover:bg-gray-800/70 border border-gray-800 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center text-xs font-mono text-gray-500 font-semibold">{idx + 1}</span>
                      <span className="font-mono text-xs text-cyan-300">{p.hashtag_pair}</span>
                    </div>
                    <span className="font-mono text-xs text-cyan-400 font-semibold px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
                      {p.count} pairs
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Influencers & Engagement */}
        {activeTab === 'influencers' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Verified vs Unverified Stats */}
              <div className="glass-card p-5 rounded-2xl lg:col-span-1">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  Verified vs. Unverified Reach
                </h3>
                <div className="space-y-4">
                  {influencers.verified_comparison.map((tier, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-gray-800/50 border border-gray-700/60">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-white flex items-center gap-1.5">
                          {tier.account_type === 'Verified' ? (
                            <ShieldCheck className="w-4 h-4 text-blue-400" />
                          ) : (
                            <Users className="w-4 h-4 text-gray-400" />
                          )}
                          {tier.account_type} Accounts
                        </span>
                        <span className="text-xs font-mono text-gray-400">{tier.count} tweets</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-gray-400">Avg Followers:</span>
                          <p className="font-bold font-mono text-white mt-0.5">{tier.avg_followers.toLocaleString()}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Avg Retweets:</span>
                          <p className="font-bold font-mono text-emerald-400 mt-0.5">{tier.avg_retweets}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Total RTs:</span>
                          <p className="font-mono text-gray-300 mt-0.5">{tier.total_retweets.toLocaleString()}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Total Likes:</span>
                          <p className="font-mono text-gray-300 mt-0.5">{tier.total_favorites.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Mentioned Users */}
              <div className="glass-card p-5 rounded-2xl lg:col-span-2">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  Most Mentioned Accounts (@entities.user_mentions)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {influencers.top_mentions.map((user, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-gray-800/40 border border-gray-800 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm text-white">@{user.screen_name}</p>
                        <p className="text-xs text-gray-400 truncate max-w-[150px]">{user.name || 'Twitter User'}</p>
                      </div>
                      <span className="text-xs font-mono text-emerald-400 font-bold px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                        {user.mentions} mentions
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Virality Ratio Table */}
            <div className="glass-card p-5 rounded-2xl">
              <div className="mb-4">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  Highest Virality Ratio: (Retweets + Favorites) / Followers
                </h3>
                <p className="text-xs text-gray-400">Reveals high-efficiency content creators punching above their follower tier</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-800/60 text-gray-400 uppercase font-mono">
                    <tr>
                      <th className="p-3">Rank</th>
                      <th className="p-3">Author</th>
                      <th className="p-3">Followers</th>
                      <th className="p-3">Retweets</th>
                      <th className="p-3">Likes</th>
                      <th className="p-3">Virality Ratio</th>
                      <th className="p-3">Sample Content</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {influencers.viral_accounts.map((acc, idx) => (
                      <tr key={idx} className="hover:bg-gray-800/40 transition-colors">
                        <td className="p-3 font-mono text-gray-400 font-semibold">{idx + 1}</td>
                        <td className="p-3">
                          <span className="font-medium text-white">@{acc.screen_name}</span>
                          {acc.verified && <ShieldCheck className="w-3.5 h-3.5 text-blue-400 inline ml-1" />}
                        </td>
                        <td className="p-3 font-mono text-gray-300">{acc.followers.toLocaleString()}</td>
                        <td className="p-3 font-mono text-amber-400 font-semibold">{acc.retweets.toLocaleString()}</td>
                        <td className="p-3 font-mono text-rose-400">{acc.favorites.toLocaleString()}</td>
                        <td className="p-3">
                          <span className="font-mono font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                            {acc.virality_ratio}
                          </span>
                        </td>
                        <td className="p-3 text-gray-400 truncate max-w-xs">{acc.tweet_text || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Viral Retweet Cascades */}
        {activeTab === 'viral' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="glass-card p-5 rounded-2xl lg:col-span-1">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <Repeat2 className="w-4 h-4 text-blue-400" />
                  Content Composition
                </h3>
                <div className="space-y-4">
                  {viral.composition.map((c, i) => (
                    <div key={i} className="p-4 rounded-xl bg-gray-800/40 border border-gray-800">
                      <span className="text-xs text-gray-400">{c.type}</span>
                      <div className="text-2xl font-bold text-white mt-1">{c.count}</div>
                      <span className="text-xs text-blue-400 font-mono">{c.percentage || '100'}% of Dataset</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card p-5 rounded-2xl lg:col-span-2">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                  Top 10 Most Amplified Source Tweets
                </h3>
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {viral.top_amplified.map((t, idx) => (
                    <div key={idx} className="p-3.5 rounded-xl bg-gray-800/40 border border-gray-800 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-blue-400">@{t.original_author}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400 font-mono font-bold">{t.global_retweet_count.toLocaleString()} RTs</span>
                          <span className="text-gray-500 font-mono">({t.appearances_in_sample} sample echoes)</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-300">{t.tweet_text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Temporal Activity */}
        {activeTab === 'temporal' && (
          <div className="space-y-6">
            <div className="glass-card p-5 rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-400" />
                    Hourly Posting Cadence (UTC)
                  </h3>
                  <p className="text-xs text-gray-400">Aggregated with $toDate and $hour</p>
                </div>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={temporal.hourly} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hourColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="hour_label" stroke="#64748B" fontSize={11} />
                    <YAxis stroke="#64748B" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', borderRadius: '8px', color: '#F8FAFC' }} />
                    <Area type="monotone" dataKey="count" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#hourColor)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-card p-5 rounded-2xl">
              <div className="mb-4">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  Day of Week Distribution
                </h3>
                <p className="text-xs text-gray-400">Aggregated with $dayOfWeek</p>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={temporal.days} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <XAxis dataKey="day" stroke="#64748B" fontSize={11} />
                    <YAxis stroke="#64748B" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', borderRadius: '8px', color: '#F8FAFC' }} />
                    <Bar dataKey="count" fill="#10B981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Geospatial & Places */}
        {activeTab === 'geospatial' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="glass-card p-4 rounded-xl">
                <span className="text-xs text-gray-400">With GPS Coordinates</span>
                <div className="text-2xl font-bold text-white mt-1">
                  {geospatial.stats.with_exact_coords || 0}
                </div>
                <span className="text-xs text-blue-400 font-mono">2dsphere Indexed</span>
              </div>
              <div className="glass-card p-4 rounded-xl">
                <span className="text-xs text-gray-400">With Place Metadata</span>
                <div className="text-2xl font-bold text-white mt-1">
                  {geospatial.stats.with_place_meta || 0}
                </div>
                <span className="text-xs text-emerald-400 font-mono">Cities & Countries</span>
              </div>
              <div className="glass-card p-4 rounded-xl">
                <span className="text-xs text-gray-400">Location Untagged</span>
                <div className="text-2xl font-bold text-white mt-1">
                  {geospatial.stats.untagged || 0}
                </div>
                <span className="text-xs text-gray-400 font-mono">Privacy Default</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-card p-5 rounded-2xl">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-400" />
                  Top Countries (place.country)
                </h3>
                <div className="space-y-2">
                  {geospatial.countries.length > 0 ? (
                    geospatial.countries.map((c, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-800/40 border border-gray-800">
                        <span className="text-sm font-medium text-white">{c.country} ({c.code})</span>
                        <span className="text-xs font-mono text-blue-400 font-bold">{c.count} tweets</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-400">No country metadata recorded in dataset sample.</p>
                  )}
                </div>
              </div>

              <div className="glass-card p-5 rounded-2xl">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  Top Metropolitan Areas (place.full_name)
                </h3>
                <div className="space-y-2">
                  {geospatial.cities.length > 0 ? (
                    geospatial.cities.map((c, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-800/40 border border-gray-800">
                        <span className="text-sm font-medium text-white">{c.city}</span>
                        <span className="text-xs font-mono text-emerald-400 font-bold">{c.count} tweets</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-400">No city metadata recorded in dataset sample.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 7: Client Devices */}
        {activeTab === 'clients' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card p-5 rounded-2xl">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-blue-400" />
                Posting Client Distribution
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clients.clients} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <XAxis dataKey="platform" stroke="#64748B" fontSize={11} />
                    <YAxis stroke="#64748B" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', borderRadius: '8px', color: '#F8FAFC' }} />
                    <Bar dataKey="count" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-card p-5 rounded-2xl">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                Platform Share Breakdown
              </h3>
              <div className="space-y-3">
                {clients.clients.map((c, i) => (
                  <div key={i} className="p-3.5 rounded-xl bg-gray-800/40 border border-gray-800">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-sm text-white">{c.platform}</span>
                      <span className="font-mono text-xs text-purple-400 font-bold">{c.count} ({c.percentage}%)</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                      <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${c.percentage}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 8: Live Atlas Text Search */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            {/* Search Input Bar */}
            <div className="glass-card p-5 rounded-2xl">
              <form onSubmit={handleSearchSubmit} className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="w-5 h-5 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tweets using MongoDB $text index (e.g. 'nodejs', 'javascript', 'barcelona')..."
                    className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-gray-900/90 border border-gray-700 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors font-medium placeholder-gray-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searchLoading}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors flex items-center gap-2 shadow-lg shadow-blue-600/30"
                >
                  {searchLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>Search</span>
                </button>
              </form>

              {/* Tag Quick Filters */}
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-800">
                <span className="text-xs text-gray-400">Quick Filters:</span>
                {['nodejs', 'javascript', 'angularjs', 'fcblive', 'mongodb', 'express', 'jobs', 'webinar'].map(q => (
                  <button
                    key={q}
                    onClick={() => { setSearchQuery(q); executeSearch(q); }}
                    className="px-2.5 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-xs font-mono text-gray-300 border border-gray-700 transition-colors"
                  >
                    #{q}
                  </button>
                ))}
              </div>
            </div>

            {/* Results Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-400 px-1">
                <span>Returned {searchResults.length} relevant documents</span>
                <span className="font-mono">Relevance ordered by MongoDB textScore</span>
              </div>

              {searchResults.length === 0 ? (
                <div className="glass-card p-12 rounded-2xl text-center text-gray-400">
                  <MessageSquare className="w-10 h-10 mx-auto text-gray-600 mb-2" />
                  <p className="font-medium">No tweets matched your search query.</p>
                  <p className="text-xs mt-1 text-gray-500">Try common tech keywords like "javascript", "nodejs", or "webinar".</p>
                </div>
              ) : (
                searchResults.map(tweet => (
                  <div key={tweet.id} className="glass-card p-4 rounded-xl space-y-2 hover:border-blue-500/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-xs text-white">
                          {tweet.screen_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm text-white">{tweet.name}</span>
                            <span className="text-xs text-gray-400">@{tweet.screen_name}</span>
                            {tweet.verified && <ShieldCheck className="w-3.5 h-3.5 text-blue-400 inline" />}
                          </div>
                          <span className="text-[11px] text-gray-500">{tweet.created_at}</span>
                        </div>
                      </div>

                      {tweet.score && (
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold" title="MongoDB $text Score">
                          Score: {tweet.score}
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-gray-200 leading-relaxed font-sans">{tweet.text}</p>

                    <div className="flex items-center justify-between pt-2 text-xs border-t border-gray-800/60">
                      <div className="flex items-center gap-4 text-gray-400 font-mono">
                        <span className="flex items-center gap-1 text-amber-400">
                          <Repeat2 className="w-3.5 h-3.5" /> {tweet.retweets} RTs
                        </span>
                        <span className="flex items-center gap-1 text-rose-400">
                          <Flame className="w-3.5 h-3.5" /> {tweet.favorites} Likes
                        </span>
                        <span className="text-gray-500">
                          {tweet.followers.toLocaleString()} Followers
                        </span>
                      </div>

                      {tweet.hashtags && tweet.hashtags.length > 0 && (
                        <div className="flex gap-1.5">
                          {tweet.hashtags.slice(0, 3).map((h, i) => (
                            <span key={i} className="text-[11px] text-blue-400 font-mono bg-blue-500/10 px-1.5 py-0.5 rounded">
                              #{h}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 text-center text-xs text-gray-500">
        <p>MongoDB Atlas Aggregation & Analytics Engine • Database: <span className="font-mono text-gray-400">twitter_analytics</span> • Collection: <span className="font-mono text-gray-400">tweets</span></p>
      </footer>
    </div>
  );
}
