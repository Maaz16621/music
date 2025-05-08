const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const fs = require('fs');
const csv = require('csv-parser');
require('dotenv').config();

const app = express();
const port = 3001;

// Define Spotify URLs
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_SEARCH_URL = 'https://api.spotify.com/v1/search';
const SPOTIFY_AUDIO_FEATURES_URL ='https://api.spotify.com/v1/tracks';
// Check if API keys are set
const GENIUS_API_KEY = process.env.GENIUS_API_KEY;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!GENIUS_API_KEY || !SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    console.error('Missing API keys in environment variables.');
    process.exit(1);
}

app.use(cors());
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Spotify Track Info
async function getSpotifyTrackInfo(songTitle, artistName) {
    console.log("Searching Spotify for:", songTitle, artistName);

    try {
        // Step 1: Get access token
        const authResponse = await axios.post(SPOTIFY_TOKEN_URL, 
            new URLSearchParams({ grant_type: 'client_credentials' }), 
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
                }
            }
        );

        const accessToken = authResponse.data.access_token;
        console.log("Spotify Access Token obtained.");

        // Step 2: Search for track
        const query = `${songTitle} ${artistName}`;
        const searchResponse = await axios.get(`${SPOTIFY_SEARCH_URL}?q=${encodeURIComponent(query)}&type=track&limit=1`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const tracks = searchResponse.data.tracks.items;
        console.log("Spotify Search Results:", tracks);

        if (tracks.length > 0) {
            const track = tracks[0];
            const trackUrl = track.external_urls.spotify;
            const trackId = track.id;
            const artistId = track.artists[0].id;
            const artistName = track.artists[0].name;
            const genre = track.album.genres || ['Genre not available']; // Genres might not always be available
            const country = track.available_markets.join(", ") || 'Countries not available'; // Available countries

            console.log("Spotify Track Found:", trackUrl);
            console.log("Track Genre(s):", genre);
            console.log("Available in Countries:", country);
            
            return {
                trackUrl,
                trackId,
                artistId,
                artistName,
                genre,
                country
            };
        } else {
            console.log("No matching Spotify track found.");
            return null;
        }

    } catch (err) {
        console.error("Spotify API Error:", err.response?.data || err.message);
        return null;
    }
}

