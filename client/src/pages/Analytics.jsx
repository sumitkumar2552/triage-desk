import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../lib/api.js';

const PRIORITY_COLOURS = {
  P1: '#c0392b',
  P2: '#c07016',
  P3: '#2d7d5a',
  P4: '#7a8593',
};

function Stat({ value, label }) {
  return (
    <div className="stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

export default function Analytics() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/analytics')
      .then(setStats)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!stats)
    return (
      <div>
        <span className="spinner" />
        Loading analytics
      </div>
    );

  return (
    <>
      <div className="page-head">
        <h1>Analytics</h1>
        <p>
          How the desk is doing, and whether the triage step is actually earning
          its place.
        </p>
      </div>

      {stats.totals.triageFailed > 0 && (
        <div className="alert">
          {stats.totals.triageFailed} ticket
          {stats.totals.triageFailed === 1 ? '' : 's'} could not be triaged.
          Open them from the queue and run triage again.
        </div>
      )}

      <div className="stat-grid">
        <Stat value={stats.totals.total} label="Tickets in total" />
        <Stat value={stats.totals.open} label="Still open" />
        <Stat value={stats.totals.resolved} label="Resolved" />
        <Stat
          value={`${stats.avgResolutionHours}h`}
          label="Average time to resolve"
        />
        <Stat
          value={`${stats.draftAdoption.rate}%`}
          label="Drafts sent without edits"
        />
        <Stat
          value={`${stats.avgTriageLatencyMs} ms`}
          label="Average time to triage"
        />
      </div>

      <div className="chart-grid">
        <div className="card">
          <div className="panel-head">
            <h3>Where the volume comes from</h3>
          </div>
          <div className="card-pad">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.byCategory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e8ec" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: '#6b7683' }}
                  interval={0}
                  angle={-18}
                  textAnchor="end"
                  height={62}
                />
                <YAxis tick={{ fontSize: 12, fill: '#6b7683' }} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#f4f6f8' }} />
                <Bar dataKey="value" fill="#1f3a5f" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="panel-head">
            <h3>How urgent the queue is</h3>
          </div>
          <div className="card-pad">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={stats.byPriority}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={92}
                  paddingAngle={2}
                  label={({ name, value }) => `${name} (${value})`}
                >
                  {stats.byPriority.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={PRIORITY_COLOURS[entry.name] || '#7a8593'}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="panel-head">
            <h3>Agents</h3>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Assigned</th>
                <th>Resolved</th>
              </tr>
            </thead>
            <tbody>
              {stats.agents.map((agent) => (
                <tr key={agent.name}>
                  <td>{agent.name}</td>
                  <td>{agent.assigned}</td>
                  <td>{agent.resolved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="panel-head">
            <h3>How customers sound</h3>
          </div>
          <div className="card-pad">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.bySentiment} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e8ec" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7683' }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12, fill: '#6b7683' }}
                  width={82}
                />
                <Tooltip cursor={{ fill: '#f4f6f8' }} />
                <Bar dataKey="value" fill="#47505c" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}
