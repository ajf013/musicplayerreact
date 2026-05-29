import React, { useState, useEffect, useRef } from 'react';
import { Segment, Header, Loader, Button, Icon, Message, Label } from 'semantic-ui-react';
import axios from 'axios';

const Lyrics = ({ artist, title, currentTime, isPlaying }) => {
    const [lyrics, setLyrics] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [synced, setSynced] = useState(false);
    const [isUserScrolling, setIsUserScrolling] = useState(false);

    // Override & Import states
    const [showManualSearch, setShowManualSearch] = useState(false);
    const [showPasteArea, setShowPasteArea] = useState(false);
    const [customArtist, setCustomArtist] = useState('');
    const [customTitle, setCustomTitle] = useState('');
    const [pastedLyrics, setPastedLyrics] = useState('');

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

    const fetchLyrics = async (overrideArtist, overrideTitle) => {
        const targetArtist = overrideArtist !== undefined ? overrideArtist : artist;
        const targetTitle = overrideTitle !== undefined ? overrideTitle : title;

        setLoading(true);
        setError(null);
        setLyrics([]);
        setSynced(false);
        setIsUserScrolling(false);

        // MOCK DATA FOR VERIFICATION
        if (targetTitle === "Demo Song 1" || targetTitle === "Numb") {
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

        console.log(`[Lyrics] Fetching for Artist: "${targetArtist}", Title: "${targetTitle}"`);

        try {
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
                            artist_name: targetArtist !== 'Unknown Artist' ? targetArtist : '',
                            track_name: cleanTitle(targetTitle),
                        }
                    });
                    if (res.data) responseData = res.data;
                } catch (e) { /* Ignore */ }
            }

            if (!responseData) {
                const query = `${targetArtist !== 'Unknown Artist' ? targetArtist : ''} ${cleanTitle(targetTitle)}`.trim();
                try {
                    const res = await axios.get('https://lrclib.net/api/search', { params: { q: query } });
                    if (res.data && res.data.length > 0) responseData = res.data[0];
                } catch (e) { /* Ignore */ }
            }

            if (!responseData) {
                const query = cleanTitle(targetTitle);
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

    const handleLrcUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;
            const parsed = parseLrc(text);
            if (parsed.length > 0) {
                setLyrics(parsed);
                setSynced(true);
                setError(null);
                setShowPasteArea(false);
            } else {
                setLyrics([{ time: 0, text: text }]);
                setSynced(false);
                setError(null);
                setShowPasteArea(false);
            }
        };
        reader.readAsText(file);
    };

    const handlePasteSubmit = () => {
        if (!pastedLyrics.trim()) return;
        const parsed = parseLrc(pastedLyrics);
        if (parsed.length > 0) {
            setLyrics(parsed);
            setSynced(true);
            setError(null);
            setShowPasteArea(false);
        } else {
            setLyrics([{ time: 0, text: pastedLyrics }]);
            setSynced(false);
            setError(null);
            setShowPasteArea(false);
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
                <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Label
                        size='mini'
                        color={synced ? 'green' : 'grey'}
                    >
                        {synced ? 'Synced' : 'Text Only'}
                    </Label>
                    <Icon 
                        name='setting' 
                        style={{ cursor: 'pointer', color: '#aaa' }} 
                        onClick={() => {
                            setShowManualSearch(!showManualSearch);
                            setShowPasteArea(false);
                        }} 
                    />
                </div>
            )}

            {showManualSearch && (
                <div style={{ padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', margin: '15px 0' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: 'white' }}>Search Lyrics</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '280px', margin: '0 auto' }}>
                        <input 
                            placeholder="Artist Name" 
                            value={customArtist} 
                            onChange={(e) => setCustomArtist(e.target.value)}
                            style={{ background: '#222', border: '1px solid #444', color: 'white', padding: '6px 10px', borderRadius: '5px' }}
                        />
                        <input 
                            placeholder="Song Title" 
                            value={customTitle} 
                            onChange={(e) => setCustomTitle(e.target.value)}
                            style={{ background: '#222', border: '1px solid #444', color: 'white', padding: '6px 10px', borderRadius: '5px' }}
                        />
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <Button size='mini' color='violet' onClick={() => { fetchLyrics(customArtist, customTitle); setShowManualSearch(false); }}>Search</Button>
                            <Button size='mini' onClick={() => setShowManualSearch(false)}>Cancel</Button>
                        </div>
                    </div>
                </div>
            )}

            {showPasteArea && (
                <div style={{ padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', margin: '15px 0' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: 'white' }}>Paste or Upload LRC</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '280px', margin: '0 auto' }}>
                        <textarea 
                            placeholder="Paste LRC content here... [00:12.34] Lyrics line" 
                            value={pastedLyrics} 
                            onChange={(e) => setPastedLyrics(e.target.value)}
                            rows={4}
                            style={{ background: '#222', border: '1px solid #444', color: 'white', padding: '6px 10px', borderRadius: '5px', fontFamily: 'monospace', fontSize: '12px' }}
                        />
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center' }}>
                            <Button size='mini' color='pink' onClick={handlePasteSubmit}>Submit Text</Button>
                            <span style={{ fontSize: '12px', color: '#aaa' }}>or</span>
                            <label style={{ background: '#444', color: 'white', padding: '5px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', margin: 0 }}>
                                Upload .lrc
                                <input type="file" accept=".lrc,.txt" onChange={handleLrcUpload} style={{ display: 'none' }} />
                            </label>
                        </div>
                        <Button size='mini' onClick={() => setShowPasteArea(false)} style={{ width: 'fit-content', alignSelf: 'center', marginTop: '5px' }}>Cancel</Button>
                    </div>
                </div>
            )}

            {!loading && error && (
                <div style={{ padding: '20px', opacity: 0.7 }}>
                    <Icon name='music' size='large' />
                    <p>{error}</p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <Button size='mini' compact onClick={() => fetchLyrics()} inverted>Retry</Button>
                        <Button size='mini' compact onClick={() => setShowManualSearch(true)} color='violet'>Search Manually</Button>
                        <Button size='mini' compact onClick={() => setShowPasteArea(true)} color='pink'>Paste/Upload LRC</Button>
                    </div>
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
                                    background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
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