// Genius Lyrics Search Endpoint
app.get('/api/lyrics/search', async (req, res) => {
    const { artist, songTitle } = req.query;

    if (!artist || !songTitle) {
        return res.status(400).json({ error: 'Please provide artist and song title.' });
    }

    const url = `https://api.genius.com/search?q=${encodeURIComponent(artist + ' ' + songTitle)}`;

    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${GENIUS_API_KEY}`
            }
        });

        const hits = response.data.response.hits;

        if (hits.length > 0) {
            const songResult = hits[0]?.result;

            const songUrl = songResult?.url || '#';
            const headerImageUrl = songResult?.header_image_url || '';
            const songArtImageUrl = songResult?.song_art_image_url || '';
            const releaseDate = songResult?.release_date_for_display || 'Release date not available';
            const stats = songResult?.stats || { pageviews: 'N/A', pyongs: 'N/A' };

            // Get additional Spotify metadata
            const spotifyData = await getSpotifyTrackInfo(songTitle, artist);

            res.json({
                title: songResult?.title || 'Unknown Title',
                artistNames: songResult?.artist_names || 'Unknown Artist',
                songUrl,
                headerImageUrl,
                songArtImageUrl,
                releaseDate,
                stats,
                spotifyTrackUrl: spotifyData?.trackUrl || null,
                spotifyTrackId: spotifyData?.trackId || null,
                spotifyArtistId: spotifyData?.artistId || null,
                spotifyArtistName: spotifyData?.artistName || null,
                spotifyGenres: spotifyData?.genre || ['Not available'],
                spotifyAvailableMarkets: spotifyData?.country || 'Not available'
            });
        } else {
            res.status(404).json({ error: 'No matching song found.' });
        }
    } catch (error) {
        console.error('Genius API error:', error);
        res.status(500).json({ error: 'Internal Server Error (Genius).' });
    }
});

// Load songs from CSV at startup
let songs = [];
fs.createReadStream('spotify_songs.csv')
  .pipe(csv())
  .on('data', (row) => {
    songs.push({
      title: row.track_name.toLowerCase(),
      artist: row.track_artist.toLowerCase(),
      genre: row.playlist_genre?.toLowerCase() || '',
      subgenre: row.playlist_subgenre?.toLowerCase() || ''
    });
  })
  .on('end', () => {
    console.log(`Loaded ${songs.length} songs from CSV.`);
  });

// Endpoint to suggest song

let spotifyAccessToken = '';

async function getSpotifyAccessToken() {
  if (spotifyAccessToken) return spotifyAccessToken;

  const response = await axios.post(SPOTIFY_TOKEN_URL,
    new URLSearchParams({ grant_type: 'client_credentials' }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
      }
    });

  spotifyAccessToken = response.data.access_token;
  return spotifyAccessToken;
}


app.post('/api/ai/suggestions', async (req, res) => {
    const { history } = req.body;
  
    if (!Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ error: 'No history provided' });
    }
  
    const matchedGenres = new Set();
    const matchedSubgenres = new Set();
    const matchedArtists = new Set();
  
    // Extract genres, subgenres, and artists from history
    history.forEach(({ title, artistNames, spotifyGenres }) => {
      const artist = artistNames.toLowerCase();
      matchedArtists.add(artist);
  
      (spotifyGenres || []).forEach(g => {
        if (g && g !== "Genre not available") {
          matchedGenres.add(g.toLowerCase());
        }
      });
  
      const matchedSong = songs.find(song =>
        song.title === title.toLowerCase() && song.artist === artist
      );
  
      if (matchedSong) {
        if (matchedSong.genre) matchedGenres.add(matchedSong.genre);
        if (matchedSong.subgenre) matchedSubgenres.add(matchedSong.subgenre);
      }
    });
  
    if (matchedGenres.size === 0 && matchedSubgenres.size === 0 && matchedArtists.size === 0) {
      return res.status(404).json({ error: 'No matching genre or artist found' });
    }
  
    const historyKeys = new Set(history.map(h =>
      `${h.title.toLowerCase()}-${h.artistNames.toLowerCase()}`
    ));
  
    // Filter out songs that are already in the history and match genres, subgenres, or artists
    const suggestions = songs.filter(song => {
      const key = `${song.title}-${song.artist}`;
      return !historyKeys.has(key) && (
        matchedGenres.has(song.genre) ||
        matchedSubgenres.has(song.subgenre) ||
        matchedArtists.has(song.artist)
      );
    });
  
    // Deduplicate suggestions using a Map to store unique songs by key (title and artist)
    const unique = new Map();
    for (const song of suggestions) {
      const key = `${song.title.toLowerCase()}-${song.artist.toLowerCase()}`;
      if (!unique.has(key)) {
        unique.set(key, song);
      }
    }
  
    // Convert to an array and slice the results to limit the number of suggestions
    const uniqueSongs = Array.from(unique.values()).slice(0, 5);
  
    const token = await getSpotifyAccessToken();
    const finalSuggestions = [];
  
    // Fetch Spotify URLs for each unique suggestion
    for (const song of uniqueSongs) {
      const query = `${song.title} ${song.artist}`;
      try {
        const result = await axios.get(`${SPOTIFY_SEARCH_URL}?q=${encodeURIComponent(query)}&type=track&limit=1`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
  
        const track = result.data.tracks.items[0];
        if (track) {
          finalSuggestions.push({
            title: song.title,
            artist: song.artist,
            url: track.external_urls.spotify,
            preview_url: track.preview_url || null,
            albumImage: track.album.images?.[0]?.url || null
          });
        }
      } catch (err) {
        console.warn(`Failed to get URL for ${song.title} by ${song.artist}`);
      }
    }
  
    res.json({
      suggestions: finalSuggestions
    });
  });
  


app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
