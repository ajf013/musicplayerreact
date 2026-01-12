import React, { useState, useEffect, useRef } from 'react';
import { Segment, Header, Loader, Button, Icon, Message, Label } from 'semantic-ui-react';
import axios from 'axios';

const Lyrics = ({ artist, title, currentTime, isPlaying }) => {
    const [lyrics, setLyrics] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [synced, setSynced] = useState(false);
    const [isUserScrolling, setIsUserScrolling] = useState(false);

    const activeLineRef = useRef(null);
    const containerRef = useRef(null);
    const isAutoScrolling = useRef(false);

    const getActiveLineIndex = () => {
        if (!synced || lyrics.length === 0) return -1;
        // Find the last line where time <= currentTime
        for (let i = lyrics.length - 1; i >= 0; i--) {
            if (currentTime >= lyrics[i].time) {
                return i;
            }
        }
        return -1;
    };

    const activeIndex = getActiveLineIndex();

    // Reset user scrolling when song changes
    useEffect(() => {
        setIsUserScrolling(false);
    }, [title, artist]);

    useEffect(() => {
        if (title) {
            fetchLyrics();
        } else {
            setLyrics([]);
            setError("No song loaded");
        }
    }, [artist, title]);

    // Auto-Resume Timer
    useEffect(() => {
        let timeout;
        if (isUserScrolling) {
            timeout = setTimeout(() => {
                setIsUserScrolling(false); // Auto-resume after 3s of no interaction
            }, 3000);
        }
        return () => clearTimeout(timeout);
    }, [isUserScrolling]);

    useEffect(() => {
        // If user is scrolling (and timeout hasn't cleared it), don't auto-scroll
        if (isUserScrolling) return;

        if (activeLineRef.current && synced) {
            activeLineRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        }
    }, [activeIndex, synced, isUserScrolling]);

    // Reliable User Interaction Detection
    const handleUserInteraction = () => {
        setIsUserScrolling(true);
    };

    const handleResumeSync = () => {
        setIsUserScrolling(false);
    };

    const fetchLyrics = async () => {
        setLoading(true);
        setError(null);
        setLyrics([]);
        setSynced(false);
        setIsUserScrolling(false);

        // MOCK DATA FOR VERIFICATION
        if (title === "Demo Song 1" || title === "Numb") {
            console.log("Loading Mock Synced Lyrics");
            const mockLrc = `
[00:00.00] (Intro)
[00:10.00] I'm tired of being what you want me to be
[00:15.00] Feeling so faithless, lost under the surface
[00:20.00] Don't know what you're expecting of me
[00:25.00] Put under the pressure of walking in your shoes
[00:30.00] (Caught in the undertow, just caught in the undertow)
[00:35.00] Every step that I take is another mistake to you
`;
            setLyrics(parseLrc(mockLrc));
            setSynced(true);
            setLoading(false);
            return;
        }

        console.log(`[Lyrics] Fetching for Artist: "${artist}", Title: "${title}"`);

        try {
            // Helper to clean title
            const cleanTitle = (t) => t
                .replace(/\(.*\)|\[.*\]/g, '')
                .split('|')[0]
                .replace(/- topic|official video|official audio|lyrics|official|video|audio/gi, '')
                .trim();

            let responseData = null;

            if (!responseData) {
                try {
                    const res = await axios.get('https://lrclib.net/api/get', {
                        params: {
                            artist_name: artist !== 'Unknown Artist' ? artist : '',
                            track_name: cleanTitle(title),
                        }
                    });
                    if (res.data) responseData = res.data;
                } catch (e) { /* Ignore */ }
            }

            if (!responseData) {
                const query = `${artist !== 'Unknown Artist' ? artist : ''} ${cleanTitle(title)}`.trim();
                try {
                    const res = await axios.get('https://lrclib.net/api/search', { params: { q: query } });
                    if (res.data && res.data.length > 0) responseData = res.data[0];
                } catch (e) { /* Ignore */ }
            }

            if (!responseData) {
                const query = cleanTitle(title);
                try {
                    const res = await axios.get('https://lrclib.net/api/search', { params: { q: query } });
                    if (res.data && res.data.length > 0) responseData = res.data[0];
                } catch (e) { /* Ignore */ }
            }

            if (responseData) {
                if (responseData.syncedLyrics) {
                    setLyrics(parseLrc(responseData.syncedLyrics));
                    setSynced(true);
                } else if (responseData.plainLyrics) {
                    setLyrics([{ time: 0, text: responseData.plainLyrics }]);
                    setSynced(false);
                } else {
                    setError("Lyrics not found (empty content)");
                }
            } else {
                setError("Lyrics not found");
            }

        } catch (err) {
            console.error("Lyrics fetch error:", err);
            setError("Could not load lyrics");
        } finally {
            setLoading(false);
        }
    };

    const parseLrc = (lrcText) => {
        const lines = lrcText.split('\n');
        // Improved regex to handle various formats like [00:00], [00:00.0], [00:00.000]
        const regex = /^\[(\d+):(\d+)(\.\d+)?\](.*)/;
        const parsed = [];

        lines.forEach(line => {
            const match = line.match(regex);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const time = minutes * 60 + seconds + parseFloat(match[3] || 0);
                const text = match[4].trim();
                if (text || text === '') {
                    parsed.push({ time, text });
                }
            }
        });

        return parsed;
    };

    return (
        <Segment inverted className="lyrics-container"
            style={{
                height: '300px',
                overflowY: 'auto',
                textAlign: 'center',
                scrollBehavior: 'smooth',
                position: 'relative',
                padding: '20px 0'
            }}
            ref={containerRef}
            onWheel={handleUserInteraction}
            onTouchStart={handleUserInteraction}
            onMouseDown={handleUserInteraction}
        >
            {loading && <Loader active inline="centered" inverted>Loading Lyrics...</Loader>}

            {synced && isUserScrolling && (
                <Button
                    color='violet'
                    size='mini'
                    onClick={handleResumeSync}
                    style={{
                        position: 'sticky',
                        top: '10px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 100,
                        boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                        opacity: 0.9,
                        animation: 'fadeIn 0.3s'
                    }}
                >
                    <Icon name='sync' /> Resume Auto-Scroll
                </Button>
            )}

            {!loading && (
                <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10 }}>
                    <Label
                        size='mini'
                        color={synced ? 'green' : 'grey'}
                    >
                        {synced ? 'Synced' : 'Text Only'}
                    </Label>
                </div>
            )}


            {!loading && error && (
                <div style={{ padding: '20px', opacity: 0.7 }}>
                    <Icon name='music' size='large' />
                    <p>{error}</p>
                    <Button size='mini' compact onClick={fetchLyrics} inverted>Retry</Button>
                </div>
            )}

            {!loading && !error && lyrics.length > 0 && (
                <div className="lyrics-content" style={{ padding: '100px 0' }}>
                    {lyrics.map((line, index) => {
                        const isActive = index === activeIndex;
                        return (
                            <p
                                key={index}
                                ref={isActive ? activeLineRef : null}
                                style={{
                                    opacity: isActive ? 1 : 0.4,
                                    transform: isActive ? 'scale(1.2)' : 'scale(1)',
                                    transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                    fontWeight: isActive ? 'bold' : 'normal',
                                    padding: '16px 10px',
                                    margin: 0,
                                    color: isActive ? '#d8b4fe' : '#9ca3af',
                                    textShadow: isActive ? '0 0 20px rgba(167, 139, 250, 0.5)' : 'none',
                                    fontSize: isActive ? '22px' : '16px',
                                    background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent', // Added subtle background
                                    borderRadius: '10px'
                                }}
                            >
                                {line.text}
                            </p>
                        );
                    })}
                </div>
            )}
        </Segment>
    );
};

export default Lyrics;
