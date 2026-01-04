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

    useEffect(() => {
        if (artist && title) {
            fetchLyrics();
        } else {
            setLyrics([]);
            setError("No song details available");
        }
    }, [artist, title]);

    useEffect(() => {
        if (activeLineRef.current && containerRef.current) {
            activeLineRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        }
    }, [currentTime]);

    const fetchLyrics = async () => {
        setLoading(true);
        setError(null);
        setLyrics([]);
        setSynced(false);

        try {
            // First try specific search
            let response = await axios.get('https://lrclib.net/api/get', {
                params: {
                    artist_name: artist,
                    track_name: title,
                }
            });

            if (!response.data || (!response.data.syncedLyrics && !response.data.plainLyrics)) {
                // If specific get fails, try search
                const searchResponse = await axios.get('https://lrclib.net/api/search', {
                    params: {
                        q: `${artist} ${title}`
                    }
                });

                if (searchResponse.data && searchResponse.data.length > 0) {
                    response = { data: searchResponse.data[0] };
                }
            }

            if (response.data) {
                if (response.data.syncedLyrics) {
                    setLyrics(parseLrc(response.data.syncedLyrics));
                    setSynced(true);
                } else if (response.data.plainLyrics) {
                    setLyrics([{ time: 0, text: response.data.plainLyrics }]);
                    setSynced(false);
                } else {
                    setError("Lyrics not found");
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

    return (
        <Segment inverted className="lyrics-container" style={{ height: '300px', overflowY: 'auto', textAlign: 'center' }} ref={containerRef}>
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
                                    opacity: isActive ? 1 : 0.5,
                                    transform: isActive ? 'scale(1.05)' : 'scale(1)',
                                    transition: 'all 0.3s ease',
                                    fontWeight: isActive ? 'bold' : 'normal',
                                    padding: '5px 0',
                                    margin: 0,
                                    color: isActive ? '#a78bfa' : 'white'
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
