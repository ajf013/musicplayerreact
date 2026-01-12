import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import MusicPlayer from './components/MusicPlayer';
import ErrorBoundary from './components/ErrorBoundary';
import ReloadPrompt from './components/ReloadPrompt';
import AOS from 'aos';
import 'aos/dist/aos.css';

function App() {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    AOS.init({
      duration: 1000,
    });

    // Check local storage or system preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      setTheme(savedTheme);
      document.body.setAttribute('data-theme', savedTheme);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.body.setAttribute('data-theme', newTheme);
  };

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header theme={theme} toggleTheme={toggleTheme} />
      <main style={{ flex: 1, padding: '10px', width: '100%', boxSizing: 'border-box' }}>
        <ErrorBoundary>
          <MusicPlayer isMobile={true} /> {/* Assuming mobile-first as requested "on the phone" */}
        </ErrorBoundary>
      </main>
      <ReloadPrompt />
      <Footer />
    </div>
  );
}

export default App;
