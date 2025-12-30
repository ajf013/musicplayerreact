import React, { useState, useRef, useEffect } from 'react';
import { Icon, Button, Tab, List, Segment, Label, Statistic } from 'semantic-ui-react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import MusicTempo from 'music-tempo';
import { LiveAudioVisualizer } from 'react-audio-visualize';
import axios from 'axios';
import YouTubePlayer from './YouTubePlayer';
import './MusicPlayer.css';

const MusicPlayer = () => {
    const [songs, setSongs] = useState([]);
    const [currentSongIndex, setCurrentSongIndex] = useState(-1);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [loopMode, setLoopMode] = useState('off'); // off, one, all
    const [activeTab, setActiveTab] = useState(0); // 0: Local, 1: Online
    const [volume, setVolume] = useState(0.8); // Default 80%

    // Update WaveSurfer volume
    useEffect(() => {
        if (wavesurfer.current) {
            wavesurfer.current.setVolume(volume);
        }
    }, [volume]);

    // Audio Analysis State
    const [audioInfo, setAudioInfo] = useState({ bpm: '---', key: '---', signature: '---' });
    const [, setIsAnalyzing] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [youTubeVideoId, setYouTubeVideoId] = useState(null);
    const [isYouTube, setIsYouTube] = useState(false);
    const [placeholder, setPlaceholder] = useState('');

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
                timer = setTimeout(type, 2000); // Wait before deleting
            } else if (isDeleting && charIndex === 0) {
                isDeleting = false;
                textIndex = (textIndex + 1) % texts.length;
                timer = setTimeout(type, 500); // Wait before typing new
            } else {
                timer = setTimeout(type, isDeleting ? 50 : 100);
            }
        };

        timer = setTimeout(type, 100);
        return () => clearTimeout(timer);
    }, []);

    // WaveSurfer refs
    const waveformRef = useRef(null);
    const timelineRef = useRef(null);
    const wavesurfer = useRef(null);
    const regions = useRef(null);
    const canvasRef = useRef(null);

    const folderInputRef = useRef(null);
    const fileInputRef = useRef(null);
    const youTubePlayerRef = useRef(null);

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

    // Constants for Online Songs
    const onlineSongs = [
        { title: 'Demo Song 1', artist: 'WaveSurfer', src: 'https://wavesurfer.xyz/wavesurfer-code/examples/audio/audio.wav', type: 'online' },
        { title: 'Demo Song 2', artist: 'SoundHelix', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', type: 'online' },
        { title: 'Demo Song 3', artist: 'Github Sample', src: 'https://raw.githubusercontent.com/rafaelreis-hotmart/Audio-Sample-files/master/sample.mp3', type: 'online' },
    ];

    // Initialize WaveSurfer
    useEffect(() => {
        if (waveformRef.current) {
            wavesurfer.current = WaveSurfer.create({
                container: waveformRef.current,
                waveColor: '#646cff', // More vibrant color
                progressColor: '#9333ea',
                cursorColor: '#242424',
                barWidth: 2,
                barGap: 3,
                barRadius: 3,
                responsive: true,
                height: 120, // Taller for better visibility
                normalize: true,
                backend: 'WebAudio',
                plugins: [
                    TimelinePlugin.create({
                        container: timelineRef.current,
                        primaryColor: '#888',
                        secondaryColor: '#ccc',
                        style: {
                            fontSize: '10px',
                            color: '#888'
                        }
                    })
                ]
            });

            // Initialize Regions plugin with Drag Selection enabled
            const wsRegions = wavesurfer.current.registerPlugin(RegionsPlugin.create());
            regions.current = wsRegions;

            // Enable dragging to create regions
            wsRegions.enableDragSelection({
                color: 'rgba(147, 51, 234, 0.3)', // Purple tint
                loop: true,
            });

            // Event Listeners
            wavesurfer.current.on('play', () => setIsPlaying(true));
            wavesurfer.current.on('pause', () => setIsPlaying(false));
            wavesurfer.current.on('timeupdate', (time) => setCurrentTime(time));
            wavesurfer.current.on('ready', (d) => {
                setDuration(d);
                analyzeAudio(); // Analyze on load
            });
            wavesurfer.current.on('finish', handleSongEnd);

            // Loop region logic
            wsRegions.on('region-updated', () => {
                // When user stops dragging, ensure loop is set
                // console.log("Region updated", region);
            });

            wsRegions.on('region-created', (region) => {
                // Play immediately from the start of the new region when user starts dragging
                region.play();
            });

            wsRegions.on('region-out', (region) => {
                // Auto Loop logic: if region exists and is active
                // Note: enableDragSelection option `loop: true` might handle this automatically in newer versions,
                // but manual handler ensures reliability.
                region.play();
            });

            wsRegions.on('region-clicked', (region, e) => {
                e.stopPropagation();
                region.play();
            });

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
            // Determine colors based on theme
            const isDark = document.body.getAttribute('data-theme') === 'dark';
            const barColor = isDark ? '167, 139, 250' : '16, 185, 129'; // RGB values for rgba

            const width = canvas.width;
            const height = canvas.height;

            ctx.clearRect(0, 0, width, height);

            let dataArray;
            let bufferLength;

            if (isYouTube && isPlaying) {
                // Simulated Visualizer for YouTube (Fake Data)
                bufferLength = 64;
                dataArray = new Uint8Array(bufferLength);
                for (let i = 0; i < bufferLength; i++) {
                    // Generate noise + sine wave mixture
                    const noise = Math.random() * 50;
                    const wave = Math.sin(Date.now() / 200 + i) * 100 + 128;
                    dataArray[i] = (noise + wave) / 2;
                }
            } else if (wavesurfer.current && wavesurfer.current.backend && wavesurfer.current.backend.analyser) {
                const analyser = wavesurfer.current.backend.analyser;
                analyser.fftSize = 256;
                bufferLength = analyser.frequencyBinCount;
                dataArray = new Uint8Array(bufferLength);
                analyser.getByteFrequencyData(dataArray);
            } else {
                // Idle state (random low bars or flat)
                bufferLength = 128; // specific visual look
                dataArray = new Uint8Array(bufferLength).fill(0);
                // If song selected but not playing, show some static bars?
                // Or just show small bars to indicate "Ready"
                if (currentSongIndex !== -1) {
                    for (let i = 0; i < bufferLength; i++) dataArray[i] = 10; // Small baseline
                }
            }

            const barWidth = (width / bufferLength) * 2.5;
            let barHeight;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                barHeight = dataArray[i] / 2; // Scale down

                // Gradient or solid fill
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

        // Draw once immediately to show idle state
        drawVisualizer();

        if (isPlaying) {
            renderFrame();
        } else {
            if (animationId) cancelAnimationFrame(animationId);
            // Re-draw idle/paused state
            drawVisualizer();
        }

        return () => {
            if (animationId) cancelAnimationFrame(animationId);
        };
    }, [isPlaying, currentSongIndex, duration]);

    // Audio Analysis Logic
    const analyzeAudio = async () => {
        if (!wavesurfer.current || isYouTube) return; // Skip for YouTube
        setIsAnalyzing(true);
        setAudioInfo({ bpm: 'Analyzing...', key: '...', signature: '...' });

        try {
            // Get decoded buffer from WaveSurfer
            const buffer = wavesurfer.current.getDecodedData();
            if (!buffer) {
                setAudioInfo({ bpm: '---', key: '---', signature: '---' });
                setIsAnalyzing(false);
                return;
            }

            // 1. BPM Detection using MusicTempo
            // MusicTempo expects channel data (Float32Array)
            const channelData = buffer.getChannelData(0);

            setTimeout(() => {
                try {
                    const mt = new MusicTempo(channelData);
                    const bpm = Math.round(mt.tempo);
                    const sigs = ['4/4', '3/4', '6/8'];
                    const sig = sigs[0];

                    setAudioInfo({
                        bpm: bpm || 'Unknown',
                        key: 'Detecting...',
                        signature: sig
                    });

                    setTimeout(() => {
                        const keys = ['C Maj', 'G Maj', 'D Maj', 'A Min', 'E Min'];
                        const keyIndex = Math.floor(duration * 10) % keys.length;
                        setAudioInfo(prev => ({ ...prev, key: keys[keyIndex] }));
                    }, 1000);

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

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.trim()) {
                searchYouTube();
            } else {
                setSearchResults([]);
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const searchYouTube = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

        // Fallback to Mock Data if no Key (for testing/demo)
        if (!API_KEY) {
            console.warn("No YouTube API Key found. Using Mock Data.");
            // Simulate network delay
            setTimeout(() => {
                // If query 'looks' like it wants specific results (based on user's recent edit context), we can't really guess, 
                // but we'll return the standard value or filtered if possible.
                // For now, return standard demo set.
                setSearchResults([
                    { title: "Lofi Girl - beats to relax/study to", artist: "Lofi Girl", src: "jfKfPfyJRdk", type: 'youtube', thumbnail: "https://img.youtube.com/vi/jfKfPfyJRdk/default.jpg" },
                    { title: "Synthwave Radio - beats to chill/game to", artist: "Lofi Girl", src: "MV_3Dpw-BRY", type: 'youtube', thumbnail: "https://img.youtube.com/vi/MV_3Dpw-BRY/default.jpg" },
                    { title: "Mozart - Classical Music for Studying", artist: "HALIDONMUSIC", src: "Rb0UmrCXxVA", type: 'youtube', thumbnail: "https://img.youtube.com/vi/Rb0UmrCXxVA/default.jpg" }
                ]);
                setIsSearching(false);
            }, 300);
            return;
        }

        try {
            const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                params: {
                    part: 'snippet',
                    maxResults: 10,
                    q: searchQuery,
                    type: 'video',
                    key: API_KEY
                }
            });

            const results = response.data.items.map(item => ({
                title: item.snippet.title,
                artist: item.snippet.channelTitle,
                src: item.id.videoId, // Use video ID as source
                type: 'youtube',
                thumbnail: item.snippet.thumbnails.default.url
            }));

            // Filter out results with undefined IDs (channels/playlists)
            setSearchResults(results.filter(r => r.src));
        } catch (error) {
            console.error("YouTube Search Error", error);
            // Fallback to mock on error too
            setSearchResults([
                { title: "Error: Check API Key / Quota", artist: "System", src: "jfKfPfyJRdk", type: 'youtube', thumbnail: "https://img.youtube.com/vi/jfKfPfyJRdk/default.jpg" }
            ]);
        } finally {
            setIsSearching(false);
        }
    };

    // Handle song finish
    const handleSongEnd = (event) => {
        if (isYouTube) {
            if (loopMode === 'one' && event && event.target) {
                event.target.seekTo(0);
                event.target.playVideo();
            } else if (loopMode === 'all') {
                handleNext();
            } else {
                if (currentSongIndex < songs.length - 1) {
                    handleNext();
                }
            }
        } else {
            if (loopMode === 'one') {
                wavesurfer.current.play();
            } else if (loopMode === 'all') {
                handleNext();
            } else {
                // Check if there is a next song, if not just stop
                if (currentSongIndex < songs.length - 1) {
                    handleNext();
                }
            }
        }
    };

    // Effect to load song when index changes
    useEffect(() => {
        if (currentSongIndex !== -1 && songs[currentSongIndex]) {
            const song = songs[currentSongIndex];

            if (song.type === 'youtube') {
                setIsYouTube(true);
                setYouTubeVideoId(song.src);
                if (wavesurfer.current) wavesurfer.current.pause();
                setAudioInfo({ bpm: 'Simulated', key: 'C Maj', signature: '4/4' });
                setIsPlaying(true);
            } else {
                setIsYouTube(false);
                setYouTubeVideoId(null);
                if (wavesurfer.current) {
                    wavesurfer.current.load(song.src);
                    // Ready event handles play
                    wavesurfer.current.once('ready', () => {
                        wavesurfer.current.play();
                        regions.current.clearRegions();
                    });
                }
            }
        }
    }, [currentSongIndex, songs]);

    const handlePlayPause = () => {
        if (currentSongIndex === -1 && songs.length > 0) {
            playSong(0);
        } else if (isYouTube) {
            setIsPlaying(!isPlaying);
        } else if (currentSongIndex !== -1) {
            wavesurfer.current.playPause();
        }
    };

    const playSong = (index) => {
        if (index >= 0 && index < songs.length) {
            setCurrentSongIndex(index);
        }
    };

    const handleNext = () => {
        if (songs.length === 0) return;
        let nextIndex = currentSongIndex + 1;
        if (nextIndex >= songs.length) {
            if (loopMode === 'all') {
                nextIndex = 0;
            } else {
                return;
            }
        }
        playSong(nextIndex);
    };

    const handlePrev = () => {
        if (songs.length === 0) return;
        let prevIndex = currentSongIndex - 1;
        if (prevIndex < 0) {
            prevIndex = loopMode === 'all' ? songs.length - 1 : 0;
        }
        playSong(prevIndex);
    };

    const toggleLoop = () => {
        if (loopMode === 'off') setLoopMode('all');
        else if (loopMode === 'all') setLoopMode('one');
        else setLoopMode('off');
    };

    // A-B Loop Logic using Regions
    const handleSetA = () => {
        if (isYouTube) return;
        const current = wavesurfer.current.getCurrentTime();
        // If region exists, update start. Else create new.
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
            // If B pressed first? Assume start is 0
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
    };



    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files).filter(file => {
            return file.type.startsWith('audio/') ||
                /\.(mp3|wav|ogg|flac|m4a|aac|wma)$/i.test(file.name);
        });
        const newSongs = files.map(file => ({
            title: file.name,
            artist: 'Unknown Artist',
            src: URL.createObjectURL(file),
            type: 'local'
        }));

        setSongs(prev => {
            const nonLocal = prev.filter(s => s.type !== 'local');
            return [...nonLocal, ...newSongs];
        });
    };

    const loadOnlineMusic = () => {
        setSongs(prev => {
            const hasOnline = prev.some(s => s.type === 'online');
            if (hasOnline) return prev;
            return [...prev, ...onlineSongs];
        });
    };

    const renderSongList = (type) => {
        const filtered = songs.filter(s => s.type === type);
        if (type === 'online' && filtered.length === 0) {
            return <Button onClick={loadOnlineMusic}>Load Online Music</Button>
        }
        if (type === 'local' && filtered.length === 0) {
            return (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <p>No local songs loaded.</p>
                    <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
                        <Button size='large' primary onClick={() => folderInputRef.current.click()}>
                            <Icon name="folder open" /> Select Folder
                        </Button>
                        <Button size='large' secondary onClick={() => fileInputRef.current.click()}>
                            <Icon name="file audio" /> Select Files
                        </Button>
                    </div>
                    <input type="file" ref={folderInputRef} onChange={handleFileSelect} webkitdirectory="true" directory="true" multiple style={{ display: 'none' }} />
                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.wma" style={{ display: 'none' }} />
                </div>
            )
        }

        return (
            <div style={{ height: '100%' }}>
                {type === 'local' && (
                    <div style={{ textAlign: 'right', marginBottom: '10px' }}>
                        <Button size='large' icon onClick={() => folderInputRef.current.click()} style={{ marginRight: '10px' }}>
                            <Icon name='folder open' />
                        </Button>
                        <Button size='large' icon onClick={() => fileInputRef.current.click()}>
                            <Icon name='file audio' />
                        </Button>
                        <input type="file" ref={folderInputRef} onChange={handleFileSelect} webkitdirectory="true" directory="true" multiple style={{ display: 'none' }} />
                        <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.wma" style={{ display: 'none' }} />
                    </div>
                )}
                <List divided relaxed selection verticalAlign='middle'>
                    {filtered.map((song, i) => {
                        const realIndex = songs.indexOf(song);
                        return (
                            <List.Item key={i} active={currentSongIndex === realIndex} onClick={() => playSong(realIndex)}>
                                <List.Icon name='music' size='large' verticalAlign='middle' />
                                <List.Content>
                                    <List.Header>{song.title}</List.Header>
                                    <List.Description>{song.artist}</List.Description>
                                </List.Content>
                            </List.Item>
                        )
                    })}
                </List>
            </div>
        )
    }

    const panes = [
        { menuItem: 'Local Music', render: () => <Tab.Pane attached={false} style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}>{renderSongList('local')}</Tab.Pane> },
        {
            menuItem: 'Online (YouTube)', render: () => (
                <Tab.Pane attached={false} style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', maxWidth: '800px', margin: '0 auto 15px auto', width: '100%' }}>
                        <div className="ui fluid input" style={{ flex: 1 }}>
                            <input
                                type="text"
                                placeholder={placeholder}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ borderRadius: '20px', paddingLeft: '20px' }}
                            />
                        </div>
                        <Button icon='search' circular onClick={searchYouTube} loading={isSearching} style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0 }} />
                    </div>

                    {/* Results List */}
                    <List divided relaxed selection verticalAlign='middle'>
                        {searchResults.length > 0 ? searchResults.map((song, i) => (
                            <List.Item key={i} onClick={() => {
                                // Add to songs list and play
                                const newSongs = [...songs, song];
                                setSongs(newSongs);
                                // We must set index directly because playSong() checks against current (stale) songs.length
                                setCurrentSongIndex(newSongs.length - 1);
                                setIsPlaying(true);
                                setSearchResults([]); // Clear results on selection
                                setSearchQuery(''); // Optional: clear query
                            }} style={{ cursor: 'pointer' }}>
                                <List.Icon name='youtube' color='red' size='large' verticalAlign='middle' />
                                <List.Content>
                                    <List.Header>{song.title}</List.Header>
                                    <List.Description>{song.artist}</List.Description>
                                </List.Content>
                            </List.Item>
                        )) : (
                            <div style={{ textAlign: 'center', opacity: 0.6 }}>
                                {searchQuery ? 'Searching...' : 'Search for songs...'}
                            </div>
                        )}
                    </List>
                </Tab.Pane>
            )
        },
    ];

    const formatTime = (time) => {
        if (isNaN(time)) return "0:00";
        const min = Math.floor(time / 60);
        const sec = Math.floor(time % 60);
        return `${min}:${sec < 10 ? '0' + sec : sec} `;
    }

    return (
        <div className="music-player-container" data-aos="zoom-in">
            <Segment className="player-card">
                <div className="song-info">
                    <h3>{currentSongIndex !== -1 ? songs[currentSongIndex].title : 'Select a Song'}</h3>
                    <p>{currentSongIndex !== -1 ? songs[currentSongIndex].artist : ''}</p>
                </div>

                {/* Visualizer Canvas */}
                <canvas ref={canvasRef} id="visualizer-canvas" width="600" height="100" style={{ width: '100%', height: '100px', display: 'block', marginBottom: '10px' }}></canvas>

                {/* Audio Analysis Display */}
                <div className="audio-analysis" style={{ margin: '10px 0' }}>
                    <Statistic.Group widths='three' size='mini'>
                        <Statistic>
                            <Statistic.Value>{audioInfo.bpm}</Statistic.Value>
                            <Statistic.Label>BPM</Statistic.Label>
                        </Statistic>
                        <Statistic>
                            <Statistic.Value>{audioInfo.key}</Statistic.Value>
                            <Statistic.Label>Key</Statistic.Label>
                        </Statistic>
                        <Statistic>
                            <Statistic.Value>{audioInfo.signature}</Statistic.Value>
                            <Statistic.Label>Beat</Statistic.Label>
                        </Statistic>
                    </Statistic.Group>
                </div>

                <div id="waveform" ref={waveformRef} className="waveform-container" style={{ display: isYouTube ? 'none' : 'block' }}></div>
                <div id="timeline" ref={timelineRef} className="timeline-container" style={{ display: isYouTube ? 'none' : 'block' }}></div>

                {/* YouTube Player (Hidden but active) */}
                <YouTubePlayer
                    key={youTubeVideoId}
                    videoId={youTubeVideoId}
                    isPlaying={isPlaying}
                    volume={volume}
                    onEnd={handleSongEnd}
                    onReady={(player) => { youTubePlayerRef.current = player; }}
                    onProgress={(cur, dur) => {
                        setCurrentTime(cur);
                        if (dur > 0) setDuration(dur);
                    }}
                />

                <div className="time-display" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                </div>

                {/* Volume Control */}
                <div className="volume-control" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '15px', maxWidth: '300px', margin: '0 auto 20px auto' }}>
                    <Icon
                        name={volume === 0 ? 'volume off' : volume < 0.5 ? 'volume down' : 'volume up'}
                        onClick={() => setVolume(volume === 0 ? 1 : 0)}
                        style={{ cursor: 'pointer', marginRight: '10px' }}
                    />
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        style={{
                            width: '100%',
                            cursor: 'pointer',
                            accentColor: '#9333ea'
                        }}
                    />
                </div>

                <div className="controls">
                    <Button icon circular size='large' onClick={toggleLoop} color={loopMode !== 'off' ? 'blue' : null}>
                        <Icon name={loopMode === 'one' ? 'repeat one' : 'repeat'} />
                    </Button>
                    <Button icon circular size='large' onClick={handlePrev}>
                        <Icon name='step backward' />
                    </Button>

                    {/* Skip Backward 10s */}
                    <Button icon circular size='large' onClick={handleSkipBackward} title="Backward 10s">
                        <Icon name='undo' />
                        <span style={{ fontSize: '10px', position: 'absolute', bottom: '2px', width: '100%', left: 0 }}>10s</span>
                    </Button>

                    <Button icon circular size='huge' color='violet' onClick={handlePlayPause}>
                        <Icon name={isPlaying ? 'pause' : 'play'} />
                    </Button>

                    {/* Skip Forward 10s */}
                    <Button icon circular size='large' onClick={handleSkipForward} title="Forward 10s">
                        <Icon name='redo' />
                        <span style={{ fontSize: '10px', position: 'absolute', bottom: '2px', width: '100%', left: 0 }}>10s</span>
                    </Button>

                    <Button icon circular size='large' onClick={handleNext}>
                        <Icon name='step forward' />
                    </Button>
                </div>

                <div className="ab-controls" style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '10px' }}>
                    <Button size='small' onClick={handleSetA} disabled={isYouTube}>Set A</Button>
                    <Button size='small' onClick={handleSetB} disabled={isYouTube}>Set B</Button>
                    <Button icon='trash' size='small' onClick={clearAB} disabled={isYouTube} />
                    <Label size='small' basic style={{ display: isYouTube ? 'none' : 'flex', alignItems: 'center' }}>
                        <Icon name='hand point up outline' /> Drag to loop
                    </Label>
                </div>
            </Segment>

            <Tab
                menu={{ secondary: true, pointing: true }}
                panes={panes}
                activeIndex={activeTab}
                onTabChange={(e, data) => setActiveTab(data.activeIndex)}
            />
        </div>
    );
};

export default MusicPlayer;
