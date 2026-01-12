
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon, Button, Tab, List, Segment, Label, Statistic, Message } from 'semantic-ui-react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import MusicTempo from 'music-tempo';
import { LiveAudioVisualizer } from 'react-audio-visualize';
// import axios from 'axios'; // Removed
import YouTubePlayer from './YouTubePlayer';
import * as musicMetadata from 'music-metadata-browser';
import './MusicPlayer.css';
import Lyrics from './Lyrics';

const decodeHtml = (html) => {
    if (!html) return "";
    const txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
};

const MusicPlayer = () => {
    // 1. State Definitions
    const [songs, setSongs] = useState([]);
    const [currentSongIndex, setCurrentSongIndex] = useState(-1);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [loopMode, setLoopMode] = useState('off'); // off, one, all
    const [activeTab, setActiveTab] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('tab') === 'online' ? 1 : 0;
    }); // 0: Local, 1: Online
    const [volume, setVolume] = useState(0.8); // Default 80%

    const [audioInfo, setAudioInfo] = useState({ bpm: '---', key: '---', signature: '---' });
    const [, setIsAnalyzing] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [youTubeVideoId, setYouTubeVideoId] = useState(null);
    const [isYouTube, setIsYouTube] = useState(false);
    const [placeholder, setPlaceholder] = useState('');
    const [showLyrics, setShowLyrics] = useState(false);
    const [usingMockData, setUsingMockData] = useState(false);

    // View & Ref State
    const [isPlayerView, setIsPlayerView] = useState(false);
    const [playerOverlay, setPlayerOverlay] = useState(null); // 'lyrics', 'queue', 'related'
    const [viewMode, setViewMode] = useState('online'); // 'online' or 'local'
    const [libraryView, setLibraryView] = useState('list'); // 'list' or 'grid'
    const [isWaveSurferReady, setIsWaveSurferReady] = useState(false); // Playback readiness check
    const [playbackRate, setPlaybackRate] = useState(1.0);

    // 2. Ref Definitions
    const waveformRef = useRef(null);
    const timelineRef = useRef(null);
    const wavesurfer = useRef(null);
    const regions = useRef(null);
    const disableDragRef = useRef(null); // To store the cleanup function for drag selection
    const canvasRef = useRef(null);
    const folderInputRef = useRef(null);
    const fileInputRef = useRef(null);
    const youTubePlayerRef = useRef(null);
    const audioRef = useRef(null);
    const pendingPlayIndex = useRef(null);
    const songsRef = useRef(songs);
    const currentIndexRef = useRef(currentSongIndex);

    // IndexedDB Helper
    const initDB = async () => {
        try {
            const db = await openDB('MusicPlayerDB', 1, {
                upgrade(db) {
                    if (!db.objectStoreNames.contains('songs')) {
                        db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
                    }
                },
            });
            return db;
        } catch (e) {
            console.error("Error in initDB:", e);
            throw e;
        }
    };

    // Load saved songs on mount
    // Load saved songs from Backend
    // Load saved songs removed (No persistence requested, purely local session)
    // Or if user meant "files uploaded... from device", implies session-based "Open File".
    useEffect(() => {
        // Clear songs on reload if we want strict "no backend".
        // Or if we want to keep IDB for local persistence (without backend), we could.
        // But user said "no backend is required". IDB is frontend.
        // User also said "remove downloads option".
        // I will assume NO persistence for now to keep it simple and clean as requested "uploaded... from device... play automatically".
        // So on refresh, it's empty.
    }, []);

    const saveCurrentSong = async () => {
        // Disabled/Removed feature
        console.log("Save feature disabled.");
    };

    // Fix: We need to handle restoring the Blob URL when loading from DB
    // This requires a modification to the song loading logic or a separate effect to regenerate URLs for songs with 'blob' property.
    // Let's modify the load logic above or add a processor.
    // simpler: update the load effect.

    // ... Revised Load Effect ...
    /* 
   const loadSavedSongs = async () => {
       const db = await initDB();
       const saved = await db.getAll('songs');
       const processed = saved.map(s => {
           if (s.blob) {
               return { ...s, src: URL.createObjectURL(s.blob), type: 'local' };
           }
           return s;
       });
       // ... setSongs ...
   }
   */

    const volumeRef = useRef(volume);
    const loopModeRef = useRef(loopMode);

    useEffect(() => {
        loopModeRef.current = loopMode;
    }, [loopMode]);

    // Constants
    const onlineSongs = [
        { title: 'Demo Song 1', artist: 'WaveSurfer', src: 'https://wavesurfer.xyz/wavesurfer-code/examples/audio/audio.wav', type: 'online' },
        { title: 'Demo Song 2', artist: 'SoundHelix', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', type: 'online' },
        { title: 'Demo Song 3', artist: 'Github Sample', src: 'https://raw.githubusercontent.com/rafaelreis-hotmart/Audio-Sample-files/master/sample.mp3', type: 'online' },
    ];

    // 3. Effects (Initial)
    useEffect(() => {
        volumeRef.current = volume;
        if (wavesurfer.current) {
            const currentVol = wavesurfer.current.getVolume();
            if (Math.abs(currentVol - volume) > 0.01) {
                wavesurfer.current.setVolume(volume);
            }
        }
    }, [volume]);

    useEffect(() => {
        if (isPlaying || currentSongIndex !== -1) {
            setIsPlayerView(true);
        }
    }, [currentSongIndex, isPlaying]);

    useEffect(() => {
        songsRef.current = songs;
        currentIndexRef.current = currentSongIndex;
    }, [songs, currentSongIndex]);

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.trim()) {
                searchMusic();
            } else {
                setSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Effect    // Load song when index changes (with Readiness Check)
    useEffect(() => {
        if (currentSongIndex === -1 || !songs[currentSongIndex]) return;
        const song = songs[currentSongIndex];

        const loadSong = async () => {
            // Manage Drag Selection based on song type
            if (regions.current) {
                // First, remove existing listener if any
                if (disableDragRef.current) {
                    disableDragRef.current();
                    disableDragRef.current = null;
                }

                if (song.type !== 'youtube') {
                    // Enable for local files
                    disableDragRef.current = regions.current.enableDragSelection({
                        color: 'rgba(255, 0, 0, 0.1)',
                    });
                }
            }

            if (song.type === 'youtube') {
                if (!navigator.onLine) {
                    alert("You are offline. YouTube songs cannot be played.");
                    setIsPlaying(false);
                    return;
                }
                setIsYouTube(true);
                setYouTubeVideoId(song.src);
                if (wavesurfer.current) wavesurfer.current.pause();
                setAudioInfo({ bpm: 'Simulated', key: 'C Maj', signature: '4/4' });
                setIsPlaying(true);
            } else {
                setIsYouTube(false);
                setYouTubeVideoId(null);

                // Wait for WaveSurfer to be initialized
                if (!wavesurfer.current) {
                    return;
                }

                if (wavesurfer.current) {
                    // Ensure src is valid
                    if (!song.src) {
                        console.error("No source found for song:", song);
                        alert("Error: Song source is missing.");
                        return;
                    }

                    // Attempt to load
                    try {
                        await wavesurfer.current.load(song.src);
                        // Auto-play is handled by 'ready' event or manually here
                        // wavesurfer.current.play(); // Let 'ready' handle it
                    } catch (e) {
                        console.error("WaveSurfer synchronous load error:", e);
                        alert("Failed to load audio: " + e.message);
                    }
                }
            }
        };
        loadSong();

    }, [currentSongIndex, songs]); // Removed isWaveSurferReady to prevent infinite loop

    // Pending Autoplay Effect
    useEffect(() => {
        if (pendingPlayIndex.current !== null && songs.length > pendingPlayIndex.current) {
            const index = pendingPlayIndex.current;
            pendingPlayIndex.current = null;
            playSong(index);
        }
    }, [songs]); // Run when songs list updates

    // Media Session API Support
    useEffect(() => {
        if (wavesurfer.current) {
            wavesurfer.current.setPlaybackRate(playbackRate);
        }
    }, [playbackRate]);

    useEffect(() => {
        if (wavesurfer.current) {
            wavesurfer.current.setPlaybackRate(playbackRate);
        }
    }, [playbackRate]);

    // 4. Real Handlers
    // 4. Real Handlers
    const searchMusic = useCallback(async (queryOverride) => {
        const query = queryOverride || searchQuery;
        if (!query.trim()) return;

        setIsSearching(true);
        setPlaceholder("Searching YouTube (Multi-Key)...");

        // 1. Search Local/Loaded Songs
        const qLower = query.toLowerCase();
        const localMatches = songs.filter(song =>
            song.title.toLowerCase().includes(qLower) ||
            (song.artist && song.artist.toLowerCase().includes(qLower))
        );

        let youtubeResults = [];
        let success = false;

        // API Key Rotation Logic
        const rawKeys = import.meta.env.VITE_YOUTUBE_API_KEYS || import.meta.env.VITE_YOUTUBE_API_KEY || "";
        const apiKeys = rawKeys.split(',').map(k => k.trim()).filter(k => k);

        if (apiKeys.length === 0) {
            console.error("No API Keys provided");
            setPlaceholder("Error: Missing API Keys in .env");
            setIsSearching(false);
            return;
        }

        for (const apiKey of apiKeys) {
            try {
                console.log(`Trying API Key: ...${apiKey.slice(-4)}`);
                const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=${encodeURIComponent(query + ' audio')}&type=video&videoCategoryId=10&key=${apiKey}`);

                if (response.status === 403) {
                    console.warn(`Key ...${apiKey.slice(-4)} quota exceeded. Rotating...`);
                    continue; // Try next key
                }

                if (!response.ok) throw new Error(`Status ${response.status}`);

                const data = await response.json();

                if (data.items) {
                    youtubeResults = data.items.map(item => ({
                        title: item.snippet.title,
                        artist: item.snippet.channelTitle,
                        src: item.id.videoId,
                        type: 'youtube',
                        thumbnail: item.snippet.thumbnails.high ? item.snippet.thumbnails.high.url : item.snippet.thumbnails.default.url
                    }));
                    success = true;
                    break; // Success!
                }
            } catch (e) {
                console.error("YouTube API Error", e);
            }
        }

        if (!success && localMatches.length === 0) {
            setPlaceholder("Search failed. Quota reached/Error.");
            // Error Feedback
            youtubeResults = [{
                title: "Quota Exceeded / Error",
                artist: "All API keys failed. Check .env",
                src: null,
                type: 'error',
                thumbnail: null
            }];
        } else if (success) {
            setPlaceholder("Search 'Top 50 hits'...");
        }

        // Combine
        setSearchResults([...localMatches, ...youtubeResults]);
        setIsSearching(false);
    }, [searchQuery, songs]);

    // Instant Search (Debounced)
    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (searchQuery.trim()) {
                searchMusic();
            } else {
                setSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery, searchMusic]);

    const estimateSignature = (beats) => {
        if (!beats || beats.length < 4) return '4/4';
        const intervals = [];
        for (let i = 1; i < beats.length; i++) {
            intervals.push(beats[i] - beats[i - 1]);
        }
        const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
        let variance = 0;
        intervals.forEach(int => variance += Math.pow(int - avgInterval, 2));
        variance /= intervals.length;
        if (variance > 0.05) return '3/4';
        return '4/4';
    };

    const detectKey = (buffer) => {
        return "C Maj";
    };

    const analyzeAudio = async () => {
        if (!wavesurfer.current || isYouTube) return;
        setIsAnalyzing(true);
        setAudioInfo({ bpm: 'Analyzing...', key: '...', signature: '...' });

        try {
            const buffer = wavesurfer.current.getDecodedData();
            if (!buffer) {
                setAudioInfo({ bpm: '---', key: '---', signature: '---' });
                setIsAnalyzing(false);
                return;
            }
            const channelData = buffer.getChannelData(0);
            setTimeout(() => {
                try {
                    const mt = new MusicTempo(channelData);
                    const bpm = Math.round(mt.tempo);
                    const signature = estimateSignature(mt.beats);
                    const key = detectKey(buffer);
                    setAudioInfo({ bpm: bpm || 'Unknown', key: key, signature: signature });
                } catch (e) {
                    console.error("Analysis failed", e);
                    setAudioInfo({ bpm: 'Error', key: 'Error', signature: '---' });
                }
                setIsAnalyzing(false);
            }, 100);
        } catch (e) {
            console.error("Buffer error", e);
            setIsAnalyzing(false);
        }
    };

    const playSong = (index) => {
        if (index === currentSongIndex) {
            setIsPlayerView(true);
            if (!isPlaying) {
                if (isYouTube && youTubePlayerRef.current) {
                    youTubePlayerRef.current.playVideo();
                } else if (wavesurfer.current) {
                    wavesurfer.current.play();
                }
                setIsPlaying(true);
            }
            return;
        }
        if (index >= 0 && index < songs.length) {
            setCurrentSongIndex(index);
        }
    };

    const handleNext = useCallback(() => {
        const currentSongs = songsRef.current;
        const currentIdx = currentIndexRef.current;
        const mode = loopModeRef.current;
        if (currentSongs.length === 0) return;
        let nextIndex = currentIdx + 1;
        if (nextIndex >= currentSongs.length) {
            if (mode === 'all') nextIndex = 0;
            else return;
        }
        playSong(nextIndex);
    }, [playSong]);

    const handlePrev = useCallback(() => {
        const currentSongs = songsRef.current;
        const currentIdx = currentIndexRef.current;
        const mode = loopModeRef.current;
        if (currentSongs.length === 0) return;
        let prevIndex = currentIdx - 1;
        if (prevIndex < 0) {
            prevIndex = mode === 'all' ? currentSongs.length - 1 : 0;
        }
        playSong(prevIndex);
    }, [playSong]);

    const handlePlayPause = () => {
        if (currentSongIndex === -1 && songs.length > 0) {
            playSong(0);
        } else if (isYouTube) {
            setIsPlaying(!isPlaying);
        } else if (currentSongIndex !== -1) {
            wavesurfer.current.playPause();
        }
    };

    const handleSongEnd = useCallback((event) => {
        const currentIdx = currentIndexRef.current;
        const currentSongs = songsRef.current;
        const mode = loopModeRef.current;
        if (isYouTube) {
            if (mode === 'one' && event && event.target) {
                event.target.seekTo(0);
                event.target.playVideo();
            } else if (mode === 'all') {
                handleNext();
            } else {
                if (currentIdx < currentSongs.length - 1) {
                    handleNext();
                }
            }
        } else {
            if (mode === 'one') {
                wavesurfer.current.play();
            } else if (mode === 'all') {
                handleNext();
            } else {
                if (currentIdx < currentSongs.length - 1) {
                    handleNext();
                }
            }
        }
    }, [isYouTube, handleNext]);

    const handleSkipForward = () => {
        if (isYouTube && youTubePlayerRef.current) {
            const current = youTubePlayerRef.current.getCurrentTime();
            youTubePlayerRef.current.seekTo(current + 10, true);
        } else if (wavesurfer.current) {
            wavesurfer.current.skip(10);
        }
    };

    const handleSkipBackward = () => {
        if (isYouTube && youTubePlayerRef.current) {
            const current = youTubePlayerRef.current.getCurrentTime();
            youTubePlayerRef.current.seekTo(Math.max(0, current - 10), true);
        } else if (wavesurfer.current) {
            wavesurfer.current.skip(-10);
        }
    };

    const handleFileSelect = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const processFile = async (file) => {
            // STRICT AUDIO FILTER: Skip if not audio
            if (!file.type.startsWith('audio/')) return null;

            const url = URL.createObjectURL(file);
            let title = file.name.replace(/\.[^/.]+$/, "");
            let artist = "Unknown Artist";
            let duration = 0;
            let artwork = null;

            try {
                const metadata = await musicMetadata.parseBlob(file);
                title = metadata.common.title || title;
                artist = metadata.common.artist || artist;
                duration = metadata.format.duration || 0;

                const cover = musicMetadata.selectCover(metadata.common.picture);
                if (cover) {
                    artwork = `data:${cover.format};base64,${window.btoa(
                        String.fromCharCode(...new Uint8Array(cover.data))
                    )}`;
                }

            } catch (e) {
                console.warn("Metadata extraction failed", e);
            }

            return {
                title,
                artist,
                src: url, // Blob URL
                thumbnail: artwork,
                duration,
                type: 'local',
                isSaved: false
            };
        };

        const results = await Promise.all(files.map(processFile));
        // Remove non-audio files and Sort A-Z by title
        const newSongs = results
            .filter(s => s !== null)
            .sort((a, b) => a.title.localeCompare(b.title));

        if (newSongs.length > 0) {
            setSongs(prev => {
                const startIndex = prev.length; // Index of first new song
                pendingPlayIndex.current = startIndex; // Auto-play the first new song
                return [...prev, ...newSongs];
            });
        }
    };

    const loadOnlineMusic = () => {
        setSongs(prev => {
            const hasOnline = prev.some(s => s.type === 'online');
            if (hasOnline) return prev;
            return [...prev, ...onlineSongs];
        });
    };

    // WaveSurfer Initialization
    useEffect(() => {
        if (waveformRef.current) {
            wavesurfer.current = WaveSurfer.create({
                container: waveformRef.current,
                waveColor: '#646cff',
                progressColor: '#9333ea',
                cursorColor: '#242424',
                barWidth: 2,
                barGap: 3,
                barRadius: 3,
                responsive: true,
                height: 120,
                normalize: true,
                media: audioRef.current,
                plugins: [
                    TimelinePlugin.create({
                        container: timelineRef.current,
                        primaryColor: '#FFFFFF', // White
                        secondaryColor: '#FFFFFF', // White
                        style: {
                            fontSize: '10px',
                            color: '#FFFFFF' // White text
                        }
                        // timeInterval: null // Let auto-scale for min:sec
                    })
                ]
            });
            const wsRegions = wavesurfer.current.registerPlugin(RegionsPlugin.create());
            regions.current = wsRegions;

            // Initial drag enable (will be managed by song effect later, but default to enabled for initial state if local)
            // Actually, best to leave it disabled until a song loads and we know the type.
            // But for safety, we can initialize it.
            /* 
            disableDragRef.current = wsRegions.enableDragSelection({
                container: waveformRef.current,
                waveColor: '#violet',
                progressColor: 'purple',
                height: 100, // Reduced height for mini player feel
                backend: 'MediaElement',
                plugins: [
                    // RegionsPlugin.create({}), // Register plugin
                    timeline.current
                ]
            });
            */

            wsRegions.on('region-created', (region) => {
                // Enforce single loop: remove all other regions
                regions.current.getRegions().forEach(r => {
                    if (r.id !== region.id) {
                        r.remove();
                    }
                });
                region.setOptions({ loop: true, color: 'rgba(147, 51, 234, 0.3)' });
                region.play();
            });
            wsRegions.on('region-updated', (region) => {
                region.setOptions({ loop: true });
            });
            wsRegions.on('region-double-clicked', (region) => {
                region.remove();
            });
            // Force loop repeat logic explicitly
            wsRegions.on('region-out', (region) => {
                // If we want it to loop repeatedly
                region.play();
            });
            wavesurfer.current.setVolume(volumeRef.current);
            wavesurfer.current.on('play', () => setIsPlaying(true));
            wavesurfer.current.on('pause', () => setIsPlaying(false));
            wavesurfer.current.on('error', (e) => {
                console.error("WaveSurfer Error:", e);
                alert("Playback Error: " + e.message);
            });
            wavesurfer.current.on('timeupdate', (time) => setCurrentTime(time));
            wavesurfer.current.on('ready', (d) => {
                setIsWaveSurferReady(true); // Signal readiness
                setDuration(d);
                analyzeAudio();
                // Auto-play if we intended to play
                if (currentSongIndex !== -1 && songs[currentSongIndex] && songs[currentSongIndex].type !== 'youtube') {
                    wavesurfer.current.play();
                }
                const duration = wavesurfer.current.getDuration();
                if (duration > 0 && timelineRef.current) {
                    // Force timeline redraw if needed
                }
            });
            wavesurfer.current.on('finish', handleSongEnd);
            return () => {
                if (wavesurfer.current) {
                    wavesurfer.current.destroy();
                }
            };
        }
    }, []);

    // Visualizer Effect
    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationId;
        const drawVisualizer = () => {
            const isDark = document.body.getAttribute('data-theme') === 'dark';
            const barColor = isDark ? '167, 139, 250' : '16, 185, 129';
            const width = canvas.width;
            const height = canvas.height;
            ctx.clearRect(0, 0, width, height);
            let dataArray;
            let bufferLength;
            if (isYouTube && isPlaying) {
                bufferLength = 64;
                dataArray = new Uint8Array(bufferLength);
                const time = Date.now() / 300;
                for (let i = 0; i < bufferLength; i++) {
                    const offset = i / bufferLength * Math.PI * 4;
                    const wave1 = Math.sin(time + offset) * 100 + 100;
                    const wave2 = Math.cos(time * 0.5 + offset * 2) * 50;
                    const noise = Math.random() * 20;
                    dataArray[i] = Math.max(0, Math.min(255, wave1 + wave2 + noise));
                }
            } else if (wavesurfer.current) {
                try {
                    // Fallback to simulated for now
                    bufferLength = 64;
                    dataArray = new Uint8Array(bufferLength);
                    const time = Date.now() / 300;
                    for (let i = 0; i < bufferLength; i++) {
                        const offset = i / bufferLength * Math.PI * 4;
                        const wave1 = Math.sin(time + offset) * 100 + 100;
                        const wave2 = Math.cos(time * 0.5 + offset * 2) * 50;
                        const noise = Math.random() * 20;
                        dataArray[i] = Math.max(0, Math.min(255, wave1 + wave2 + noise));
                    }

                } catch (e) {
                    console.warn("Visualizer fallback", e);
                }
            } else {
                bufferLength = 64;
                dataArray = new Uint8Array(bufferLength).fill(0);
                if (currentSongIndex !== -1) {
                    for (let i = 0; i < bufferLength; i++) dataArray[i] = 10;
                }
            }

            const barWidth = (width / bufferLength) * 2.5;
            let barHeight;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                barHeight = dataArray[i] / 2;
                ctx.fillStyle = `rgba(${barColor}, ${dataArray[i] / 255 + 0.5})`;
                ctx.fillRect(x, height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
        };

        const renderFrame = () => {
            animationId = requestAnimationFrame(renderFrame);
            if (isPlaying) {
                drawVisualizer();
            }
        };
        drawVisualizer();
        if (isPlaying) {
            renderFrame();
        } else {
            if (animationId) cancelAnimationFrame(animationId);
            drawVisualizer();
        }
        return () => {
            if (animationId) cancelAnimationFrame(animationId);
        };
    }, [isPlaying, currentSongIndex, duration]);

    // Typewriter Effect
    useEffect(() => {
        const texts = ["Search 'அன்புகூறுவேன்'", "Search 'Top 50 hits of the year'"];
        let textIndex = 0;
        let charIndex = 0;
        let isDeleting = false;
        let timer;
        const type = () => {
            const currentText = texts[textIndex];
            if (isDeleting) {
                setPlaceholder(currentText.substring(0, charIndex - 1));
                charIndex--;
            } else {
                setPlaceholder(currentText.substring(0, charIndex + 1));
                charIndex++;
            }
            if (!isDeleting && charIndex === currentText.length) {
                isDeleting = true;
                timer = setTimeout(type, 2000);
            } else if (isDeleting && charIndex === 0) {
                isDeleting = false;
                textIndex = (textIndex + 1) % texts.length;
                timer = setTimeout(type, 500);
            } else {
                timer = setTimeout(type, isDeleting ? 50 : 100);
            }
        };
        timer = setTimeout(type, 100);
        return () => clearTimeout(timer);
    }, []);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.code === 'Space') {
                e.preventDefault();
                handlePlayPause();
            } else if (e.code === 'ArrowRight') {
                handleSkipForward();
            } else if (e.code === 'ArrowLeft') {
                handleSkipBackward();
            } else if (e.code === 'ArrowRight') {
                handleSkipForward();
            } else if (e.code === 'ArrowLeft') {
                handleSkipBackward();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPlaying, currentSongIndex, loopMode]);

    // A-B Loop Logic using Regions
    const handleSetA = () => {
        if (isYouTube) return;
        const current = wavesurfer.current.getCurrentTime();
        const existing = regions.current.getRegions()[0];
        if (existing) {
            existing.setOptions({ start: current });
        } else {
            regions.current.addRegion({
                start: current,
                end: current + 10,
                color: 'rgba(147, 51, 234, 0.3)',
                drag: true,
                resize: true
            });
        }
    };

    const handleSetB = () => {
        if (isYouTube) return;
        const current = wavesurfer.current.getCurrentTime();
        const existing = regions.current.getRegions()[0];
        if (existing) {
            if (current > existing.start) {
                existing.setOptions({ end: current });
                existing.play();
            }
        } else {
            regions.current.addRegion({
                start: 0,
                end: current,
                color: 'rgba(147, 51, 234, 0.3)',
                drag: true,
                resize: true
            });
            regions.current.getRegions()[0].play();
        }
    };

    const clearAB = () => {
        if (regions.current) regions.current.clearRegions();
        if (wavesurfer.current) wavesurfer.current.zoom(0);
    };

    const toggleLoop = () => {
        if (loopMode === 'off') {
            setLoopMode('all');
        } else if (loopMode === 'all') {
            setLoopMode('one');
        } else {
            setLoopMode('off');
            if (wavesurfer.current) wavesurfer.current.zoom(0);
            if (regions.current) regions.current.clearRegions();
        }
    };

    const formatTime = (time) => {
        if (isNaN(time)) return "0:00";
        const hrs = Math.floor(time / 3600);
        const min = Math.floor((time % 3600) / 60);
        const sec = Math.floor(time % 60);
        if (hrs > 0) {
            return `${hrs}:${min < 10 ? '0' + min : min}:${sec < 10 ? '0' + sec : sec}`;
        }
        return `${min}:${sec < 10 ? '0' + sec : sec}`;
    };

    const getThumbnail = (song) => {
        if (!song) return '';
        if (song.artwork) return song.artwork;
        if (song.thumbnail) return song.thumbnail;
        return 'https://via.placeholder.com/512?text=Music';
    };

    const onPlayerReady = useCallback((player) => {
        youTubePlayerRef.current = player;
    }, []);

    const onPlayerProgress = useCallback((cur, dur) => {
        setCurrentTime(cur);
        if (dur > 0) setDuration(dur);
    }, []);

    const onPlayerVolumeChange = useCallback((vol) => {
        if (Math.abs(vol - volume) > 0.05) {
            setVolume(vol);
        }
    }, [volume]);

    return (
        <div className="music-player-container">
            {/* YouTube Player (Hidden but active) */}
            <div className="youtube-player-hidden">
                <YouTubePlayer
                    key={youTubeVideoId}
                    videoId={youTubeVideoId}
                    isPlaying={isPlaying}
                    volume={volume}
                    onEnd={handleSongEnd}
                    onReady={onPlayerReady}
                    onProgress={onPlayerProgress}
                    onVolumeChange={onPlayerVolumeChange}
                />
            </div>

            {/* Local Audio Element */}
            <audio
                ref={audioRef}
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                controls
                playsInline
                webkit-playsinline="true"
            />

            {/* Top Bar */}
            <div className="player-header">
                <Icon name='angle down' size='large' onClick={() => setIsPlayerView(false)} style={{ cursor: 'pointer' }} />
                <div style={{ display: 'flex', gap: '15px' }}>

                </div>
            </div>

            {/* Main Content Area: Artwork or Search */}
            <div className="main-content">
                {/* Search / List View */}
                {/* Search / List View */}
                <div style={{ display: !isPlayerView ? 'block' : 'none', height: '100%', overflowY: 'auto', paddingBottom: '70px', padding: '20px' }}>
                    {/* Main Content Area (Hidden if Player View is active) */}
                    <div style={{ display: !isPlayerView ? 'block' : 'none', padding: '20px' }}>

                        {/* Mode Toggles */}
                        <div style={{ display: 'flex', marginBottom: '20px', background: '#333', borderRadius: '10px', padding: '5px' }}>
                            <Button
                                fluid
                                color={viewMode === 'online' ? 'red' : 'black'}
                                onClick={() => setViewMode('online')}
                                style={{ flex: 1, marginRight: '5px' }}
                            >
                                <Icon name='youtube' /> Online (YouTube)
                            </Button>
                            <Button
                                fluid
                                color={viewMode === 'local' ? 'green' : 'black'}
                                onClick={() => setViewMode('local')}
                                style={{ flex: 1 }}
                            >
                                <Icon name='folder' /> Local (Offline)
                            </Button>
                        </div>

                        {/* Search Bar (Only Online Mode) */}
                        {viewMode === 'online' && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                background: '#1a1a1a',
                                padding: '10px 15px',
                                borderRadius: '15px',
                                boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
                                marginBottom: '20px'
                            }}>
                                <Icon name='search' size='large' style={{ color: '#aaa', marginRight: '10px' }} />
                                <input
                                    type="text"
                                    placeholder={placeholder}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'white',
                                        fontSize: '18px',
                                        width: '100%',
                                        outline: 'none'
                                    }}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        )}

                        {/* Buttons Row (Only Local Mode) */}
                        {viewMode === 'local' && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <Button color='violet' icon labelPosition='left' onClick={() => folderInputRef.current.click()}>
                                        <Icon name='folder open' /> Folder
                                    </Button>
                                    <Button color='pink' icon labelPosition='left' onClick={() => fileInputRef.current.click()}>
                                        <Icon name='music' /> Files
                                    </Button>
                                    <input type="file" ref={folderInputRef} onChange={handleFileSelect} webkitdirectory="true" directory="true" multiple style={{ display: 'none' }} />
                                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.wma" style={{ display: 'none' }} />
                                </div>
                                <Button.Group size='small'>
                                    <Button icon active={libraryView === 'list'} onClick={() => setLibraryView('list')}>
                                        <Icon name='list' />
                                    </Button>
                                    <Button icon active={libraryView === 'grid'} onClick={() => setLibraryView('grid')}>
                                        <Icon name='grid layout' />
                                    </Button>
                                </Button.Group>
                            </div>
                        )}

                        {/* Library Header (Dynamic based on Mode) */}
                        <div style={{ marginBottom: '20px' }}>
                            <h2 style={{ color: 'white' }}>{viewMode === 'online' ? 'YouTube Results & Bookmarks' : 'Import Folder or Files and Just hear it ! Happy Music 🎧'}</h2>
                            <p style={{ color: '#aaa' }}>{viewMode === 'online' ? 'Requires Internet Connection' : 'Available Offline'}</p>
                        </div>

                        {/* Search Results (Only Online Mode) */}
                        {viewMode === 'online' && searchResults.length > 0 && (
                            <div style={{ marginBottom: '30px' }}>
                                <h3 style={{ color: '#aaa', fontSize: '14px', textTransform: 'uppercase' }}>Search Results</h3>
                                <List divided relaxed selection verticalAlign='middle' inverted>
                                    {searchResults.map((song, i) => (
                                        <List.Item key={i} onClick={() => {
                                            // Smart Resume if same song
                                            if (currentSongIndex !== -1 && songs[currentSongIndex] && songs[currentSongIndex].title === song.title) {
                                                setIsPlayerView(true);
                                                setIsPlaying(true);
                                                return;
                                            }

                                            setSongs(prev => {
                                                const newSongs = [...prev, song];
                                                pendingPlayIndex.current = newSongs.length - 1;
                                                return newSongs;
                                            });
                                            // Wait for effect to trigger play
                                        }} style={{ cursor: 'pointer', padding: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                {song.thumbnail ? (
                                                    <img
                                                        src={song.thumbnail}
                                                        alt="thumb"
                                                        style={{ width: '50px', height: '50px', borderRadius: '5px', objectFit: 'cover', marginRight: '15px' }}
                                                        onError={(e) => { e.target.style.display = 'none'; }}
                                                    />
                                                ) : (
                                                    <Icon name='youtube' color='red' size='large' style={{ marginRight: '15px' }} />
                                                )}
                                                <List.Content>
                                                    <List.Header style={{ color: 'white', fontSize: '16px' }}>{decodeHtml(song.title)}</List.Header>
                                                    <List.Description style={{ color: '#aaa' }}>{decodeHtml(song.artist)}</List.Description>
                                                </List.Content>
                                            </div>
                                        </List.Item>
                                    ))}
                                </List>
                            </div>
                        )}

                        {/* Song List (Filtered by Mode) */}
                        {songs.length > 0 && (
                            <div style={{ paddingBottom: '80px' }}>
                                <h3 style={{ color: '#aaa', fontSize: '14px', textTransform: 'uppercase' }}>
                                    {viewMode === 'online' ? 'Saved Bookmarks' : 'Your Downloads'}
                                </h3>
                                {libraryView === 'list' ? (
                                    <List divided relaxed selection verticalAlign='middle' inverted>
                                        {songs
                                            .map((song, index) => ({ ...song, originalIndex: index }))
                                            .filter(song => {
                                                if (viewMode === 'online') return song.type === 'youtube';
                                                if (viewMode === 'local') return song.type === 'local';
                                                return true;
                                            })
                                            .map((song, i) => (
                                                <List.Item key={i} active={currentSongIndex === song.originalIndex} onClick={() => {
                                                    playSong(song.originalIndex);
                                                    setIsPlayerView(true);
                                                }} style={{ cursor: 'pointer', padding: '10px', background: currentSongIndex === song.originalIndex ? '#333' : 'transparent' }}>
                                                    {/* Hide thumbnail for local files as requested */}
                                                    {(song.type !== 'local') && (song.thumbnail || song.artwork) ? (
                                                        <img src={song.thumbnail || song.artwork} style={{ width: '40px', height: '40px', borderRadius: '4px', marginRight: '10px' }} />
                                                    ) : (
                                                        <List.Icon name='music' size='large' verticalAlign='middle' />
                                                    )}
                                                    <List.Content>
                                                        <List.Header style={{ color: 'white', fontSize: '16px' }}>{decodeHtml(song.title)}</List.Header>
                                                        <List.Description style={{ color: '#aaa' }}>{decodeHtml(song.artist)}</List.Description>
                                                    </List.Content>
                                                </List.Item>
                                            ))}
                                    </List>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '15px' }}>
                                        {songs
                                            .map((song, index) => ({ ...song, originalIndex: index }))
                                            .filter(song => {
                                                if (viewMode === 'online') return song.type === 'youtube';
                                                if (viewMode === 'local') return song.type === 'local';
                                                return true;
                                            })
                                            .map((song, i) => (
                                                <div key={i} onClick={() => {
                                                    playSong(song.originalIndex);
                                                    setIsPlayerView(true);
                                                }} style={{
                                                    background: currentSongIndex === song.originalIndex ? '#444' : '#222',
                                                    padding: '10px',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    textAlign: 'center',
                                                    height: '100px',
                                                    justifyContent: 'center'
                                                }}>
                                                    <Icon name='music' size='large' style={{ marginBottom: '5px', color: '#888' }} />
                                                    <div style={{ color: 'white', fontSize: '12px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                                                        {decodeHtml(song.title)}
                                                    </div>
                                                    <div style={{ color: '#aaa', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                                                        {decodeHtml(song.artist)}
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                )}

                            </div>
                        )}
                    </div>
                </div>

                {/* Mini Player */}
                {
                    !isPlayerView && currentSongIndex !== -1 && songs[currentSongIndex] && (
                        <div className="mini-player" onClick={() => setIsPlayerView(true)}>
                            <img
                                src={getThumbnail(songs[currentSongIndex])}
                                alt="Mini Artwork"
                                className="mini-artwork"
                                onError={(e) => { e.target.src = 'https://via.placeholder.com/40x40?text=Error'; }}
                            />
                            <div className="mini-info">
                                <div className="mini-title">{decodeHtml(songs[currentSongIndex].title)}</div>
                                <div className="mini-artist">{decodeHtml(songs[currentSongIndex].artist)}</div>
                            </div>
                            <div className="mini-controls">
                                <Button
                                    icon={isPlaying ? 'pause' : 'play'}
                                    circular
                                    inverted
                                    size='large'
                                    style={{ background: 'transparent', boxShadow: 'none' }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handlePlayPause();
                                    }}
                                />
                            </div>
                        </div>
                    )
                }

                {/* Player View */}
                <div style={{ display: isPlayerView ? 'flex' : 'none', flexDirection: 'column', height: '100%', width: '100%' }}>
                    <div className="artwork-container">
                        <img
                            src={currentSongIndex !== -1 && songs[currentSongIndex] && songs[currentSongIndex].type !== 'local' ? getThumbnail(songs[currentSongIndex]) : 'https://via.placeholder.com/350x350?text=No+Artwork'}
                            alt="Artwork"
                            className="artwork-image"
                            onError={(e) => { e.target.src = 'https://via.placeholder.com/350x350?text=Error'; }}
                            style={{ display: currentSongIndex !== -1 && songs[currentSongIndex] && songs[currentSongIndex].type === 'local' ? 'none' : 'block' }}
                        />
                        {/* Show Waveform placeholder or visualizer for local files in large view? 
                            Actually, the user wants "waveform with drag to loop feature".
                            The waveform is rendered in 'waveformRef' which is usually below.
                            But if we hide artwork, we might want to ensure the waveform is prominent.
                            The waveform is currently in a different container (not shown in this view snippet?).
                            Let's check where 'waveformRef' is attached. Ah, standard logic for visualization.
                        */}
                    </div>

                    <div className="info-container">
                        <div className="song-title">
                            <div className="marquee-text">
                                {currentSongIndex !== -1 && songs[currentSongIndex] ? decodeHtml(songs[currentSongIndex].title) : 'Choose a song'}
                            </div>
                        </div>
                        <div className="song-artist">
                            <div className="marquee-text">
                                {currentSongIndex !== -1 && songs[currentSongIndex] ? decodeHtml(songs[currentSongIndex].artist) : ''}
                            </div>
                        </div>

                        {/* Waveform Container (Local Files Only) */}
                        <div style={{
                            width: '100%',
                            height: '140px',
                            marginTop: '20px',
                            display: currentSongIndex !== -1 && songs[currentSongIndex] && songs[currentSongIndex].type !== 'youtube' ? 'block' : 'none'
                        }}>
                            <div id="waveform" ref={waveformRef} style={{ width: '100%' }}></div>
                            <div id="wave-timeline" ref={timelineRef} style={{ width: '100%' }}></div>
                            {/* Clear Loop Button moved to controls */}
                        </div>
                    </div>

                    <div className="progress-container">
                        <input
                            type="range"
                            min={0}
                            max={duration || 100}
                            value={currentTime}
                            onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                setCurrentTime(val);
                                if (isYouTube && youTubePlayerRef.current) youTubePlayerRef.current.seekTo(val, true);
                                else if (wavesurfer.current) wavesurfer.current.setTime(val);
                            }}
                            className="progress-slider"
                        />
                        <div className="time-row">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>
                    {/* Speed Slider (Local Files Only) */}
                    {!isYouTube && (
                        <div style={{ padding: '0 25px', marginBottom: '15px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', fontSize: '10px', marginBottom: '5px' }}>
                                <span>Slower</span>
                                <span style={{ fontWeight: 'bold', color: 'white', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setPlaybackRate(1.0)}>Normal</span>
                                <span style={{ fontWeight: 'bold', color: 'white' }}>{playbackRate.toFixed(2)}x</span>
                                <span>Faster</span>
                            </div>
                            <input
                                type="range"
                                min="0.25"
                                max="4.00"
                                step="0.05"
                                value={playbackRate}
                                onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                                className="progress-slider"
                                style={{ background: '#555' }}
                            />
                        </div>
                    )}

                    <div className="controls-container controls-grid" style={isYouTube ? { display: 'flex', justifyContent: 'center', gap: '20px' } : {}}> {/* Use CSS Grid Class unless YouTube */}
                        <button className="control-btn" onClick={() => { }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <Icon name='shuffle' size='large' style={{ margin: 0 }} />
                            <span style={{ fontSize: '10px', marginTop: '4px' }}>Shuffle</span>
                        </button>

                        <button className="control-btn" onClick={handlePrev} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <Icon name='step backward' size='large' style={{ margin: 0 }} />
                            <span style={{ fontSize: '10px', marginTop: '4px' }}>Prev</span>
                        </button>

                        <button className="control-btn" onClick={handleSkipBackward} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <Icon name='undo' size='large' style={{ margin: 0 }} />
                            <span style={{ fontSize: '10px', marginTop: '4px' }}>-10s</span>
                        </button>

                        <button className="play-pause-btn" onClick={handlePlayPause} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '60px', height: '60px' }}>
                            <Icon name={isPlaying ? 'pause' : 'play'} fitted style={{ fontSize: '24px', margin: 0, marginBottom: '2px' }} />
                            <span style={{ fontSize: '10px', color: 'black', fontWeight: 'bold' }}>{isPlaying ? 'Pause' : 'Play'}</span>
                        </button>

                        <button className="control-btn" onClick={handleSkipForward} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <Icon name='redo' size='large' style={{ margin: 0 }} />
                            <span style={{ fontSize: '10px', marginTop: '4px' }}>+10s</span>
                        </button>

                        <button className="control-btn" onClick={handleNext} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <Icon name='step forward' size='large' style={{ margin: 0 }} />
                            <span style={{ fontSize: '10px', marginTop: '4px' }}>Next</span>
                        </button>

                        {!isYouTube && (
                            <button className="control-btn" onClick={(toggleLoop)} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <Icon name='repeat' size='large' color={loopMode !== 'off' ? 'blue' : null} style={{ margin: 0 }} />
                                <span style={{ fontSize: '10px', marginTop: '4px' }}>Loop</span>
                                {loopMode === 'one' && (
                                    <span style={{
                                        position: 'absolute',
                                        top: '30%',
                                        left: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        fontSize: '10px',
                                        color: '#2185d0',
                                        fontWeight: '900',
                                        textShadow: '0 0 2px black'
                                    }}>1</span>
                                )}
                            </button>
                        )}

                        {!isYouTube && (
                            <button className="control-btn" onClick={() => { if (regions.current) regions.current.clearRegions(); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <Icon name='erase' size='large' style={{ margin: 0 }} />
                                <span style={{ fontSize: '10px', marginTop: '4px' }}>Loop Clear</span>
                            </button>
                        )}
                    </div>
                </div>
            </div >



            {/* Overlays (Lyrics, Queue, Related) */}
            {
                playerOverlay && (
                    <div className="lyrics-overlay" style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        background: 'rgba(0,0,0,0.95)', zIndex: 200, padding: '20px',
                        display: 'flex', flexDirection: 'column', overflowY: 'auto'
                    }}>
                        <div style={{ textAlign: 'right', marginBottom: '10px' }}>
                            <Button icon='close' inverted onClick={() => setPlayerOverlay(null)} />
                        </div>

                        {playerOverlay === 'lyrics' && (
                            <Lyrics
                                artist={currentSongIndex !== -1 ? decodeHtml(songs[currentSongIndex].artist) : ''}
                                title={currentSongIndex !== -1 ? decodeHtml(songs[currentSongIndex].title) : ''}
                                currentTime={currentTime}
                                isPlaying={isPlaying}
                            />
                        )}

                        {playerOverlay === 'queue' && (
                            <div style={{ color: 'white' }}>
                                <h3>Up Next</h3>
                                <List divided relaxed selection verticalAlign='middle' inverted>
                                    {songs.map((song, i) => (
                                        <List.Item key={i} active={currentSongIndex === i} onClick={() => {
                                            playSong(i);
                                            setPlayerOverlay(null);
                                        }} style={{ cursor: 'pointer', padding: '10px', background: currentSongIndex === i ? '#ffffff22' : 'transparent' }}>
                                            <List.Icon name={song.type === 'youtube' ? 'youtube' : 'music'} size='large' verticalAlign='middle' />
                                            <List.Content>
                                                <List.Header>{decodeHtml(song.title)}</List.Header>
                                                <List.Description style={{ color: '#aaa' }}>{decodeHtml(song.artist)}</List.Description>
                                            </List.Content>
                                        </List.Item>
                                    ))}
                                </List>
                            </div>
                        )}

                        {playerOverlay === 'related' && (
                            <div style={{ color: 'white' }}>
                                <h3>Related Songs</h3>
                                <p style={{ color: '#aaa' }}>Results for "{currentSongIndex !== -1 ? decodeHtml(songs[currentSongIndex].artist) : ''}"</p>
                                <div style={{ padding: '20px', textAlign: 'center', opacity: 0.7 }}>
                                    <Icon name='search' size='huge' />
                                    <p style={{ marginTop: '10px' }}>Feature coming soon: Auto-fetching related tracks.</p>
                                    <Button onClick={() => {
                                        setSearchQuery(currentSongIndex !== -1 ? songs[currentSongIndex].artist : '');
                                        setIsPlayerView(false);
                                        setPlayerOverlay(null);
                                    }}>Search Artist</Button>
                                </div>
                            </div>
                        )}
                    </div>
                )
            }

            {/* Bottom Tabs */}
            <div className="bottom-tabs">
                <div className="tab-item" onClick={() => setPlayerOverlay('queue')}>
                    <Icon name='list ol' />
                    <span>Up Next</span>
                </div>
                {viewMode === 'online' && (
                    <>
                        <div className="tab-item" onClick={() => setPlayerOverlay('lyrics')}>
                            <Icon name='file alternate outline' />
                            <span>Lyrics</span>
                        </div>
                        <div className="tab-item" onClick={() => setPlayerOverlay('related')}>
                            <Icon name='grid layout' />
                            <span>Related</span>
                        </div>
                    </>
                )}
            </div>

        </div >
    );
};
export default MusicPlayer;
