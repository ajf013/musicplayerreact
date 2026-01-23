import React from 'react';

const SEOContent = ({ theme }) => {
    const textColor = theme === 'dark' ? '#b3b3b3' : '#555';
    const headingColor = theme === 'dark' ? '#e0e0e0' : '#333';

    return (
        <article style={{
            maxWidth: '800px',
            margin: '40px auto',
            padding: '20px',
            color: textColor,
            lineHeight: '1.6',
            fontFamily: 'Instrument Sans, sans-serif' // Fallback to system if not loaded, but kept consistent
        }}>
            <h2 style={{ color: headingColor, fontSize: '1.5rem', marginBottom: '1rem' }}>
                Free Web Music App – Stream & Play Online
            </h2>
            <p style={{ marginBottom: '1rem' }}>
                Welcome to <strong>Music.fcruz.org</strong>, a powerful <strong>free web music app</strong> built for instant audio streaming directly in your browser.
                Whether you want to <strong>stream music online</strong> or play your local audio files, our player offers a seamless, lightweight experience without the need for heavy software downloads.
            </p>

            <h3 style={{ color: headingColor, fontSize: '1.2rem', marginTop: '1.5rem', marginBottom: '0.5rem' }}>
                Why Use Our Online Music Player?
            </h3>
            <ul style={{ listStyleType: 'disc', paddingLeft: '20px', marginBottom: '1rem' }}>
                <li><strong>No Download Required:</strong> Access a full-featured <strong>browser music player</strong> instantly.</li>
                <li><strong>Offline Capable PWA:</strong> Install as an app and listen even when you're offline.</li>
                <li><strong>High Performance:</strong> A <strong>lightweight music player</strong> optimized for speed and battery life.</li>
                <li><strong>Modern Interface:</strong> Enjoy a beautiful, ad-free experience with dark mode support.</li>
            </ul>

            <p>
                Experience the best way to listen to music on the web. Our <strong>Javascript music player</strong> supports standard formats and utilizes modern web audio API technologies (react-audio-visualize, wavesurfer.js) to deliver high-quality sound and visualizers.
            </p>
        </article>
    );
};

export default SEOContent;
