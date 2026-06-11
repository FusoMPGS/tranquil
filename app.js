// Music Streaming App - App Logic
class MusicApp {
    constructor() {
        this.currentUser = null;
        this.currentSong = null;
        this.isPlaying = false;
        this.songs = this.generateSongs();
        this.playlists = this.loadFromStorage('playlists') || {};
        this.favorites = this.loadFromStorage('favorites') || [];
        this.playHistory = this.loadFromStorage('playHistory') || [];
        this.theme = this.loadFromStorage('theme') || 'dark';
        this.recommendations = [];
        
        // Spotify Integration
        this.spotifyClientId = '5f51c9f427df42969a2d500c614f82a4';
        this.spotifyRedirectUri = 'https://peace.figma.site/spotify-redirect.html';  // Use the redirect page
        this.spotifyAccessToken = this.loadFromStorage('spotifyAccessToken');
        this.spotifyRefreshToken = this.loadFromStorage('spotifyRefreshToken');
        this.spotifyUser = this.loadFromStorage('spotifyUser');
        this.spotifyPlaylists = [];
        this.useSpotifyPlayback = false;
        
        this.init();
    }

    init() {
        this.loadUser();
        this.applyTheme();
        this.setupEventListeners();
        this.checkSpotifyAuth();
    }

    // ==================== SPOTIFY INTEGRATION ====================
    checkSpotifyAuth() {
        // Check if returning from Spotify auth redirect
        const hash = window.location.hash;
        if (hash) {
            const params = new URLSearchParams(hash.substring(1));
            const accessToken = params.get('access_token');
            const error = params.get('error');
            
            if (error) {
                console.error('Spotify auth error:', error);
                alert(`Spotify login error: ${error}`);
                return;
            }
            
            if (accessToken) {
                console.log('Spotify token received successfully');
                this.spotifyAccessToken = accessToken;
                this.saveToStorage('spotifyAccessToken', accessToken);
                this.fetchSpotifyUser();
                this.initSpotifyPlayback();
                window.history.replaceState({}, document.title, window.location.pathname);
                alert('✓ Successfully logged in to Spotify!');
            }
        }
        
        // Check localStorage for existing token
        if (this.spotifyAccessToken) {
            this.fetchSpotifyUser();
        }
    }

    spotifyLogin() {
        // Generate PKCE code verifier
        const codeVerifier = this.generateCodeVerifier();
        sessionStorage.setItem('spotify_code_verifier', codeVerifier);
        
        // Generate code challenge (SHA256 of verifier)
        this.generateCodeChallengeSHA256(codeVerifier).then(codeChallenge => {
            const scopes = [
                'streaming',
                'user-read-private',
                'user-read-email',
                'user-library-read',
                'user-read-playback-state',
                'user-modify-playback-state',
                'playlist-read-private',
                'playlist-read-collaborative'
            ];
            
            const params = new URLSearchParams({
                client_id: this.spotifyClientId,
                response_type: 'code',
                redirect_uri: this.spotifyRedirectUri,
                scope: scopes.join(' '),
                code_challenge_method: 'S256',
                code_challenge: codeChallenge,
                show_dialog: 'true'
            });
            
            const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
            console.log('✓ Spotify PKCE login initiated');
            window.location.href = authUrl;
        }).catch(err => {
            console.error('Error generating code challenge:', err);
            alert('Error initiating Spotify login. Please check console.');
        });
    }

    generateCodeVerifier() {
        // Generate a random code verifier (43-128 characters)
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        let verifier = '';
        const length = 128;
        for (let i = 0; i < length; i++) {
            verifier += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return verifier;
    }

    async generateCodeChallengeSHA256(codeVerifier) {
        try {
            // Encode the verifier
            const encoder = new TextEncoder();
            const data = encoder.encode(codeVerifier);
            
            // Generate SHA256 hash
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            
            // Convert to base64url
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashString = String.fromCharCode(...hashArray);
            const base64 = btoa(hashString);
            
            // Convert to base64url (replace +/= with -_)
            return base64
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '');
        } catch (err) {
            console.error('SHA256 error:', err);
            throw err;
        }
    }

    spotifyLogout() {
        this.spotifyAccessToken = null;
        this.spotifyUser = null;
        this.spotifyPlaylists = [];
        this.saveToStorage('spotifyAccessToken', null);
        this.saveToStorage('spotifyUser', null);
        this.useSpotifyPlayback = false;
        alert('Logged out from Spotify');
    }

