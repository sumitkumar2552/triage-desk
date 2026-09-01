import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Layout from './components/Layout.jsx';
import SignIn from './pages/SignIn.jsx';
import SignUp from './pages/SignUp.jsx';
import MyTickets from './pages/MyTickets.jsx';
import NewTicket from './pages/NewTicket.jsx';
import Queue from './pages/Queue.jsx';
import TicketDetail from './pages/TicketDetail.jsx';
import Analytics from './pages/Analytics.jsx';
import People from './pages/People.jsx';

function Protected({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="page">
        <span className="spinner" />
        Loading your desk
      </div>
    );
  }
  if (!user) return <Navigate to="/signin" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return <Layout>{children}</Layout>;
}

/** Customers land on their own tickets; staff land on the queue. */
function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/signin" replace />;
  return (
    <Navigate to={user.role === 'customer' ? '/tickets' : '/queue'} replace />
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/" element={<Home />} />

      <Route
        path="/tickets"
        element={
          <Protected>
            <MyTickets />
          </Protected>
        }
      />
      <Route
        path="/tickets/new"
        element={
          <Protected>
            <NewTicket />
          </Protected>
        }
      />
      <Route
        path="/tickets/:id"
        element={
          <Protected>
            <TicketDetail />
          </Protected>
        }
      />
      <Route
        path="/queue"
        element={
          <Protected roles={['agent', 'admin']}>
            <Queue />
          </Protected>
        }
      />
      <Route
        path="/analytics"
        element={
          <Protected roles={['admin']}>
            <Analytics />
          </Protected>
        }
      />
      <Route
        path="/people"
        element={
          <Protected roles={['admin']}>
            <People />
          </Protected>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
