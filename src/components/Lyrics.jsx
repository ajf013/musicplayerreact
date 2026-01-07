import React, { useState, useEffect, useRef } from 'react';
import { Segment, Header, Loader, Button, Icon, Message } from 'semantic-ui-react';
import axios from 'axios';

const Lyrics = ({ artist, title, currentTime, isPlaying }) => {
    const [lyrics, setLyrics] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [synced, setSynced] = useState(false);
    const activeLineRef = useRef(null);
    const containerRef = useRef(null);

    const getActiveLineIndex = () => {
        if (!synced) return -1;
        // Find the last line where time <= currentTime
        // Binary search or simple findLastIndex would work. Simple loop for now.
        for (let i = lyrics.length - 1; i >= 0; i--) {
            if (currentTime >= lyrics[i].time) {
                return i;
            }
        }
        return -1;
    };

    const activeIndex = getActiveLineIndex();

    useEffect(() => {
        if (title) {
            fetchLyrics();
        } else {
            setLyrics([]);
            setError("No song loaded");
        }
    }, [artist, title]);

    useEffect(() => {
        if (activeLineRef.current && containerRef.current) {
            activeLineRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        }
    }, [activeIndex]); // Only scroll when the active line changes

    const fetchLyrics = async () => {
        setLoading(true);
        setError(null);
        setLyrics([]);
        setSynced(false);

        console.log(`[Lyrics] Fetching for Artist: "${artist}", Title: "${title}"`);

        try {
            // Helper to clean title
            const cleanTitle = (t) => t
                .replace(/\(.*\)|\[.*\]/g, '') // Remove whatever is in brackets
                .split('|')[0] // Remove everything after pipe
                .replace(/- topic|official video|official audio|lyrics|official|video|audio/gi, '') // Remove clutter
                .trim();

            let responseData = null;
            let successStrategy = '';

            // Strategy 1: Specific Get (Artist + Title) - Best for correct metadata
            if (!responseData) {
                try {
                    const res = await axios.get('https://lrclib.net/api/get', {
                        params: {
                            artist_name: artist !== 'Unknown Artist' ? artist : '',
                            track_name: cleanTitle(title),
                        }
                    });
                    if (res.data) {
                        responseData = res.data;
                        successStrategy = 'Specific Get';
                    }
                } catch (e) { /* Ignore 404 */ }
            }

            // Strategy 2: Search with Original Metadata
            if (!responseData) {
                const query = `${artist !== 'Unknown Artist' ? artist : ''} ${cleanTitle(title)}`.trim();
                try {
                    const res = await axios.get('https://lrclib.net/api/search', { params: { q: query } });
                    if (res.data && res.data.length > 0) {
                        responseData = res.data[0];
                        successStrategy = 'Search Original';
                    }
                } catch (e) { console.warn("Search Original failed", e); }
            }

            // Strategy 3: Split Title (If YouTube Title = "Artist - Track")
            if (!responseData && title.includes('-')) {
                const parts = title.split('-');
                const potentialArtist = parts[0].trim();
                const potentialTitle = cleanTitle(parts.slice(1).join('-')).trim();
                const query = `${potentialArtist} ${potentialTitle}`;

                console.log(`[Lyrics] Trying Split Strategy: "${potentialArtist}" - "${potentialTitle}"`);
                try {
                    const res = await axios.get('https://lrclib.net/api/search', { params: { q: query } });
                    if (res.data && res.data.length > 0) {
                        responseData = res.data[0];
                        successStrategy = 'Search Split';
                    }
                } catch (e) { console.warn("Search Split failed", e); }
            }

            // Strategy 4: Search Title Only (Fallback)
            if (!responseData) {
                const query = cleanTitle(title);
                console.log(`[Lyrics] Trying Title Only Strategy: "${query}"`);
                try {
                    const res = await axios.get('https://lrclib.net/api/search', { params: { q: query } });
                    if (res.data && res.data.length > 0) {
                        responseData = res.data[0];
                        successStrategy = 'Search Title Only';
                    }
                } catch (e) { console.warn("Search Title Only failed", e); }
            }


            if (responseData) {
                console.log(`[Lyrics] Success using strategy: ${successStrategy}`, responseData);
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
                console.warn("[Lyrics] All strategies failed");
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
        const regex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
        const parsed = [];

        lines.forEach(line => {
            const match = line.match(regex);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const milliseconds = parseInt(match[3].padEnd(3, '0')); // Ensure ms is 3 digits
                const time = minutes * 60 + seconds + milliseconds / 1000;
                const text = match[4].trim();
                if (text) {
                    parsed.push({ time, text });
                }
            }
        });

        return parsed;
    };



    return (
        <Segment inverted className="lyrics-container" style={{ height: '300px', overflowY: 'auto', textAlign: 'center', scrollBehavior: 'smooth' }} ref={containerRef}>
            {loading && <Loader active inline="centered" inverted>Loading Lyrics...</Loader>}

            {!loading && error && (
                <div style={{ padding: '20px', opacity: 0.7 }}>
                    <Icon name='music' size='large' />
                    <p>{error}</p>
                    <Button size='mini' compact onClick={fetchLyrics} inverted>Retry</Button>
                </div>
            )}

            {!loading && !error && lyrics.length > 0 && (
                <div className="lyrics-content">
                    {lyrics.map((line, index) => {
                        const isActive = index === activeIndex;
                        return (
                            <p
                                key={index}
                                ref={isActive ? activeLineRef : null}
                                style={{
                                    opacity: isActive ? 1 : 0.6,
                                    transform: isActive ? 'scale(1.1)' : 'scale(1)',
                                    transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                    fontWeight: isActive ? 'bold' : 'normal',
                                    padding: '8px 0',
                                    margin: 0,
                                    color: isActive ? '#a78bfa' : '#ccc',
                                    textShadow: isActive ? '0 0 10px rgba(167, 139, 250, 0.5)' : 'none'
                                }}
                            >
                                {line.text}
                            </p>
                        );
                    })}
                    {!synced && (
                        <Message warning size='mini'>
                            Synced lyrics not available. Showing plain text.
                        </Message>
                    )}
                </div>
            )}
        </Segment>
    );
};

export default Lyrics;