    fetchSpotifyUser() {
        if (!this.spotifyAccessToken) return;

        fetch('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${this.spotifyAccessToken}` }
        })
        .then(res => {
            if (res.status === 401) {
                // Token expired
                this.spotifyAccessToken = null;
                this.saveToStorage('spotifyAccessToken', null);
                throw new Error('Token expired');
            }
            return res.json();
        })
        .then(data => {
            if (data.error) {
                console.error('Spotify API error:', data.error);
                this.spotifyAccessToken = null;
                this.saveToStorage('spotifyAccessToken', null);
                return;
            }
            this.spotifyUser = data;
            this.saveToStorage('spotifyUser', data);
            console.log('✓ Spotify user loaded:', data.display_name);
            this.fetchSpotifyPlaylists();
            this.updateSpotifyUI();
        })
        .catch(err => {
            console.error('Spotify user fetch error:', err);
            this.spotifyAccessToken = null;
            this.saveToStorage('spotifyAccessToken', null);
        });
    }

    updateSpotifyUI() {
        // Update UI in settings page if it exists
        const spotifyStatus = document.getElementById('spotifyStatus');
        const spotifyUserInfo = document.getElementById('spotifyUserInfo');
        const spotifyUsername = document.getElementById('spotifyUsername');
        
        if (spotifyStatus && this.spotifyUser) {
            spotifyStatus.textContent = '✓ Connected to Spotify';
            spotifyStatus.style.color = '#1db954';
            if (spotifyUserInfo && spotifyUsername) {
                spotifyUserInfo.style.display = 'block';
                spotifyUsername.textContent = this.spotifyUser.display_name || this.spotifyUser.email;
            }
            const loginBtn = document.getElementById('spotifyLoginBtn');
            const logoutBtn = document.getElementById('spotifyLogoutBtn');
            if (loginBtn) loginBtn.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'block';
        }
    }

    fetchSpotifyPlaylists() {
        if (!this.spotifyAccessToken) return;

        fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
            headers: { 'Authorization': `Bearer ${this.spotifyAccessToken}` }
        })
        .then(res => res.json())
        .then(data => {
            this.spotifyPlaylists = data.items || [];
            console.log('Spotify playlists:', this.spotifyPlaylists);
        })
        .catch(err => console.error('Spotify playlists fetch error:', err));
    }

    searchSpotify(query) {
        if (!this.spotifyAccessToken) {
            alert('Please login with Spotify to search');
            return Promise.reject('Not authenticated');
        }

        return fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=20`, {
            headers: { 'Authorization': `Bearer ${this.spotifyAccessToken}` }
        })
        .then(res => res.json())
        .then(data => data.tracks.items || [])
        .catch(err => {
            console.error('Spotify search error:', err);
            return [];
        });
    }

    displaySpotifySearchResults(tracks) {
        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;

        resultsContainer.innerHTML = '';
        if (tracks.length === 0) {
            resultsContainer.innerHTML = '<p style="color: white;">No songs found on Spotify</p>';
            return;
        }

        tracks.forEach(track => {
            const resultDiv = document.createElement('div');
            resultDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #222; border-radius: 5px; margin: 5px 0;">
                    <div style="color: white; flex: 1;">
                        <strong>${track.name}</strong><br>
                        <small>${track.artists.map(a => a.name).join(', ')}</small>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="app.playSpotifyTrack('${track.uri}')" style="padding: 5px 10px; background: #1db954; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Play</button>
                        <button onclick="app.addSpotifyToPlaylist('${track.name}', '${track.artists[0].name}')" style="padding: 5px 10px; background: #1dd1a1; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Add</button>
                    </div>
                </div>
            `;
            resultsContainer.appendChild(resultDiv);
        });
    }

    playSpotifyTrack(trackUri) {
        if (!this.spotifyAccessToken) {
            alert('Please login with Spotify first');
            return;
        }

        // For web playback, we need the Web Playback SDK
        if (window.Spotify && window.Spotify.Player) {
            fetch(`https://api.spotify.com/v1/me/player/play`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.spotifyAccessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ uris: [trackUri] })
            })
            .then(() => console.log('Playing Spotify track'))
            .catch(err => console.error('Playback error:', err));
        } else {
            alert('Spotify Web Playback SDK not available. Make sure you\'re logged in with Premium.');
        }
    }

    addSpotifyToPlaylist(trackName, artistName) {
        const playlistName = prompt('Enter playlist name:');
        if (!playlistName) return;

        if (!this.playlists[playlistName]) {
            this.playlists[playlistName] = [];
        }

        const spotifyTrack = {
            id: Math.random() * 10000,
            title: trackName,
            artist: artistName,
            album: 'Spotify Track',
            url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
            duration: '3:00',
            isSpotify: true
        };

        this.playlists[playlistName].push(spotifyTrack);
        this.saveToStorage('playlists', this.playlists);
        alert(`Added "${trackName}" to "${playlistName}"`);
    }

    initSpotifyPlayback() {
        if (!window.Spotify) {
            const script = document.createElement('script');
            script.src = 'https://sdk.scdn.co/spotify-player.js';
            document.head.appendChild(script);

            window.onSpotifyWebPlaybackSDKReady = () => {
                this.setupSpotifyPlayer();
            };
        } else {
            this.setupSpotifyPlayer();
        }
    }

    setupSpotifyPlayer() {
        if (!this.spotifyAccessToken) return;

        const player = new window.Spotify.Player({
            name: 'Tranquil Music Player',
            getOAuthToken: callback => {
                callback(this.spotifyAccessToken);
            },
            volume: 0.5
        });

        player.addListener('player_state_changed', state => {
            if (state) {
                const current = state.track_window.current_track;
                console.log('Now playing:', current);
            }
        });

        player.connect();
        this.useSpotifyPlayback = true;
    }

    // ==================== AUTHENTICATION ====================
    signup(username, email, password) {
        const users = this.loadFromStorage('users') || {};
        if (users[email]) {
            return { success: false, message: 'Email already registered' };
        }
        users[email] = {
            username,
            email,
            password: btoa(password), // Simple encoding (not secure)
            createdAt: new Date().toISOString()
        };
        this.saveToStorage('users', users);
        this.currentUser = { username, email };
        this.saveToStorage('currentUser', this.currentUser);
        return { success: true, message: 'Signup successful!' };
    }

    login(email, password) {
        const users = this.loadFromStorage('users') || {};
        const user = users[email];
        if (!user || user.password !== btoa(password)) {
            return { success: false, message: 'Invalid credentials' };
        }
        this.currentUser = { username: user.username, email };
        this.saveToStorage('currentUser', this.currentUser);
        return { success: true, message: 'Login successful!' };
    }

    logout() {
        this.currentUser = null;
        this.saveToStorage('currentUser', null);
        window.location.href = 'index.html';
    }

    loadUser() {
        this.currentUser = this.loadFromStorage('currentUser');
        if (this.currentUser) {
            this.updateUserDisplay();
        }
    }

    updateUserDisplay() {
        const userDisplay = document.getElementById('userDisplay');
        if (userDisplay && this.currentUser) {
            userDisplay.innerHTML = `Welcome, <strong>${this.currentUser.username}</strong> | <a href="#" onclick="app.logout()">Logout</a>`;
        }
    }

    // ==================== AUDIO PLAYER ====================
    initializeAudioPlayer() {
        const player = document.getElementById('audioPlayer');
        const playBtn = document.getElementById('playBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const volumeControl = document.getElementById('volumeControl');
        const progressBar = document.getElementById('progressBar');
        const currentTimeDisplay = document.getElementById('currentTime');
        const durationDisplay = document.getElementById('duration');

        if (!player) return;

        if (playBtn) playBtn.addEventListener('click', () => this.playSong());
        if (pauseBtn) pauseBtn.addEventListener('click', () => this.pauseSong());
        if (volumeControl) {
            volumeControl.addEventListener('input', (e) => {
                if (player) player.volume = e.target.value / 100;
            });
        }
        if (progressBar) {
            progressBar.addEventListener('input', (e) => {
                if (player) player.currentTime = (e.target.value / 100) * player.duration;
            });
        }

        if (player) {
            player.addEventListener('timeupdate', () => this.updatePlayerDisplay());
            player.addEventListener('loadedmetadata', () => {
                if (durationDisplay) {
                    durationDisplay.textContent = this.formatTime(player.duration);
                    if (progressBar) progressBar.max = 100;
                }
            });
            player.addEventListener('ended', () => this.nextSong());
        }
    }

    playSong(song = null) {
        if (song) this.currentSong = song;
        const player = document.getElementById('audioPlayer');
        if (player && this.currentSong) {
            player.src = this.currentSong.url;
            player.play();
            this.isPlaying = true;
            this.addToPlayHistory(this.currentSong);
            this.updatePlayerUI();
            this.updateExpandedPlayer();
        }
    }

    pauseSong() {
        const player = document.getElementById('audioPlayer');
        if (player) {
            player.pause();
            this.isPlaying = false;
            this.updatePlayerUI();
        }
    }

    nextSong() {
        const currentIndex = this.songs.findIndex(s => s.id === this.currentSong.id);
        const nextIndex = (currentIndex + 1) % this.songs.length;
        this.playSong(this.songs[nextIndex]);
    }

    previousSong() {
        const currentIndex = this.songs.findIndex(s => s.id === this.currentSong.id);
        const prevIndex = currentIndex === 0 ? this.songs.length - 1 : currentIndex - 1;
        this.playSong(this.songs[prevIndex]);
    }

    updatePlayerDisplay() {
        const player = document.getElementById('audioPlayer');
        const currentTimeDisplay = document.getElementById('currentTime');
        const progressBar = document.getElementById('progressBar');

        if (player && currentTimeDisplay) {
            currentTimeDisplay.textContent = this.formatTime(player.currentTime);
        }
        if (player && progressBar && player.duration) {
            progressBar.value = (player.currentTime / player.duration) * 100;
        }
    }

    updatePlayerUI() {
        const playBtn = document.getElementById('playBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        if (playBtn) playBtn.style.display = this.isPlaying ? 'none' : 'block';
        if (pauseBtn) pauseBtn.style.display = this.isPlaying ? 'block' : 'none';
        
        const nowPlaying = document.getElementById('nowPlaying');
        if (nowPlaying && this.currentSong) {
            nowPlaying.innerHTML = `<strong>Now Playing:</strong> ${this.currentSong.title} - ${this.currentSong.artist}`;
        }
    }

    updateExpandedPlayer() {
        if (!this.currentSong) return;
        
        document.getElementById('expandedSongTitle').textContent = this.currentSong.title;
        document.getElementById('expandedSongArtist').textContent = this.currentSong.artist;
        document.getElementById('expandedAlbumName').textContent = this.currentSong.album;
        
        // Update album art based on album
        const albumIndex = this.songs.filter(s => s.album === this.currentSong.album).length > 0
            ? ['Serenity', 'Tranquility', 'Dusk', 'Dawn', 'Reflection', 'Midnight'].indexOf(this.currentSong.album)
            : 0;
        
        const albumImages = [
            'imagesd/serenity.png',
            'imagesd/tranquilityalbum.png',
            'imagesd/dusk.png',
            'imagesd/dawn.png',
            'imagesd/reflection.png',
            'imagesd/midnight.png'
        ];
        
        const albumArt = document.getElementById('expandedAlbumArt');
        if (albumArt && albumIndex >= 0) {
            albumArt.src = albumImages[albumIndex];
        }
        
        // Highlight now playing song in the list
        const songItems = document.querySelectorAll('.expanded-song-item');
        songItems.forEach(item => {
            item.classList.remove('now-playing');
            const songTitle = item.querySelector('strong');
            if (songTitle && songTitle.textContent.includes(this.currentSong.title)) {
                item.classList.add('now-playing');
            }
        });
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // ==================== SEARCH ====================
    search(query) {
        const lowerQuery = query.toLowerCase();
        return this.songs.filter(song =>
            song.title.toLowerCase().includes(lowerQuery) ||
            song.artist.toLowerCase().includes(lowerQuery) ||
            song.album.toLowerCase().includes(lowerQuery)
        );
    }

    performSearch() {
        const searchInput = document.getElementById('searchInput');
        const resultsContainer = document.getElementById('searchResults');

        if (!searchInput || !resultsContainer) return;

        const query = searchInput.value;
        
        // Check if user wants to search Spotify
        if (this.spotifyAccessToken && confirm('Search Spotify catalog instead of local library?')) {
            this.searchSpotify(query).then(tracks => {
                this.displaySpotifySearchResults(tracks);
            });
            return;
        }

        // Local search
        const results = this.search(query);
        resultsContainer.innerHTML = '';

        if (results.length === 0) {
            resultsContainer.innerHTML = '<p style="color: white;">No songs found</p>';
            return;
        }

        results.forEach(song => {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'search-result';
            resultDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #222; border-radius: 5px; margin: 5px 0;">
                    <div style="color: white;">
                        <strong>${song.title}</strong><br>
                        <small>${song.artist} - ${song.album}</small>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="app.playSong(app.songs.find(s => s.id === ${song.id}))" style="padding: 5px 10px; background: #1db954; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap; font-weight: bold;">Play</button>
                        <button onclick="app.showPlaylistSelector(${song.id})" style="padding: 5px 10px; background: #1dd1a1; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap; font-weight: bold;">Add</button>
                    </div>
                </div>
            `;
            resultsContainer.appendChild(resultDiv);
        });
    }

    // ==================== LIBRARY & INTERACTIVE ALBUMS ====================
    displayLibrary() {
        const libraryContainer = document.getElementById('libraryContainer');
        if (!libraryContainer) return;

        libraryContainer.innerHTML = '';
        const albums = {};

        this.songs.forEach(song => {
            if (!albums[song.album]) {
                albums[song.album] = [];
            }
            albums[song.album].push(song);
        });

        Object.keys(albums).forEach(albumName => {
            const albumDiv = document.createElement('div');
            albumDiv.className = 'album-card-interactive';
            albumDiv.style.cssText = 'background: #222; padding: 15px; border-radius: 10px; margin: 10px; cursor: pointer; color: white; text-align: center;';
            albumDiv.innerHTML = `
                <h3>${albumName}</h3>
                <p style="color: #aaa;">${albums[albumName].length} songs</p>
                <button onclick="app.showAlbumDetails('${albumName}')" style="padding: 8px 15px; background: #1db954; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 5px;">View Details</button>
                <button onclick="app.addAlbumToPlaylist('${albumName}')" style="padding: 8px 15px; background: #1dd1a1; color: white; border: none; border-radius: 5px; cursor: pointer;">Add to Playlist</button>
            `;
            libraryContainer.appendChild(albumDiv);
        });
    }

    showAlbumDetails(albumName) {
        const songs = this.songs.filter(s => s.album === albumName);
        alert(`Album: ${albumName}\n\nSongs:\n${songs.map(s => `- ${s.title} (${s.artist})`).join('\n')}`);
    }

    addAlbumToPlaylist(albumName) {
        const playlistName = prompt('Enter playlist name:');
        if (!playlistName) return;

        if (!this.playlists[playlistName]) {
            this.playlists[playlistName] = [];
        }

        const songs = this.songs.filter(s => s.album === albumName);
        songs.forEach(song => {
            if (!this.playlists[playlistName].find(s => s.id === song.id)) {
                this.playlists[playlistName].push(song);
            }
        });

        this.saveToStorage('playlists', this.playlists);
        alert(`Added ${songs.length} songs to "${playlistName}"`);
    }

    // ==================== PLAYLISTS ====================
    createPlaylist(name) {
        if (this.playlists[name]) {
            return { success: false, message: 'Playlist already exists' };
        }
        this.playlists[name] = [];
        this.saveToStorage('playlists', this.playlists);
        return { success: true, message: 'Playlist created!' };
    }

    deletePlaylist(name) {
        delete this.playlists[name];
        this.saveToStorage('playlists', this.playlists);
    }

    addSongToPlaylist(songId, playlistName) {
        if (!this.playlists[playlistName]) return false;
        const song = this.songs.find(s => s.id === songId);
        if (song && !this.playlists[playlistName].find(s => s.id === songId)) {
            this.playlists[playlistName].push(song);
            this.saveToStorage('playlists', this.playlists);
            return true;
        }
        return false;
    }

    showPlaylistSelector(songId) {
        const song = this.songs.find(s => s.id === songId);
        if (!song) return;

        const playlistNames = Object.keys(this.playlists);
        if (playlistNames.length === 0) {
            alert('No playlists available. Please create a playlist first.');
            return;
        }

        // Create a modal dialog for playlist selection
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: #222;
            border-radius: 10px;
            padding: 20px;
            max-width: 400px;
            width: 90%;
            color: white;
        `;

        content.innerHTML = `
            <h3 style="margin-top: 0; color: #1db954;">Add "${song.title}" to Playlist</h3>
            <div style="max-height: 300px; overflow-y: auto; margin: 15px 0;">
                ${playlistNames.map((name, index) => `
                    <button onclick="app.quickAddToPlaylist(${songId}, '${name.replace(/'/g, "\\'")}'); document.querySelector('[data-modal]').remove();" 
                            style="display: block; width: 100%; padding: 12px; margin: 8px 0; background: #1db954; color: white; border: none; border-radius: 5px; cursor: pointer; text-align: left; font-weight: bold;">
                        ${name} (${this.playlists[name].length} songs)
                    </button>
                `).join('')}
            </div>
            <button onclick="this.closest('[data-modal]').remove();" 
                    style="width: 100%; padding: 10px; background: #e74c3c; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                Cancel
            </button>
        `;

        modal.setAttribute('data-modal', 'true');
        modal.appendChild(content);
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    quickAddToPlaylist(songId, playlistName) {
        const result = this.addSongToPlaylist(songId, playlistName);
        if (result) {
            const song = this.songs.find(s => s.id === songId);
            alert(`Added "${song.title}" to "${playlistName}"`);
            this.displayPlaylists();
        } else {
            alert('Could not add song to playlist. It may already exist in this playlist.');
        }
    }

    removeSongFromPlaylist(songId, playlistName) {
        if (!this.playlists[playlistName]) return false;
        const index = this.playlists[playlistName].findIndex(s => s.id === songId);
        if (index > -1) {
            const song = this.playlists[playlistName][index];
            this.playlists[playlistName].splice(index, 1);
            this.saveToStorage('playlists', this.playlists);
            return true;
        }
        return false;
    }

    displayPlaylists() {
        const playlistContainer = document.getElementById('playlistContainer');
        if (!playlistContainer) return;

        playlistContainer.innerHTML = '<h2 style="color: white;">Your Playlists</h2>';

        if (Object.keys(this.playlists).length === 0) {
            playlistContainer.innerHTML += '<p style="color: #aaa;">No playlists created yet. Create one to get started!</p>';
            return;
        }

        Object.keys(this.playlists).forEach(playlistName => {
            const playlistDiv = document.createElement('div');
            playlistDiv.style.cssText = 'background: #222; padding: 15px; border-radius: 10px; margin: 15px 0; color: white;';
            
            const songs = this.playlists[playlistName];
            let songsHTML = '';

            if (songs.length === 0) {
                songsHTML = '<p style="color: #aaa; margin: 10px 0;">No songs in this playlist yet</p>';
            } else {
                songsHTML = songs.map((song, index) => `
                    <div style="background: #1a1a1a; padding: 12px; border-radius: 5px; margin: 8px 0; display: flex; justify-content: space-between; align-items: center;">
                        <div style="flex: 1;">
                            <strong>${index + 1}. ${song.title}</strong><br>
                            <small style="color: #aaa;">${song.artist} - ${song.album}</small>
                        </div>
                        <div style="display: flex; gap: 8px; white-space: nowrap; margin-left: 10px;">
                            <button onclick="app.playFromPlaylist(${song.id}, '${playlistName.replace(/'/g, "\\'")}');" style="padding: 6px 12px; background: #1db954; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 12px;">▶</button>
                            <button onclick="app.removeSongFromPlaylist(${song.id}, '${playlistName.replace(/'/g, "\\'")}'); app.displayPlaylists();" style="padding: 6px 12px; background: #ff6b6b; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 12px;">✕</button>
                        </div>
                    </div>
                `).join('');
            }

            playlistDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div>
                        <h3 style="margin: 0; color: #1db954;">${playlistName}</h3>
                        <small style="color: #aaa;">${songs.length} songs</small>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="app.playPlaylist('${playlistName}')" style="padding: 8px 15px; background: #1db954; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">▶ Play</button>
                        <button onclick="if(confirm('Delete this playlist?')) { app.deletePlaylist('${playlistName}'); app.displayPlaylists(); }" style="padding: 8px 15px; background: #e74c3c; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">🗑 Delete</button>
                    </div>
                </div>
                <div style="max-height: 400px; overflow-y: auto;">
                    ${songsHTML}
                </div>
            `;
            playlistContainer.appendChild(playlistDiv);
        });
    }

    playPlaylist(playlistName) {
        if (this.playlists[playlistName].length > 0) {
            // Get the first song ID from playlist and find it in the main library
            const playlistSong = this.playlists[playlistName][0];
            const librarySong = this.songs.find(s => s.id === playlistSong.id);
            if (librarySong) {
                this.playSong(librarySong);
            }
        }
    }

    playFromPlaylist(songId, playlistName) {
        // Find the song in the main library using the ID
        const librarySong = this.songs.find(s => s.id === songId);
        if (librarySong) {
            this.playSong(librarySong);
        } else {
            console.warn(`Song with ID ${songId} not found in library`);
        }
    }

    // ==================== FAVORITES ====================
    toggleFavorite(songId) {
        const index = this.favorites.findIndex(s => s.id === songId);
        if (index > -1) {
            this.favorites.splice(index, 1);
        } else {
            const song = this.songs.find(s => s.id === songId);
            if (song) this.favorites.push(song);
        }
        this.saveToStorage('favorites', this.favorites);
        this.updateFavoriteDisplay();
    }

    isFavorite(songId) {
        return this.favorites.some(s => s.id === songId);
    }

    displayFavorites() {
        const favContainer = document.getElementById('favoritesContainer');
        if (!favContainer) return;

        favContainer.innerHTML = '<h2 style="color: white;">Your Favorites</h2>';

        if (this.favorites.length === 0) {
            favContainer.innerHTML += '<p style="color: #aaa;">No favorites yet</p>';
            return;
        }

        this.favorites.forEach(song => {
            const songDiv = document.createElement('div');
            songDiv.style.cssText = 'background: #222; padding: 10px; border-radius: 5px; margin: 5px 0; color: white; display: flex; justify-content: space-between; align-items: center;';
            songDiv.innerHTML = `
                <div>
                    <strong>${song.title}</strong><br>
                    <small>${song.artist}</small>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button onclick="app.playSong(app.songs.find(s => s.id === ${song.id}))" style="padding: 5px 10px; background: #1db954; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap; font-weight: bold;">Play</button>
                    <button onclick="app.showPlaylistSelector(${song.id})" style="padding: 5px 10px; background: #1dd1a1; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap; font-weight: bold;">Add</button>
                </div>
            `;
            favContainer.appendChild(songDiv);
        });
    }

    updateFavoriteDisplay() {
        const favBtn = document.getElementById('favBtn');
        if (favBtn && this.currentSong) {
            const isFav = this.isFavorite(this.currentSong.id);
            favBtn.innerHTML = isFav ? '❤️ Unfavorite' : '🤍 Favorite';
        }
    }

    // ==================== PLAY HISTORY ====================
    addToPlayHistory(song) {
        this.playHistory = this.playHistory.filter(s => s.id !== song.id);
        this.playHistory.unshift({...song, playedAt: new Date().toISOString()});
        if (this.playHistory.length > 100) this.playHistory.pop();
        this.saveToStorage('playHistory', this.playHistory);
        this.updateRecommendations();
    }

    displayPlayHistory() {
        const historyContainer = document.getElementById('historyContainer');
        if (!historyContainer) return;

        historyContainer.innerHTML = '<h2 style="color: white;">Recent Plays</h2>';

        if (this.playHistory.length === 0) {
            historyContainer.innerHTML += '<p style="color: #aaa;">No play history yet</p>';
            return;
        }

        this.playHistory.slice(0, 20).forEach(song => {
            const historyDiv = document.createElement('div');
            historyDiv.style.cssText = 'background: #222; padding: 10px; border-radius: 5px; margin: 5px 0; color: white;';
            historyDiv.innerHTML = `
                <strong>${song.title}</strong> - ${song.artist}<br>
                <small style="color: #aaa;">${new Date(song.playedAt).toLocaleString()}</small>
            `;
            historyContainer.appendChild(historyDiv);
        });
    }

    // ==================== RECOMMENDATIONS ====================
    updateRecommendations() {
        const artistCounts = {};
        this.playHistory.forEach(song => {
            artistCounts[song.artist] = (artistCounts[song.artist] || 0) + 1;
        });

        const topArtists = Object.keys(artistCounts).sort((a, b) => artistCounts[b] - artistCounts[a]).slice(0, 3);

        this.recommendations = this.songs.filter(song =>
            topArtists.includes(song.artist) && !this.playHistory.find(h => h.id === song.id)
        ).slice(0, 6);
    }

    displayRecommendations() {
        const recContainer = document.getElementById('recommendationsContainer');
        if (!recContainer) return;

        if (this.recommendations.length === 0) {
            recContainer.innerHTML = '<p style="color: #aaa;">Play more songs to get recommendations</p>';
            return;
        }

        recContainer.innerHTML = '';
        this.recommendations.forEach(song => {
            const recDiv = document.createElement('div');
            recDiv.style.cssText = 'background: #222; padding: 10px; border-radius: 5px; margin: 5px 0; color: white; display: flex; justify-content: space-between; align-items: center;';
            recDiv.innerHTML = `
                <div>
                    <strong>${song.title}</strong><br>
                    <small>${song.artist}</small>
                </div>
                <button onclick="app.playSong(app.songs.find(s => s.id === ${song.id}))" style="padding: 5px 10px; background: #1db954; color: white; border: none; border-radius: 5px; cursor: pointer;">Play</button>
            `;
            recContainer.appendChild(recDiv);
        });
    }

    // ==================== THEME ====================
    toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        this.saveToStorage('theme', this.theme);
        this.applyTheme();
    }

    applyTheme() {
        const root = document.documentElement;
        if (this.theme === 'light') {
            root.style.setProperty('--bg-color', '#ffffff');
            root.style.setProperty('--text-color', '#000000');
            root.style.setProperty('--card-bg', '#f0f0f0');
            document.body.style.backgroundColor = '#ffffff';
            document.body.style.color = '#000000';
        } else {
            root.style.setProperty('--bg-color', '#000000');
            root.style.setProperty('--text-color', '#ffffff');
            root.style.setProperty('--card-bg', '#222222');
            document.body.style.backgroundColor = '#000000';
            document.body.style.color = '#ffffff';
        }
    }

    // ==================== STORAGE ====================
    saveToStorage(key, data) {
        localStorage.setItem(`tranquil_${key}`, JSON.stringify(data));
    }

    loadFromStorage(key) {
        const data = localStorage.getItem(`tranquil_${key}`);
        return data ? JSON.parse(data) : null;
    }

    // ==================== SONG DATA ====================
    generateSongs() {
        return [
            // Serenity Album
            { id: 1, title: 'Peaceful Melody', artist: 'Calm Waters', album: 'Serenity', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', duration: '9:35' },
            { id: 2, title: 'Zen Vibes', artist: 'Calm Waters', album: 'Serenity', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', duration: '9:35' },
            { id: 13, title: 'Inner Peace', artist: 'Calm Waters', album: 'Serenity', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', duration: '8:42' },
            { id: 14, title: 'Harmony Flow', artist: 'Calm Waters', album: 'Serenity', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', duration: '7:18' },
            
            // Tranquility Album
            { id: 3, title: 'Ocean Waves', artist: 'Nature Sounds', album: 'Tranquility', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', duration: '9:35' },
            { id: 4, title: 'Forest Walk', artist: 'Nature Sounds', album: 'Tranquility', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', duration: '9:35' },
            { id: 15, title: 'Bird Song', artist: 'Nature Sounds', album: 'Tranquility', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', duration: '6:50' },
            { id: 16, title: 'Stream Flow', artist: 'Nature Sounds', album: 'Tranquility', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', duration: '8:15' },
            
            // Dusk Album
            { id: 5, title: 'Sunset Dreams', artist: 'Evening Sounds', album: 'Dusk', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', duration: '9:35' },
            { id: 6, title: 'Starlight', artist: 'Evening Sounds', album: 'Dusk', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', duration: '9:35' },
            { id: 17, title: 'Evening Glow', artist: 'Evening Sounds', album: 'Dusk', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', duration: '7:55' },
            { id: 18, title: 'Twilight Dance', artist: 'Evening Sounds', album: 'Dusk', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', duration: '8:22' },
            
            // Dawn Album
            { id: 7, title: 'Morning Light', artist: 'Day Dreams', album: 'Dawn', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', duration: '9:35' },
            { id: 8, title: 'Gentle Rain', artist: 'Day Dreams', album: 'Dawn', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', duration: '9:35' },
            { id: 19, title: 'Sunrise Embrace', artist: 'Day Dreams', album: 'Dawn', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', duration: '7:28' },
            { id: 20, title: 'New Horizons', artist: 'Day Dreams', album: 'Dawn', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', duration: '8:05' },
            
            // Reflection Album
            { id: 9, title: 'Whispered Thoughts', artist: 'Mind Music', album: 'Reflection', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3', duration: '9:35' },
            { id: 10, title: 'Silent Moments', artist: 'Mind Music', album: 'Reflection', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3', duration: '9:35' },
            { id: 21, title: 'Deep Meditation', artist: 'Mind Music', album: 'Reflection', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', duration: '10:12' },
            { id: 22, title: 'Introspection', artist: 'Mind Music', album: 'Reflection', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', duration: '8:47' },
            
            // Midnight Album
            { id: 11, title: 'Moonlight Dreams', artist: 'Midnight Echoes', album: 'Midnight', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', duration: '9:35' },
            { id: 12, title: 'Starry Night', artist: 'Midnight Echoes', album: 'Midnight', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', duration: '9:35' },
            { id: 23, title: 'Nocturne', artist: 'Midnight Echoes', album: 'Midnight', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', duration: '9:08' },
            { id: 24, title: 'Night Whisper', artist: 'Midnight Echoes', album: 'Midnight', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', duration: '7:42' },
            
            // Solitude Album (New)
            { id: 25, title: 'Alone Together', artist: 'Echo Chamber', album: 'Solitude', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', duration: '8:20' },
            { id: 26, title: 'Silence Speaks', artist: 'Echo Chamber', album: 'Solitude', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', duration: '7:55' },
            { id: 27, title: 'Echoes Fading', artist: 'Echo Chamber', album: 'Solitude', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', duration: '9:10' },
            { id: 28, title: 'The Void', artist: 'Echo Chamber', album: 'Solitude', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', duration: '8:35' },
            
            // Journey Album (New)
            { id: 29, title: 'Path Unknown', artist: 'Wandering Souls', album: 'Journey', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', duration: '8:50' },
            { id: 30, title: 'Endless Roads', artist: 'Wandering Souls', album: 'Journey', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', duration: '7:20' },
            { id: 31, title: 'Destination Dreaming', artist: 'Wandering Souls', album: 'Journey', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', duration: '8:15' },
            { id: 32, title: 'Homeward Bound', artist: 'Wandering Souls', album: 'Journey', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', duration: '9:05' }
        ];
    }

    setupEventListeners() {
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) searchBtn.addEventListener('click', () => this.performSearch());
        
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });

        // Close modal when clicking outside of it
        const modal = document.getElementById('albumModal');
        if (modal) {
            window.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeAlbumModal();
                }
            });
        }
    }

    // ==================== ALBUM MODAL ====================
    showAlbumModal(albumName, albumIndex) {
        this.openExpandedPlayer(albumName, albumIndex);
    }

    closeAlbumModal() {
        this.closeExpandedPlayer();
    }

    toggleExpandedPlayer() {
        const expandedPlayer = document.getElementById('expandedPlayer');
        const body = document.body;
        if (expandedPlayer && expandedPlayer.style.display === 'none') {
            expandedPlayer.style.display = 'block';
            body.classList.add('expanded-player-open');
        } else if (expandedPlayer) {
            expandedPlayer.style.display = 'none';
            body.classList.remove('expanded-player-open');
        }
    }

    openExpandedPlayer(albumName, albumIndex) {
        const expandedPlayer = document.getElementById('expandedPlayer');
        const body = document.body;
        const albumSongs = this.songs.filter(s => s.album === albumName);
        
        if (!albumSongs.length) return;

        const albumImages = [
            'imagesd/serenity.png',
            'imagesd/tranquilityalbum.png',
            'imagesd/dusk.png',
            'imagesd/dawn.png',
            'imagesd/reflection.png',
            'imagesd/midnight.png'
        ];

        // Update expanded player header
        document.getElementById('expandedAlbumArt').src = albumImages[albumIndex];
        document.getElementById('expandedSongTitle').textContent = albumName;
        document.getElementById('expandedSongArtist').textContent = albumSongs[0].artist;
        document.getElementById('expandedAlbumName').textContent = `${albumSongs.length} songs`;

        // Update expanded player songs list
        const songsList = document.getElementById('expandedSongsList');
        songsList.innerHTML = '';
        
        albumSongs.forEach((song, index) => {
            const songDiv = document.createElement('div');
            songDiv.className = 'expanded-song-item';
            if (this.currentSong && this.currentSong.id === song.id) {
                songDiv.classList.add('now-playing');
            }
            songDiv.innerHTML = `
                <div class="expanded-song-info">
                    <strong>${index + 1}. ${song.title}</strong>
                    <small>${song.artist}</small>
                </div>
                <div class="expanded-song-duration">${song.duration || '9:35'}</div>
                <button onclick="app.playSong(app.songs.find(s => s.id === ${song.id}))" 
                        style="padding: 8px 15px; background: #1db954; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap; margin-left: 10px; font-weight: bold; font-size: 12px;">
                    ▶ Play
                </button>
                <button onclick="app.showPlaylistSelector(${song.id})" 
                        style="padding: 8px 15px; background: #1dd1a1; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap; margin-left: 5px; font-weight: bold; font-size: 12px;">
                    ➕ Add
                </button>
            `;
            songsList.appendChild(songDiv);
        });

        // Show expanded player
        if (expandedPlayer) {
            expandedPlayer.style.display = 'block';
            body.classList.add('expanded-player-open');
        }
    }

    closeExpandedPlayer() {
        const expandedPlayer = document.getElementById('expandedPlayer');
        const body = document.body;
        if (expandedPlayer) {
            expandedPlayer.style.display = 'none';
            body.classList.remove('expanded-player-open');
        }
    }

    playAlbum() {
        const albumTitle = document.getElementById('expandedSongTitle').textContent;
        const albumSongs = this.songs.filter(s => s.album === albumTitle);
        
        if (albumSongs.length > 0) {
            this.playSong(albumSongs[0]);
        }
    }
}

// Initialize app
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new MusicApp();
});
