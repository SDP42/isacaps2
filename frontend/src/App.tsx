import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./lib/auth";

const Landing = lazy(() => import("./pages/landing/Landing"));
const Auth = lazy(() => import("./pages/Auth"));
const AppShell = lazy(() => import("./components/app/AppShell"));
const Dashboard = lazy(() => import("./pages/app/Dashboard"));
const Investigate = lazy(() => import("./pages/app/Investigate"));
const Cases = lazy(() => import("./pages/app/Cases"));
const CaseView = lazy(() => import("./pages/app/CaseView"));
const TribunalPage = lazy(() => import("./pages/app/TribunalPage"));
const IdentityGraph = lazy(() => import("./pages/app/IdentityGraph"));
const AttackChain = lazy(() => import("./pages/app/AttackChain"));
const Casebook = lazy(() => import("./pages/app/Casebook"));
const ScenarioLab = lazy(() => import("./pages/app/ScenarioLab"));
const System = lazy(() => import("./pages/app/System"));
const Safety = lazy(() => import("./pages/app/Safety"));
const AttackReplay = lazy(() => import("./pages/app/AttackReplay"));
const Challenge = lazy(() => import("./pages/app/Challenge"));
const LiveShield = lazy(() => import("./pages/app/LiveShield"));
const VoiceCheck = lazy(() => import("./pages/app/VoiceCheck"));
const RedTeam = lazy(() => import("./pages/app/RedTeam"));
const Trustbook = lazy(() => import("./pages/app/Trustbook"));
const Drills = lazy(() => import("./pages/app/Drills"));
const Liveness = lazy(() => import("./pages/app/Liveness"));
const Share = lazy(() => import("./pages/app/Share"));

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-ink-0">
      <div className="h-px w-40 overflow-hidden bg-ink-4">
        <div className="h-full w-1/3 animate-[shimmer_1s_linear_infinite] bg-cyan" />
      </div>
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { persona, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Splash />;
  if (!persona) return <Navigate to="/auth" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { persona } = useAuth();
  return <Navigate to={persona?.role === "family" ? "/app/safety" : "/app/dashboard"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<Splash />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/app" element={<Protected><AppShell /></Protected>}>
              <Route index element={<HomeRedirect />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="investigate" element={<Investigate />} />
              <Route path="cases" element={<Cases />} />
              <Route path="cases/:id" element={<CaseView />} />
              <Route path="cases/:id/:tab" element={<CaseView />} />
              <Route path="tribunal" element={<TribunalPage />} />
              <Route path="tribunal/:id" element={<TribunalPage />} />
              <Route path="identity" element={<IdentityGraph />} />
              <Route path="attack-chain" element={<AttackChain />} />
              <Route path="casebook" element={<Casebook />} />
              <Route path="lab" element={<ScenarioLab />} />
              <Route path="system" element={<System />} />
              <Route path="safety" element={<Safety />} />
              <Route path="replay" element={<AttackReplay />} />
              <Route path="challenge" element={<Challenge />} />
              <Route path="shield" element={<LiveShield />} />
              <Route path="voice" element={<VoiceCheck />} />
              <Route path="redteam" element={<RedTeam />} />
              <Route path="trustbook" element={<Trustbook />} />
              <Route path="drills" element={<Drills />} />
              <Route path="liveness" element={<Liveness />} />
              <Route path="share" element={<Share />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: { background: "#0b1120", border: "1px solid rgb(148 163 184 / 0.18)", color: "#e9eef7", fontFamily: "Geist" },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}
