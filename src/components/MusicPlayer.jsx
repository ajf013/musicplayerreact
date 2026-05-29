
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon, Button, Tab, List, Segment, Label, Statistic, Message } from 'semantic-ui-react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import MusicTempo from 'music-tempo';
import { LiveAudioVisualizer } from 'react-audio-visualize';
import { openDB } from 'idb';
// import axios from 'axios'; // Removed
import defaultArtwork from '../assets/default_artwork.png';
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

const MusicPlayer = ({ isMobile, theme, toggleTheme }) => {
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
    const [showPermissionModal, setShowPermissionModal] = useState(false);
    const [isScanning, setIsScanning] = useState(false);

    // View & Ref State
    const [isPlayerView, setIsPlayerView] = useState(false);
    const [playerOverlay, setPlayerOverlay] = useState(null); // 'lyrics', 'queue', 'related'
    const [viewMode, setViewMode] = useState('online'); // 'online' or 'local'
    const [libraryView, setLibraryView] = useState('list'); // 'list' or 'grid'
    const [isWaveSurferReady, setIsWaveSurferReady] = useState(false); // Playback readiness check
    const [playbackRate, setPlaybackRate] = useState(1.0);

    // Enhanced Features State
    const [favorites, setFavorites] = useState([]);
    const [favoriteSongs, setFavoriteSongs] = useState([]);
    const [playlists, setPlaylists] = useState([]);
    const [showPlaylistModal, setShowPlaylistModal] = useState(false);
    const [playlistToAddTo, setPlaylistToAddTo] = useState(null);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [eqGains, setEqGains] = useState([0, 0, 0, 0, 0]);
    const [eqPreset, setEqPreset] = useState('Flat');
    const [visualizerMode, setVisualizerMode] = useState('bars');
    const [sleepTimer, setSleepTimer] = useState(0);
    const [showSleepTimerModal, setShowSleepTimerModal] = useState(false);
    const [dominantColor, setDominantColor] = useState('rgba(147, 51, 234, 0.4)');
    const [relatedSongs, setRelatedSongs] = useState([]);
    const [isFetchingRelated, setIsFetchingRelated] = useState(false);

    const presets = {
        'Flat': [0, 0, 0, 0, 0],
        'Bass Booster': [6, 4, 0, 0, -2],
        'Vocal Booster': [-2, 0, 3, 4, 1],
        'Rock': [4, 2, -1, 2, 4],
        'Pop': [-1, 2, 4, 2, -1],
        'Classical': [3, 2, 0, 2, 3],
        'Electronic': [5, 3, 0, 2, 4]
    };

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

    // Web Audio Refs
    const audioCtxRef = useRef(null);
    const audioSourceRef = useRef(null);
    const eqFiltersRef = useRef([]);
    const analyserRef = useRef(null);

    // Track ID Generator (Stable identification)
    const getTrackId = (song) => {
        if (!song) return '';
        return song.type === 'youtube' ? `youtube::${song.src}` : `local::${song.title}::${song.artist}`;
    };

    // IndexedDB Helper Upgraded to Version 3
    const initDB = async () => {
        try {
            const db = await openDB('MusicPlayerDB', 3, {
                upgrade(db, oldVersion, newVersion, transaction) {
                    if (!db.objectStoreNames.contains('songs')) {
                        db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
                    }
                    if (!db.objectStoreNames.contains('settings')) {
                        db.createObjectStore('settings');
                    }
                    if (!db.objectStoreNames.contains('favorites')) {
                        db.createObjectStore('favorites', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('playlists')) {
                        db.createObjectStore('playlists', { keyPath: 'name' });
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
    // Permission Check & Auto-Load
    useEffect(() => {
        const checkPermission = async () => {
            const hasAccess = localStorage.getItem('hasFolderAccess');
            if (!hasAccess) {
                // First launch (or reset): Show modal
                if (viewMode === 'local') setShowPermissionModal(true);
            } else {
                // Has access flag, try to recover handle silently
                try {
                    const db = await initDB();
                    const dirHandle = await db.get('settings', 'dirHandle');
                    if (dirHandle) {
                        const opts = { mode: 'read' };
                        // Silent verify
                        if ((await dirHandle.queryPermission(opts)) === 'granted') {
                            if (viewMode === 'local' && songs.length === 0) {
                                scanAndLoad(dirHandle);
                            }
                        }
                        // If not granted, we can't request in useEffect (needs gesture).
                        // Wait for user to click 'Local' button (enterLocalMode)
                    } else {
                        // Flag exists but no handle in IDB (maybe cleared). Reset.
                        localStorage.removeItem('hasFolderAccess');
                        if (viewMode === 'local') setShowPermissionModal(true);
                    }
                } catch (e) {
                    console.error("Error restoring handle", e);
                }
            }
        };
        // Run on mount AND when switching to local
        if (viewMode === 'local') checkPermission();
    }, [viewMode]);

    const scanDirectory = async (dirHandle, fileList = []) => {
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                if (/\.(mp3|wav|ogg|flac|m4a|aac|wma)$/i.test(entry.name)) {
                    const file = await entry.getFile();
                    fileList.push(file);
                }
            } else if (entry.kind === 'directory') {
                await scanDirectory(entry, fileList);
            }
        }
        return fileList;
    };

    const scanAndLoad = async (dirHandle) => {
        setIsScanning(true);
        try {
            const files = await scanDirectory(dirHandle);
            // Process files (MusicPlayer.handleFileSelect logic reuse?)
            // We need to parse blobs.
            const processFile = async (file) => {
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
                } catch (e) { console.warn("Meta fail", e); }
                return { title, artist, src: URL.createObjectURL(file), thumbnail: artwork || defaultArtwork, duration, type: 'local', isSaved: false };
            };

            // Limit concurrent processing if too many files?
            // For now, Promise.all might be heavy if 1000s of songs.
            // Using batching or sequential for large lists recommended.
            // For simplicity in this step, taking first 50 or ensuring user import is handled.
            // User said "folder of 10 files".
            const results = await Promise.all(files.map(processFile));
            const newSongs = results.sort((a, b) => a.title.localeCompare(b.title));
            if (newSongs.length > 0) {
                setSongs(prev => [...prev, ...newSongs]);
                setViewMode('local');
            }
        } catch (e) {
            console.error("Scan failed", e);
        } finally {
            setIsScanning(false);
        }
    };

    const handleGrantAccess = async () => {
        try {
            // 'window.showDirectoryPicker' is experimental
            if ('showDirectoryPicker' in window) {
                const dirHandle = await window.showDirectoryPicker({
                    id: 'music_folder',
                    mode: 'read'
                });
                const db = await initDB();
                await db.put('settings', dirHandle, 'dirHandle');
                localStorage.setItem('hasFolderAccess', 'true');
                setShowPermissionModal(false);
                await scanAndLoad(dirHandle);
            } else {
                alert("Your browser does not support Folder Access API. Please use the Import Folder button.");
                setShowPermissionModal(false);
            }
        } catch (e) {
            console.error("Access denied or error", e);
            // User cancelled
        }
    };

    const enterLocalMode = async () => {
        setViewMode('local');
        // Try to restore access immediately with user gesture
        try {
            const db = await initDB();
            const dirHandle = await db.get('settings', 'dirHandle');
            if (dirHandle) {
                const opts = { mode: 'read' };
                if ((await dirHandle.queryPermission(opts)) === 'granted') {
                    if (songs.length === 0) await scanAndLoad(dirHandle);
                } else {
                    // Request permission (allowed here due to click)
                    if ((await dirHandle.requestPermission(opts)) === 'granted') {
                        if (songs.length === 0) await scanAndLoad(dirHandle);
                    } else {
                        // User denied re-request, show modal to explain or restart
                        setShowPermissionModal(true);
                    }
                }
            } else {
                // No handle found (despite maybe flag being set?), show modal
                setShowPermissionModal(true);
            }
        } catch (e) {
            console.error("Error entering local mode", e);
            setShowPermissionModal(true); // Fallback
        }
    };

    const saveCurrentSong = async () => {
        // Disabled/Removed feature
        console.log("Save feature disabled.");
    };

    // Load persisted data (Favorites and Playlists) from IndexedDB
    const loadPersistedData = async () => {
        try {
            const db = await initDB();
            const favs = await db.getAll('favorites');
            setFavorites(favs.map(f => f.id));
            setFavoriteSongs(favs.map(f => f.song));

            const lists = await db.getAll('playlists');
            setPlaylists(lists || []);
        } catch (e) {
            console.error("Failed to load persisted data:", e);
        }
    };

    useEffect(() => {
        loadPersistedData();
    }, []);

    // Toggle favorite track
    const toggleFavorite = async (song) => {
        if (!song) return;
        const trackId = getTrackId(song);
        const isFav = favorites.includes(trackId);

        try {
            const db = await initDB();
            if (isFav) {
                await db.delete('favorites', trackId);
                setFavorites(prev => prev.filter(id => id !== trackId));
                setFavoriteSongs(prev => prev.filter(s => getTrackId(s) !== trackId));
            } else {
                const songData = {
                    title: song.title,
                    artist: song.artist,
                    src: song.src,
                    thumbnail: song.thumbnail || null,
                    type: song.type,
                    duration: song.duration || 0
                };
                const favRecord = { id: trackId, song: songData };
                await db.put('favorites', favRecord);
                setFavorites(prev => [...prev, trackId]);
                setFavoriteSongs(prev => [...prev, songData]);
            }
        } catch (e) {
            console.error("Failed to toggle favorite:", e);
        }
    };

    // Create a playlist
    const createPlaylist = async (name) => {
        if (!name.trim()) return;
        try {
            const db = await initDB();
            const existing = await db.get('playlists', name.trim());
            if (existing) {
                alert("Playlist already exists!");
                return;
            }
            const newPlaylist = { name: name.trim(), songs: [] };
            await db.put('playlists', newPlaylist);
            setPlaylists(prev => [...prev, newPlaylist]);
            setNewPlaylistName('');
        } catch (e) {
            console.error("Failed to create playlist:", e);
        }
    };

    // Add track to playlist
    const addSongToPlaylist = async (playlistName, song) => {
        try {
            const db = await initDB();
            const playlist = await db.get('playlists', playlistName);
            if (playlist) {
                const trackId = getTrackId(song);
                const hasSong = playlist.songs.some(s => getTrackId(s) === trackId);
                if (hasSong) {
                    alert("Song already in playlist!");
                    return;
                }
                const songData = {
                    title: song.title,
                    artist: song.artist,
                    src: song.src,
                    thumbnail: song.thumbnail || null,
                    type: song.type,
                    duration: song.duration || 0
                };
                playlist.songs.push(songData);
                await db.put('playlists', playlist);
                setPlaylists(prev => prev.map(p => p.name === playlistName ? playlist : p));
            }
        } catch (e) {
            console.error("Failed to add song to playlist:", e);
        }
    };

    // Remove track from playlist
    const removeSongFromPlaylist = async (playlistName, song) => {
        try {
            const db = await initDB();
            const playlist = await db.get('playlists', playlistName);
            if (playlist) {
                const trackId = getTrackId(song);
                playlist.songs = playlist.songs.filter(s => getTrackId(s) !== trackId);
                await db.put('playlists', playlist);
                setPlaylists(prev => prev.map(p => p.name === playlistName ? playlist : p));
            }
        } catch (e) {
            console.error("Failed to remove song from playlist:", e);
        }
    };

    // Delete playlist
    const deletePlaylist = async (name) => {
        try {
            const db = await initDB();
            await db.delete('playlists', name);
            setPlaylists(prev => prev.filter(p => p.name !== name));
        } catch (e) {
            console.error("Failed to delete playlist:", e);
        }
    };

    // Play all playlist songs
    const playPlaylist = (playlist) => {
        if (!playlist || playlist.songs.length === 0) return;

        const resolvedSongs = playlist.songs.map(pSong => {
            if (pSong.type === 'local') {
                const match = songs.find(s => s.type === 'local' && s.title === pSong.title && s.artist === pSong.artist);
                if (match) {
                    return { ...pSong, src: match.src };
                }
            }
            return pSong;
        });

        setSongs(resolvedSongs);
        setCurrentSongIndex(0);
        setIsPlayerView(true);
        setIsPlaying(true);
    };

    // Initialize Web Audio API EQ & Analyser
    const initWebAudio = () => {
        if (audioCtxRef.current) {
            if (audioCtxRef.current.state === 'suspended') {
                audioCtxRef.current.resume();
            }
            return;
        }

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContextClass();
            audioCtxRef.current = ctx;

            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyserRef.current = analyser;

            const frequencies = [60, 230, 910, 4000, 14000];
            const filters = frequencies.map((freq, idx) => {
                const filter = ctx.createBiquadFilter();
                if (idx === 0) {
                    filter.type = 'lowshelf';
                } else if (idx === frequencies.length - 1) {
                    filter.type = 'highshelf';
                } else {
                    filter.type = 'peaking';
                    filter.Q.value = 1.0;
                }
                filter.frequency.value = freq;
                filter.gain.value = eqGains[idx];
                return filter;
            });
            eqFiltersRef.current = filters;

            const source = ctx.createMediaElementSource(audioRef.current);
            audioSourceRef.current = source;

            let current = source;
            filters.forEach(filter => {
                current.connect(filter);
                current = filter;
            });
            current.connect(analyser);
            analyser.connect(ctx.destination);
        } catch (e) {
            console.error("Failed to initialize Web Audio context:", e);
        }
    };

    // Dynamic color extraction
    const extractDominantColor = (imageUrl) => {
        if (!imageUrl || imageUrl === defaultArtwork) {
            setDominantColor('rgba(147, 51, 234, 0.4)');
            return;
        }

        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = imageUrl;
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 10;
                canvas.height = 10;
                ctx.drawImage(img, 0, 0, 10, 10);
                const data = ctx.getImageData(0, 0, 10, 10).data;

                let r = 0, g = 0, b = 0, count = 0;
                for (let i = 0; i < data.length; i += 4) {
                    const brightness = (data[i] * 299 + data[i+1] * 587 + data[i+2] * 114) / 1000;
                    if (brightness > 30 && brightness < 220) {
                        r += data[i];
                        g += data[i+1];
                        b += data[i+2];
                        count++;
                    }
                }

                if (count > 0) {
                    r = Math.round(r / count);
                    g = Math.round(g / count);
                    b = Math.round(b / count);
                    setDominantColor(`rgba(${r}, ${g}, ${b}, 0.45)`);
                } else {
                    let sr = 0, sg = 0, sb = 0;
                    for (let i = 0; i < data.length; i += 4) {
                        sr += data[i];
                        sg += data[i+1];
                        sb += data[i+2];
                    }
                    const total = data.length / 4;
                    setDominantColor(`rgba(${Math.round(sr/total)}, ${Math.round(sg/total)}, ${Math.round(sb/total)}, 0.45)`);
                }
            } catch (e) {
                setDominantColor('rgba(147, 51, 234, 0.4)');
            }
        };
        img.onerror = () => {
            setDominantColor('rgba(147, 51, 234, 0.4)');
        };
    };

    // YouTube Related Songs Fetcher
    const fetchRelatedSongs = async (song) => {
        if (!song || song.type !== 'youtube') {
            setRelatedSongs([]);
            return;
        }

        setIsFetchingRelated(true);
        const rawKeys = import.meta.env.VITE_YOUTUBE_API_KEYS || import.meta.env.VITE_YOUTUBE_API_KEY || "";
        const apiKeys = rawKeys.split(',').map(k => k.trim()).filter(k => k);

        if (apiKeys.length === 0) {
            setIsFetchingRelated(false);
            return;
        }

        let success = false;
        let results = [];

        for (const apiKey of apiKeys) {
            try {
                const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&type=video&videoCategoryId=10&relatedToVideoId=${song.src}&key=${apiKey}`);
                if (response.status === 403) continue;
                if (!response.ok) throw new Error("API Error");

                const data = await response.json();
                if (data.items) {
                    results = data.items.map(item => ({
                        title: item.snippet.title,
                        artist: item.snippet.channelTitle,
                        src: item.id.videoId,
                        type: 'youtube',
                        thumbnail: item.snippet.thumbnails.high ? item.snippet.thumbnails.high.url : item.snippet.thumbnails.default.url
                    }));
                    success = true;
                    break;
                }
            } catch (e) {
                console.warn("Related search failed, rotating key...", e);
            }
        }

        if (!success) {
            const query = `${song.artist} music`;
            for (const apiKey of apiKeys) {
                try {
                    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&key=${apiKey}`);
                    if (response.status === 403) continue;
                    if (!response.ok) throw new Error("API Error");

                    const data = await response.json();
                    if (data.items) {
                        results = data.items.map(item => ({
                            title: item.snippet.title,
                            artist: item.snippet.channelTitle,
                            src: item.id.videoId,
                            type: 'youtube',
                            thumbnail: item.snippet.thumbnails.high ? item.snippet.thumbnails.high.url : item.snippet.thumbnails.default.url
                        }));
                        success = true;
                        break;
                    }
                } catch (e) {
                    console.warn("Fallback related search failed...", e);
                }
            }
        }

        setRelatedSongs(results);
        setIsFetchingRelated(false);
    };

    // Equalizer gains effect
    useEffect(() => {
        eqFiltersRef.current.forEach((filter, idx) => {
            if (filter) {
                filter.gain.value = eqGains[idx];
            }
        });
    }, [eqGains]);

    // Sleep Timer countdown effect
    useEffect(() => {
        if (sleepTimer <= 0) return;

        const interval = setInterval(() => {
            setSleepTimer(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    if (isYouTube && youTubePlayerRef.current) {
                        youTubePlayerRef.current.pauseVideo();
                    } else if (wavesurfer.current) {
                        wavesurfer.current.pause();
                    }
                    setIsPlaying(false);
                    if (wavesurfer.current) wavesurfer.current.setVolume(volume);
                    return 0;
                }

                const remaining = prev - 1;
                if (remaining <= 10) {
                    const fadeFactor = remaining / 10;
                    if (wavesurfer.current) {
                        wavesurfer.current.setVolume(volume * fadeFactor);
                    }
                    if (isYouTube && youTubePlayerRef.current) {
                        youTubePlayerRef.current.setVolume(volume * fadeFactor * 100);
                    }
                }

                return remaining;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [sleepTimer, isPlaying, volume, isYouTube]);

    // Pre-fetch related songs and extract dynamic theme colors on song changes
    useEffect(() => {
        if (currentSongIndex !== -1 && songs[currentSongIndex]) {
            const song = songs[currentSongIndex];
            const thumb = getThumbnail(song);
            extractDominantColor(thumb);
            fetchRelatedSongs(song);
        } else {
            setDominantColor('rgba(147, 51, 234, 0.4)');
        }
    }, [currentSongIndex, songs]);

    const handlePresetChange = (presetName) => {
        setEqPreset(presetName);
        if (presets[presetName]) {
            setEqGains(presets[presetName]);
        }
    };

    const handleGainChange = (index, value) => {
        setEqPreset('Custom');
        setEqGains(prev => {
            const next = [...prev];
            next[index] = value;
            return next;
        });
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
                        // Force Play logic
                        if (isPlaying) {
                            wavesurfer.current.play().catch(e => console.warn("Auto-play blocked", e));
                        }
                    } catch (e) {
                        console.error("WaveSurfer synchronous load error:", e);
                        // alert("Failed to load audio: " + e.message); // Suppress alert for smooth list transitions?
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
        initWebAudio();
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
        initWebAudio();
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

    // Visualizer Effect (Optimized & Multi-Mode)
    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationId;
        const bufferLength = 64;
        const dataArray = new Uint8Array(bufferLength);

        const drawVisualizer = () => {
            const isDark = document.body.getAttribute('data-theme') === 'dark';
            const barColor = isDark ? '139, 92, 246' : '16, 185, 129';
            const width = canvas.width;
            const height = canvas.height;
            ctx.clearRect(0, 0, width, height);

            if (!isYouTube && analyserRef.current) {
                if (visualizerMode === 'oscilloscope') {
                    analyserRef.current.getByteTimeDomainData(dataArray);
                } else {
                    analyserRef.current.getByteFrequencyData(dataArray);
                }
            } else if (isPlaying) {
                // Simulated backup for YouTube or when audio node connection is pending
                const time = Date.now() / 300;
                for (let i = 0; i < bufferLength; i++) {
                    const offset = (i / bufferLength) * Math.PI * 4;
                    const wave1 = Math.sin(time + offset) * 100 + 100;
                    const wave2 = Math.cos(time * 0.5 + offset * 2) * 50;
                    const noise = Math.random() * 20;
                    dataArray[i] = Math.max(0, Math.min(255, wave1 + wave2 + noise));
                }
            } else {
                dataArray.fill(visualizerMode === 'oscilloscope' ? 128 : 0);
            }

            if (visualizerMode === 'circle') {
                const centerX = width / 2;
                const centerY = height / 2;
                const baseRadius = Math.min(width, height) * 0.3;
                
                ctx.strokeStyle = `rgba(${barColor}, 0.8)`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                
                for (let i = 0; i < bufferLength; i++) {
                    const angle = (i / bufferLength) * Math.PI * 2;
                    const val = dataArray[i] / 255;
                    const offset = val * 50;
                    const r = baseRadius + offset;
                    
                    const xVal = centerX + Math.cos(angle) * r;
                    const yVal = centerY + Math.sin(angle) * r;
                    
                    if (i === 0) {
                        ctx.moveTo(xVal, yVal);
                    } else {
                        ctx.lineTo(xVal, yVal);
                    }
                }
                ctx.closePath();
                ctx.stroke();
                
                ctx.fillStyle = `rgba(${barColor}, 0.15)`;
                ctx.beginPath();
                ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
                ctx.fill();
            } else if (visualizerMode === 'oscilloscope') {
                ctx.strokeStyle = `rgba(${barColor}, 0.9)`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                
                const sliceWidth = width / bufferLength;
                let xVal = 0;
                
                for (let i = 0; i < bufferLength; i++) {
                    const v = dataArray[i] / 128.0;
                    const yVal = (v * height) / 2;
                    
                    if (i === 0) {
                        ctx.moveTo(xVal, yVal);
                    } else {
                        ctx.lineTo(xVal, yVal);
                    }
                    
                    xVal += sliceWidth;
                }
                
                ctx.lineTo(width, height / 2);
                ctx.stroke();
            } else {
                // Spectrum Bars (Default)
                const barWidth = (width / bufferLength) * 1.6;
                let barHeight;
                let xVal = 0;
                
                const gradient = ctx.createLinearGradient(0, height, 0, 0);
                gradient.addColorStop(0, `rgba(${barColor}, 0.2)`);
                gradient.addColorStop(0.5, `rgba(${barColor}, 0.8)`);
                gradient.addColorStop(1, `rgba(${barColor}, 1.0)`);
                
                for (let i = 0; i < bufferLength; i++) {
                    barHeight = (dataArray[i] / 255) * height * 0.8;
                    ctx.fillStyle = gradient;
                    ctx.fillRect(xVal, height - barHeight, barWidth, barHeight);
                    xVal += barWidth + 1;
                }
            }
        };

        const renderFrame = () => {
            if (!document.hidden && isPlaying) {
                drawVisualizer();
            }
            animationId = requestAnimationFrame(renderFrame);
        };

        drawVisualizer();

        if (isPlaying) {
            renderFrame();
        } else {
            drawVisualizer();
            if (animationId) cancelAnimationFrame(animationId);
        }

        return () => {
            if (animationId) cancelAnimationFrame(animationId);
        };
    }, [isPlaying, currentSongIndex, duration, visualizerMode]);

    // MediaSession API Integration
    useEffect(() => {
        if ('mediaSession' in navigator) {
            const currentSong = songs[currentSongIndex];
            if (currentSong) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: decodeHtml(currentSong.title) || 'Unknown Title',
                    artist: decodeHtml(currentSong.artist) || 'Unknown Artist',
                    album: 'Music Player',
                    artwork: [
                        { src: currentSong.thumbnail || currentSong.artwork || defaultArtwork, sizes: '512x512', type: 'image/png' }
                    ]
                });

                navigator.mediaSession.setActionHandler('play', () => { handlePlayPause(); });
                navigator.mediaSession.setActionHandler('pause', () => { handlePlayPause(); });
                navigator.mediaSession.setActionHandler('previoustrack', () => { handlePrev(); });
                navigator.mediaSession.setActionHandler('nexttrack', () => { handleNext(); });
                // Replace Seek with Prev/Next as requested for Lock Screen
                navigator.mediaSession.setActionHandler('seekbackward', null); // Disable or map to skip
                navigator.mediaSession.setActionHandler('seekforward', null);
            }
        }
    }, [currentSongIndex, songs, isPlaying, handlePlayPause, handlePrev, handleNext]);

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
        return defaultArtwork; // Use the treble clef
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
        <div className="music-player-container" style={{
            background: `linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.98)), radial-gradient(circle at 50% 30%, ${dominantColor}, transparent 70%)`,
            transition: 'background 1.5s ease'
        }}>
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
                crossOrigin="anonymous"
            />

            {/* Top Bar */}
            <div className="player-header">
                {isPlayerView ? (
                    <>
                        <Icon name='arrow left' size='large' onClick={() => setIsPlayerView(false)} style={{ cursor: 'pointer' }} />
                        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                            {/* Sleep Timer Indicator/Button */}
                            <div style={{ position: 'relative', cursor: 'pointer', padding: '5px' }} onClick={() => setShowSleepTimerModal(true)}>
                                <Icon name='clock outline' size='large' color={sleepTimer > 0 ? 'violet' : null} />
                                {sleepTimer > 0 && (
                                    <span style={{
                                        position: 'absolute',
                                        top: '-6px',
                                        right: '-6px',
                                        background: '#9333ea',
                                        color: 'white',
                                        borderRadius: '50%',
                                        padding: '2px 5px',
                                        fontSize: '8px',
                                        fontWeight: 'bold'
                                    }}>
                                        {Math.ceil(sleepTimer / 60)}m
                                    </span>
                                )}
                            </div>

                            {/* Favorite Heart Button */}
                            {currentSongIndex !== -1 && (
                                <Icon 
                                    name={favorites.includes(getTrackId(songs[currentSongIndex])) ? 'heart' : 'heart outline'} 
                                    size='large' 
                                    color={favorites.includes(getTrackId(songs[currentSongIndex])) ? 'pink' : null} 
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => toggleFavorite(songs[currentSongIndex])}
                                />
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Icon name="music" color="violet" /> Music Player
                        </div>
                        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                            {/* Sleep Timer Indicator/Button */}
                            {currentSongIndex !== -1 && (
                                <div style={{ position: 'relative', cursor: 'pointer', padding: '5px' }} onClick={() => setShowSleepTimerModal(true)}>
                                    <Icon name='clock outline' size='large' color={sleepTimer > 0 ? 'violet' : null} />
                                    {sleepTimer > 0 && (
                                        <span style={{
                                            position: 'absolute',
                                            top: '-6px',
                                            right: '-6px',
                                            background: '#9333ea',
                                            color: 'white',
                                            borderRadius: '50%',
                                            padding: '2px 5px',
                                            fontSize: '8px',
                                            fontWeight: 'bold'
                                        }}>
                                            {Math.ceil(sleepTimer / 60)}m
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Theme Toggle */}
                            {toggleTheme && (
                                <div 
                                    className="theme-toggle-btn"
                                    onClick={toggleTheme}
                                    style={{ 
                                        cursor: 'pointer',
                                        padding: '6px',
                                        borderRadius: '50%',
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.3s ease'
                                    }}
                                >
                                    <Icon name={theme === 'light' ? 'sun' : 'moon'} size='large' style={{ margin: 0 }} />
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Main Content Area: Artwork or Search */}
            <div className="main-content">
                {/* Search / List View */}
                <div style={{ display: !isPlayerView ? 'block' : 'none', height: '100%', overflowY: 'auto', paddingBottom: '70px', padding: '20px' }}>
                    <div style={{ padding: '20px' }}>

                        {/* Mode Toggles */}
                        <div className="view-mode-tabs">
                            <Button
                                className={`view-mode-btn ${viewMode === 'online' ? 'active-online' : ''}`}
                                onClick={() => setViewMode('online')}
                                size='small'
                            >
                                <Icon name='youtube' /> YouTube
                            </Button>
                            <Button
                                className={`view-mode-btn ${viewMode === 'local' ? 'active-local' : ''}`}
                                onClick={() => enterLocalMode()}
                                size='small'
                            >
                                <Icon name='folder' /> Local
                            </Button>
                            <Button
                                className={`view-mode-btn ${viewMode === 'favorites' ? 'active-favorites' : ''}`}
                                onClick={() => setViewMode('favorites')}
                                size='small'
                            >
                                <Icon name='heart' /> Favorites
                            </Button>
                            <Button
                                className={`view-mode-btn ${viewMode === 'playlists' ? 'active-playlists' : ''}`}
                                onClick={() => setViewMode('playlists')}
                                size='small'
                            >
                                <Icon name='list' /> Playlists
                            </Button>
                        </div>

                        {/* Search Bar (Only Online Mode) */}
                        {viewMode === 'online' && (
                            <div className="search-bar-container">
                                <Icon name='search' size='large' style={{ color: '#aaa', marginRight: '10px' }} />
                                <input
                                    type="text"
                                    placeholder={placeholder}
                                    className="search-bar-input"
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
                            <h2 style={{ color: 'var(--player-text)' }}>
                                {viewMode === 'online' && 'YouTube Search'}
                                {viewMode === 'local' && 'Offline Library'}
                                {viewMode === 'favorites' && 'Favorites Collection'}
                                {viewMode === 'playlists' && 'Custom Playlists'}
                            </h2>
                            <p style={{ color: '#aaa' }}>
                                {viewMode === 'online' && 'Search and stream audio from YouTube'}
                                {viewMode === 'local' && 'Play local audio files directly from folder'}
                                {viewMode === 'favorites' && 'Access your favorited local and online tracks'}
                                {viewMode === 'playlists' && 'Manage your custom audio lists'}
                            </p>
                        </div>

                        {/* Favorites View */}
                        {viewMode === 'favorites' && (
                            <div style={{ paddingBottom: '80px' }}>
                                {favoriteSongs.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px 20px', opacity: 0.5 }}>
                                        <Icon name='heart outline' size='huge' style={{ color: '#f43f5e' }} />
                                        <p style={{ marginTop: '15px', fontSize: '16px' }}>No favorite songs yet.</p>
                                        <p style={{ fontSize: '13px' }}>Heart tracks in search or local mode to add them here.</p>
                                    </div>
                                ) : (
                                    <List divided relaxed selection verticalAlign='middle' inverted={theme === 'dark'}>
                                        {favoriteSongs.map((song, i) => (
                                            <List.Item key={i} style={{ padding: '10px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                    <div onClick={() => {
                                                        if (song.type === 'local') {
                                                            const matchIndex = songs.findIndex(s => s.type === 'local' && s.title === song.title && s.artist === song.artist);
                                                            if (matchIndex !== -1) {
                                                                playSong(matchIndex);
                                                                setIsPlayerView(true);
                                                            } else {
                                                                alert("Please import your local folder first to play this local track!");
                                                            }
                                                        } else {
                                                            setSongs(prev => {
                                                                const newSongs = [...prev, song];
                                                                pendingPlayIndex.current = newSongs.length - 1;
                                                                return newSongs;
                                                            });
                                                        }
                                                    }} style={{ display: 'flex', alignItems: 'center', flex: 1, cursor: 'pointer' }}>
                                                        {song.thumbnail ? (
                                                            <img src={song.thumbnail} style={{ width: '40px', height: '40px', borderRadius: '4px', marginRight: '15px', objectFit: 'cover' }} />
                                                        ) : (
                                                            <Icon name={song.type === 'local' ? 'music' : 'youtube'} size='large' style={{ marginRight: '15px' }} />
                                                        )}
                                                        <div style={{ overflow: 'hidden' }}>
                                                            <div style={{ color: 'var(--player-text)', fontSize: '15px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{decodeHtml(song.title)}</div>
                                                            <div style={{ color: '#aaa', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{decodeHtml(song.artist)}</div>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: '10px' }}>
                                                        <Icon 
                                                            name='heart' 
                                                            color='pink' 
                                                            style={{ cursor: 'pointer' }}
                                                            onClick={(e) => { e.stopPropagation(); toggleFavorite(song); }}
                                                        />
                                                        <Icon 
                                                            name='plus' 
                                                            style={{ cursor: 'pointer', color: '#aaa' }}
                                                            onClick={(e) => { e.stopPropagation(); setPlaylistToAddTo(song); setShowPlaylistModal(true); }}
                                                        />
                                                    </div>
                                                </div>
                                            </List.Item>
                                        ))}
                                    </List>
                                )}
                            </div>
                        )}

                        {/* Playlists View */}
                        {viewMode === 'playlists' && (
                            <div style={{ paddingBottom: '80px' }}>
                                <div className="playlist-input-container">
                                    <input 
                                        type="text" 
                                        placeholder="New Playlist Name..." 
                                        value={newPlaylistName}
                                        onChange={(e) => setNewPlaylistName(e.target.value)}
                                        className="playlist-input"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') createPlaylist(newPlaylistName);
                                        }}
                                    />
                                    <Button color='violet' size='small' onClick={() => createPlaylist(newPlaylistName)}>Create</Button>
                                </div>

                                {playlists.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px 20px', opacity: 0.5 }}>
                                        <Icon name='list' size='huge' style={{ color: '#6366f1' }} />
                                        <p style={{ marginTop: '15px', fontSize: '16px' }}>No playlists created yet.</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                        {playlists.map((playlist, i) => (
                                            <div key={i} className="playlist-card">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                    <div>
                                                        <h3 style={{ margin: 0, color: 'var(--player-text)' }}>{playlist.name}</h3>
                                                        <span style={{ fontSize: '12px', color: '#888' }}>{playlist.songs.length} tracks</span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <Button 
                                                            circular 
                                                            icon='play' 
                                                            color='green' 
                                                            size='small' 
                                                            disabled={playlist.songs.length === 0}
                                                            onClick={() => playPlaylist(playlist)} 
                                                        />
                                                        <Button 
                                                            circular 
                                                            icon='trash' 
                                                            color='red' 
                                                            size='small' 
                                                            onClick={() => deletePlaylist(playlist.name)} 
                                                        />
                                                    </div>
                                                </div>

                                                {playlist.songs.length > 0 && (
                                                    <List size='small' divided inverted={theme === 'dark'} style={{ background: theme === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)', padding: '5px 10px', borderRadius: '8px' }}>
                                                        {playlist.songs.map((song, songIdx) => (
                                                            <List.Item key={songIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', flex: 1 }}>
                                                                    <Icon name={song.type === 'youtube' ? 'youtube' : 'music'} style={{ color: '#888', marginRight: '10px' }} />
                                                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        <span style={{ color: 'var(--player-text)', fontWeight: 'bold' }}>{decodeHtml(song.title)}</span>
                                                                        <span style={{ color: '#888', fontSize: '11px', marginLeft: '8px' }}>{decodeHtml(song.artist)}</span>
                                                                    </div>
                                                                </div>
                                                                <Icon 
                                                                    name='close' 
                                                                    style={{ color: '#f43f5e', cursor: 'pointer', marginLeft: '10px' }} 
                                                                    onClick={() => removeSongFromPlaylist(playlist.name, song)}
                                                                />
                                                            </List.Item>
                                                        ))}
                                                    </List>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Search Results (Only Online Mode) */}
                        {viewMode === 'online' && searchResults.length > 0 && (
                            <div style={{ marginBottom: '30px' }}>
                                <h3 style={{ color: '#aaa', fontSize: '14px', textTransform: 'uppercase' }}>Search Results</h3>
                                <List divided relaxed selection verticalAlign='middle' inverted={theme === 'dark'}>
                                    {searchResults.map((song, i) => (
                                        <List.Item key={i} style={{ padding: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                <div onClick={() => {
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
                                                }} style={{ display: 'flex', alignItems: 'center', flex: 1, cursor: 'pointer' }}>
                                                    {song.thumbnail ? (
                                                        <img
                                                            src={song.thumbnail}
                                                            alt="thumb"
                                                            style={{ width: '45px', height: '45px', borderRadius: '5px', objectFit: 'cover', marginRight: '15px' }}
                                                            onError={(e) => { e.target.style.display = 'none'; }}
                                                        />
                                                    ) : (
                                                        <Icon name='youtube' color='red' size='large' style={{ marginRight: '15px' }} />
                                                    )}
                                                    <div style={{ overflow: 'hidden' }}>
                                                        <div style={{ color: 'var(--player-text)', fontSize: '15px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{decodeHtml(song.title)}</div>
                                                        <div style={{ color: '#aaa', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{decodeHtml(song.artist)}</div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: '10px' }}>
                                                    <Icon 
                                                        name={favorites.includes(getTrackId(song)) ? 'heart' : 'heart outline'} 
                                                        color={favorites.includes(getTrackId(song)) ? 'pink' : null} 
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={(e) => { e.stopPropagation(); toggleFavorite(song); }}
                                                    />
                                                    <Icon 
                                                        name='plus' 
                                                        style={{ cursor: 'pointer', color: '#aaa' }}
                                                        onClick={(e) => { e.stopPropagation(); setPlaylistToAddTo(song); setShowPlaylistModal(true); }}
                                                    />
                                                </div>
                                            </div>
                                        </List.Item>
                                    ))}
                                </List>
                            </div>
                        )}

                        {/* Song List (Filtered by Mode) */}
                        {songs.length > 0 && (viewMode === 'online' || viewMode === 'local') && (
                            <div style={{ paddingBottom: '80px' }}>
                                <h3 style={{ color: '#aaa', fontSize: '14px', textTransform: 'uppercase' }}>
                                    {viewMode === 'online' ? 'Saved Bookmarks' : 'Your Downloads'}
                                </h3>
                                {libraryView === 'list' ? (
                                    <List divided relaxed selection verticalAlign='middle' inverted={theme === 'dark'}>
                                        {songs
                                            .map((song, index) => ({ ...song, originalIndex: index }))
                                            .filter(song => {
                                                if (viewMode === 'online') return song.type === 'youtube';
                                                if (viewMode === 'local') return song.type === 'local';
                                                return true;
                                            })
                                            .map((song, i) => (
                                                <List.Item key={i} active={currentSongIndex === song.originalIndex} style={{ padding: '10px', background: currentSongIndex === song.originalIndex ? 'rgba(255,255,255,0.08)' : 'transparent' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                        <div onClick={() => {
                                                            playSong(song.originalIndex);
                                                            setIsPlayerView(true);
                                                        }} style={{ display: 'flex', alignItems: 'center', flex: 1, cursor: 'pointer' }}>
                                                            {(song.type !== 'local') && (song.thumbnail || song.artwork) ? (
                                                                <img src={song.thumbnail || song.artwork} style={{ width: '40px', height: '40px', borderRadius: '4px', marginRight: '15px' }} />
                                                            ) : (
                                                                <Icon name='music' size='large' style={{ marginRight: '15px', color: '#aaa' }} />
                                                            )}
                                                            <div style={{ overflow: 'hidden' }}>
                                                                <div style={{ color: 'var(--player-text)', fontSize: '15px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{decodeHtml(song.title)}</div>
                                                                <div style={{ color: '#aaa', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{decodeHtml(song.artist)}</div>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: '10px' }}>
                                                            <Icon 
                                                                name={favorites.includes(getTrackId(song)) ? 'heart' : 'heart outline'} 
                                                                color={favorites.includes(getTrackId(song)) ? 'pink' : null} 
                                                                style={{ cursor: 'pointer' }}
                                                                onClick={(e) => { e.stopPropagation(); toggleFavorite(song); }}
                                                            />
                                                            <Icon 
                                                                name='plus' 
                                                                style={{ cursor: 'pointer', color: '#aaa' }}
                                                                onClick={(e) => { e.stopPropagation(); setPlaylistToAddTo(song); setShowPlaylistModal(true); }}
                                                            />
                                                        </div>
                                                    </div>
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
                                                    background: currentSongIndex === song.originalIndex ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.3)',
                                                    border: '1px solid rgba(255,255,255,0.05)',
                                                    padding: '12px',
                                                    borderRadius: '12px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    textAlign: 'center',
                                                    height: '110px',
                                                    justifyContent: 'center',
                                                    position: 'relative'
                                                }}>
                                                    <Icon name='music' size='large' style={{ marginBottom: '8px', color: '#aaa' }} />
                                                    <div style={{ color: 'var(--player-text)', fontSize: '12px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                                                        {decodeHtml(song.title)}
                                                    </div>
                                                    <div style={{ color: '#aaa', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                                                        {decodeHtml(song.artist)}
                                                    </div>
                                                    {/* Quick Favorite Icon in Grid */}
                                                    <Icon 
                                                        name={favorites.includes(getTrackId(song)) ? 'heart' : 'heart outline'} 
                                                        color={favorites.includes(getTrackId(song)) ? 'pink' : 'grey'}
                                                        style={{ position: 'absolute', top: '5px', right: '5px', fontSize: '10px' }}
                                                        onClick={(e) => { e.stopPropagation(); toggleFavorite(song); }}
                                                    />
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    {/* Copyright Footer */}
                    <div className="integrated-footer">
                        <span>Copyrights <Icon name="copyright" /> {new Date().getFullYear()} <strong>Francis Cruz</strong></span>
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
                <div 
                    className="player-view-container" 
                    style={{ display: isPlayerView ? 'flex' : 'none' }}
                >
                    <div className={`artwork-container ${currentSongIndex !== -1 && songs[currentSongIndex] && songs[currentSongIndex].type !== 'local' ? 'has-artwork' : 'no-artwork'}`}>
                        {currentSongIndex !== -1 && songs[currentSongIndex] && songs[currentSongIndex].type !== 'local' && (
                            <img
                                src={getThumbnail(songs[currentSongIndex])}
                                alt="Artwork"
                                className="artwork-image"
                                onError={(e) => { e.target.src = 'https://via.placeholder.com/350x350?text=Error'; }}
                            />
                        )}
                        {/* Canvas Visualizer */}
                        <canvas 
                            ref={canvasRef} 
                            width={320} 
                            height={320} 
                            className="artwork-canvas"
                        />
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
                            <div style={{ textAlign: 'center', fontSize: '12px', color: '#aaa', paddingBottom: '5px' }}>
                                Drag a portion to loop 🔂
                            </div>
                            <div id="waveform" ref={waveformRef} style={{ width: '100%' }}></div>
                            <div id="wave-timeline" ref={timelineRef} style={{ width: '100%' }}></div>
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
                            {isYouTube && (
                                <span style={{ color: '#aaa', fontSize: '10px' }}>
                                    Est. Data: ~{((duration || 0) / 60 * 1.5).toFixed(1)} MB
                                </span>
                            )}
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Speed Slider (Local Files Only) */}
                    {!isYouTube && (
                        <div style={{ padding: '0 25px', marginBottom: '15px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', fontSize: '10px', marginBottom: '5px' }}>
                                <span>Slower</span>
                                <span style={{ fontWeight: 'bold', color: 'var(--player-text)', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setPlaybackRate(1.0)}>Normal</span>
                                <span style={{ fontWeight: 'bold', color: 'var(--player-text)' }}>{playbackRate.toFixed(2)}x</span>
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

                    <div className="controls-container controls-grid" style={isYouTube ? { display: 'flex', justifyContent: 'center', gap: '20px' } : {
                        display: 'flex', flexDirection: 'column', gap: '15px'
                    }}>
                        {/* Row 1: Shuffle, Prev, Next, Loop */}
                        {!isYouTube && (
                            <div style={{ display: 'flex', justifySelf: 'center', gap: '20px', justifyContent: 'center' }}>
                                <div className="control-btn-wrapper">
                                    <button className="control-btn" onClick={() => { }} title="Shuffle">
                                        <Icon name='shuffle' size='large' style={{ margin: 0 }} />
                                    </button>
                                    <span style={{ fontSize: '10px', color: '#aaa', marginTop: '5px' }}>Shuffle</span>
                                </div>
                                <div className="control-btn-wrapper">
                                    <button className="control-btn" onClick={handlePrev} title="Previous Song">
                                        <Icon name='step backward' size='large' style={{ margin: 0 }} />
                                    </button>
                                    <span style={{ fontSize: '10px', color: '#aaa', marginTop: '5px' }}>Prev</span>
                                </div>
                                <div className="control-btn-wrapper">
                                    <button className="control-btn" onClick={handleNext} title="Next Song">
                                        <Icon name='step forward' size='large' style={{ margin: 0 }} />
                                    </button>
                                    <span style={{ fontSize: '10px', color: '#aaa', marginTop: '5px' }}>Next</span>
                                </div>
                                <div className="control-btn-wrapper">
                                    <button className="control-btn" onClick={(toggleLoop)} title="Loop Mode" style={{ position: 'relative' }}>
                                        <Icon name={loopMode === 'one' ? 'refresh' : (loopMode === 'all' ? 'repeat' : 'repeat')} size='large' color={loopMode !== 'off' ? 'blue' : null} style={{ margin: 0 }} />
                                        {loopMode === 'one' && (
                                            <span style={{
                                                position: 'absolute',
                                                top: '50%',
                                                left: '50%',
                                                transform: 'translate(-50%, -50%)',
                                                fontSize: '10px',
                                                color: '#2185d0',
                                                fontWeight: '900',
                                                textShadow: '0 0 2px black'
                                            }}>1</span>
                                        )}
                                    </button>
                                    <span style={{ fontSize: '10px', color: '#aaa', marginTop: '5px' }}>Loop</span>
                                </div>
                            </div>
                        )}

                        {/* Row 2: -10s, +10s, Play/Pause, Loop Clear */}
                        <div style={{ display: 'flex', justifySelf: 'center', gap: '20px', justifyContent: 'center', alignItems: 'center' }}>
                            <div className="control-btn-wrapper">
                                <button className="control-btn" onClick={handleSkipBackward} title="Rewind 10s">
                                    <Icon name='undo' size='large' style={{ margin: 0 }} />
                                </button>
                                <span style={{ fontSize: '10px', color: '#aaa', marginTop: '5px' }}>-10s</span>
                            </div>

                            <div className="control-btn-wrapper">
                                <button className="play-pause-btn" onClick={handlePlayPause} title={isPlaying ? "Pause" : "Play"} style={{ width: '60px', height: '60px', borderRadius: '50%' }}>
                                    <Icon name={isPlaying ? 'pause' : 'play'} fitted style={{ fontSize: '24px', margin: 0, paddingLeft: isPlaying ? '0' : '5px' }} />
                                </button>
                                <span style={{ fontSize: '10px', color: '#aaa', marginTop: '5px' }}>{isPlaying ? 'Pause' : 'Play'}</span>
                            </div>

                            <div className="control-btn-wrapper">
                                <button className="control-btn" onClick={handleSkipForward} title="Forward 10s">
                                    <Icon name='redo' size='large' style={{ margin: 0 }} />
                                </button>
                                <span style={{ fontSize: '10px', color: '#aaa', marginTop: '5px' }}>+10s</span>
                            </div>

                            {!isYouTube && (
                                <div className="control-btn-wrapper">
                                    <button className="control-btn" onClick={() => { if (regions.current) regions.current.clearRegions(); }} title="Clear Loop">
                                        <Icon name='erase' size='large' style={{ margin: 0 }} />
                                    </button>
                                    <span style={{ fontSize: '10px', color: '#aaa', marginTop: '5px' }}>Clear</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div >

            {/* Overlays (Lyrics, Queue, Related, Equalizer, Visualizer Settings) */}
            {
                playerOverlay && (
                    <div className="lyrics-overlay">
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
                            <div style={{ color: 'var(--player-text)' }}>
                                <h3>Up Next</h3>
                                <List divided relaxed selection verticalAlign='middle' inverted={theme === 'dark'}>
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
                            <div style={{ color: 'var(--player-text)', padding: '10px' }}>
                                <h3>Related Songs</h3>
                                <p style={{ color: '#aaa', fontSize: '12px' }}>Suggested based on "{currentSongIndex !== -1 ? decodeHtml(songs[currentSongIndex].title) : ''}"</p>
                                
                                {isFetchingRelated ? (
                                    <Loader active inline="centered" inverted={theme === 'dark'} style={{ marginTop: '30px' }}>Fetching suggestions...</Loader>
                                ) : relatedSongs.length === 0 ? (
                                    <div style={{ padding: '20px', textAlign: 'center', opacity: 0.7 }}>
                                        <Icon name='search' size='large' />
                                        <p style={{ marginTop: '10px' }}>No related tracks found.</p>
                                    </div>
                                ) : (
                                    <List divided relaxed selection verticalAlign='middle' inverted={theme === 'dark'} style={{ marginTop: '15px' }}>
                                        {relatedSongs.map((song, i) => (
                                            <List.Item key={i} onClick={() => {
                                                setSongs(prev => {
                                                    const newSongs = [...prev, song];
                                                    pendingPlayIndex.current = newSongs.length - 1;
                                                    return newSongs;
                                                });
                                                setPlayerOverlay(null);
                                            }} style={{ cursor: 'pointer', padding: '10px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                                    {song.thumbnail ? (
                                                        <img
                                                            src={song.thumbnail}
                                                            style={{ width: '45px', height: '45px', borderRadius: '4px', marginRight: '15px', objectFit: 'cover' }}
                                                        />
                                                    ) : (
                                                        <Icon name='youtube' color='red' size='large' style={{ marginRight: '15px' }} />
                                                    )}
                                                    <List.Content>
                                                        <List.Header style={{ color: 'var(--player-text)', fontSize: '15px' }}>{decodeHtml(song.title)}</List.Header>
                                                        <List.Description style={{ color: '#aaa' }}>{decodeHtml(song.artist)}</List.Description>
                                                    </List.Content>
                                                </div>
                                            </List.Item>
                                        ))}
                                    </List>
                                )}
                            </div>
                        )}

                        {playerOverlay === 'equalizer' && (
                            <div className="eq-panel">
                                <h3 style={{ textAlign: 'center', marginBottom: '20px' }}><Icon name='sliders' /> Equalizer Settings</h3>
                                
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginBottom: '25px' }}>
                                    {Object.keys(presets).map(name => (
                                        <button 
                                            key={name} 
                                            className={`eq-preset-btn ${eqPreset === name ? 'active' : ''}`}
                                            onClick={() => handlePresetChange(name)}
                                        >
                                            {name}
                                        </button>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-around', height: '180px', padding: '10px 0' }}>
                                    {eqGains.map((gain, idx) => {
                                        const labels = ['60Hz', '230Hz', '910Hz', '4kHz', '14kHz'];
                                        return (
                                            <div key={idx} className="eq-slider-container">
                                                <span style={{ fontSize: '11px', color: '#aaa' }}>{gain > 0 ? `+${gain}` : gain} dB</span>
                                                <input 
                                                    type="range"
                                                    min="-12"
                                                    max="12"
                                                    step="1"
                                                    value={gain}
                                                    onChange={(e) => handleGainChange(idx, parseInt(e.target.value))}
                                                    className="eq-slider"
                                                />
                                                <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{labels[idx]}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {playerOverlay === 'visualizer' && (
                            <div className="vis-panel">
                                <h3 style={{ textAlign: 'center' }}><Icon name='eye' /> Visualizer Theme</h3>
                                <p style={{ color: '#aaa', fontSize: '13px', textAlign: 'center' }}>Select your real-time visualizer style</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '300px', margin: '20px auto' }}>
                                    <button 
                                        className={`vis-btn ${visualizerMode === 'bars' ? 'active' : ''}`}
                                        onClick={() => setVisualizerMode('bars')}
                                    >
                                        <Icon name='chart bar' /> Spectrum Bars
                                    </button>
                                    <button 
                                        className={`vis-btn ${visualizerMode === 'circle' ? 'active' : ''}`}
                                        onClick={() => setVisualizerMode('circle')}
                                    >
                                        <Icon name='circle outline' /> Circular Wave
                                    </button>
                                    <button 
                                        className={`vis-btn ${visualizerMode === 'oscilloscope' ? 'active' : ''}`}
                                        onClick={() => setVisualizerMode('oscilloscope')}
                                    >
                                        <Icon name='line graph' /> Retro Oscilloscope
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )
            }

            {/* Sleep Timer Modal */}
            {showSleepTimerModal && (
                <div className="glass-overlay">
                    <div className="glass-card">
                        <h3 style={{ color: 'var(--player-text)', marginBottom: '20px' }}><Icon name='clock' /> Sleep Timer</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <Button color={sleepTimer === 0 ? 'violet' : 'grey'} onClick={() => { setSleepTimer(0); setShowSleepTimerModal(false); }}>Off</Button>
                            <Button color={sleepTimer === 900 ? 'violet' : 'grey'} onClick={() => { setSleepTimer(900); setShowSleepTimerModal(false); }}>15 Minutes</Button>
                            <Button color={sleepTimer === 1800 ? 'violet' : 'grey'} onClick={() => { setSleepTimer(1800); setShowSleepTimerModal(false); }}>30 Minutes</Button>
                            <Button color={sleepTimer === 2700 ? 'violet' : 'grey'} onClick={() => { setSleepTimer(2700); setShowSleepTimerModal(false); }}>45 Minutes</Button>
                            <Button color={sleepTimer === 3600 ? 'violet' : 'grey'} onClick={() => { setSleepTimer(3600); setShowSleepTimerModal(false); }}>60 Minutes</Button>
                        </div>
                        <Button style={{ marginTop: '20px' }} compact onClick={() => setShowSleepTimerModal(false)}>Cancel</Button>
                    </div>
                </div>
            )}

            {/* Add to Playlist Modal */}
            {showPlaylistModal && playlistToAddTo && (
                <div className="glass-overlay" style={{ zIndex: 400 }}>
                    <div className="glass-card">
                        <h3 style={{ color: 'var(--player-text)', marginBottom: '15px' }}><Icon name='plus' /> Add to Playlist</h3>
                        <p style={{ color: '#aaa', fontSize: '12px', wordBreak: 'break-word' }}>"{decodeHtml(playlistToAddTo.title)}"</p>
                        
                        {playlists.length === 0 ? (
                            <div style={{ padding: '20px 0' }}>
                                <p style={{ color: '#888' }}>No playlists found.</p>
                                <Button size='mini' color='violet' onClick={() => { setShowPlaylistModal(false); setViewMode('playlists'); }}>Go Create Playlist</Button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', padding: '10px 0' }}>
                                {playlists.map((playlist, idx) => (
                                    <Button 
                                        key={idx} 
                                        compact 
                                        fluid 
                                        color='grey' 
                                        onClick={() => {
                                            addSongToPlaylist(playlist.name, playlistToAddTo);
                                            setShowPlaylistModal(false);
                                            setPlaylistToAddTo(null);
                                        }}
                                    >
                                        {playlist.name}
                                    </Button>
                                ))}
                            </div>
                        )}
                        
                        <Button style={{ marginTop: '15px' }} compact onClick={() => { setShowPlaylistModal(false); setPlaylistToAddTo(null); }}>Cancel</Button>
                    </div>
                </div>
            )}

            {/* Bottom Tabs */}
            <div className="bottom-tabs">
                <div className="tab-item" onClick={() => setPlayerOverlay('queue')}>
                    <Icon name='list ol' />
                    <span>Up Next</span>
                </div>
                {viewMode === 'online' ? (
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
                ) : (
                    <>
                        <div className="tab-item" onClick={() => setPlayerOverlay('equalizer')}>
                            <Icon name='sliders' />
                            <span>Equalizer</span>
                        </div>
                        <div className="tab-item" onClick={() => setPlayerOverlay('visualizer')}>
                            <Icon name='eye' />
                            <span>Visualizer</span>
                        </div>
                    </>
                )}
            </div>

        </div >
    );
};
export default MusicPlayer;
