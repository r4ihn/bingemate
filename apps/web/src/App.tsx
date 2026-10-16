import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';

function Home() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem' }}>
      <h1>🎬 BingeMate</h1>
      <p>Monorepo scaffold is live. Build out pages per TASKS.md section 8.</p>
      <nav style={{ display: 'flex', gap: '1rem' }}>
        <Link to="/">Home</Link>
        <Link to="/browse">Browse</Link>
      </nav>
    </main>
  );
}

function Browse() {
  return <main style={{ fontFamily: 'system-ui', padding: '2rem' }}>Browse page — TODO</main>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/browse" element={<Browse />} />
      </Routes>
    </BrowserRouter>
  );
}
