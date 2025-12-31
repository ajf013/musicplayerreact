import React, { useRef, useEffect } from 'react';
import YouTube from 'react-youtube';

const YouTubePlayer = ({ videoId, isPlaying, volume, onReady, onEnd, onStateChange, onProgress, onVolumeChange }) => {
    const playerRef = useRef(null);

    // Options for the player
    const opts = {
        height: '0', // Hidden player
        width: '0',
        playerVars: {
            // https://developers.google.com/youtube/player_parameters
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
        },
    };

    const _onReady = (event) => {
        // Access player instance
        playerRef.current = event.target;
        if (onReady) onReady(event.target);
        event.target.playVideo(); // Force play
        event.target.setVolume(100);
    };

    useEffect(() => {
        if (playerRef.current) {
            if (isPlaying) {
                playerRef.current.playVideo();
            } else {
                playerRef.current.pauseVideo();
            }
        }
    }, [isPlaying]);

    useEffect(() => {
        if (playerRef.current) {
            // Volume is 0-100
            playerRef.current.setVolume(volume * 100);
        }
    }, [volume]);

    // Internal polling for progress and volume since IFrame API doesn't have events for them in all cases
    useEffect(() => {
        let interval;
        if (isPlaying && playerRef.current) {
            interval = setInterval(() => {
                if (typeof playerRef.current.getCurrentTime === 'function') {
                    const current = playerRef.current.getCurrentTime();
                    const duration = playerRef.current.getDuration();
                    if (onProgress) onProgress(current, duration);
                }
                // Poll for volume changes (external/hardware changes reflected in player)
                if (typeof playerRef.current.getVolume === 'function') {
                    const currentVol = playerRef.current.getVolume();
                    // YouTube returns 0-100, we use 0-1
                    if (onVolumeChange) onVolumeChange(currentVol / 100);
                }
            }, 500); // Check every 500ms
        }
        return () => clearInterval(interval);
    }, [isPlaying, onProgress, onVolumeChange]);

    const _onError = (event) => {
        console.error("YouTube Player Error:", event.data);
    };

    return (
        <div className="youtube-player-container" style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1, opacity: 0.01, zIndex: -1, pointerEvents: 'none' }}>
            <YouTube
                videoId={videoId}
                opts={opts}
                onReady={_onReady}
                onEnd={onEnd}
                onError={_onError}
                onStateChange={onStateChange}
            />
        </div>
    );
};

export default YouTubePlayer;
