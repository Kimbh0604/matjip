import ReportPage from './Reports.jsx';
import MenuPage from './game.jsx';
import HomePage from './HomePage.jsx';
import Topbar from './Topbar.jsx';

export default function App() {
  if (window.location.pathname === '/report') {
    return <ReportPage Topbar={Topbar} />;
  }

  if (window.location.pathname === '/menu') {
    return <MenuPage Topbar={Topbar} />;
  }

  return <HomePage Topbar={Topbar} />;
}
