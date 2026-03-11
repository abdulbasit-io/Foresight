import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WalletProvider } from './context/WalletContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import LandingPage from './pages/LandingPage';
import Markets from './pages/Markets';
import MarketDetail from './pages/MarketDetail';
import Create from './pages/Create';
import Portfolio from './pages/Portfolio';

export default function App() {
  return (
    <BrowserRouter>
      <WalletProvider>
        <Navbar />
        <main className="page-content">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/markets" element={<Markets />} />
            <Route path="/markets/:id" element={<MarketDetail />} />
            <Route path="/create" element={<Create />} />
            <Route path="/portfolio" element={<Portfolio />} />
          </Routes>
        </main>
        <Footer />
      </WalletProvider>
    </BrowserRouter>
  );
}
