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
  const [showSplash, setShowSplash] = useState(true);

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

    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.body.setAttribute('data-theme', newTheme);
  };

  if (showSplash) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        background: theme === 'dark' ? '#1a1a1a' : '#ffffff',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, transition: 'opacity 0.5s ease-out'
      }}>
        <div data-aos="zoom-in">
          {/* Using default treble clef icon or image */}
          <div style={{ fontSize: '80px', marginBottom: '20px' }}>🎵</div>
          <h1 style={{
            color: theme === 'dark' ? '#fff' : '#333',
            fontFamily: 'Inter, sans-serif',
            letterSpacing: '2px'
          }}>Music Player</h1>
        </div>
      </div>
    );
  }

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
