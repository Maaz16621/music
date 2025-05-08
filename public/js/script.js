document.addEventListener('DOMContentLoaded', function () {

  const lyricsForm = document.getElementById('lyricsForm');
  const suggestedList = document.getElementById("suggestedList");

  lyricsForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const artist = document.getElementById('artist').value.trim();
    const songTitle = document.getElementById('songTitle').value.trim();

    if (!artist || !songTitle) {
      alert("Please enter both artist and song title.");
      return;
    }

    saveSearchToHistory(artist, songTitle);

    const modalContent = document.getElementById('modalLyricsContent');
    modalContent.innerHTML = "<p style='color: #ccc;'>Loading song information...</p>";

    try {
      const response = await fetch(`http://localhost:3001/api/lyrics/search?artist=${encodeURIComponent(artist)}&songTitle=${encodeURIComponent(songTitle)}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Error ${response.status}: ${errorData.error || 'Unknown error'}`);
      }

      const data = await response.json();

      if (!data || Object.keys(data).length === 0) {
        modalContent.innerHTML = `<p style="color: #ff6b6b;">No matching song found or server error occurred.</p>`;
        return;
      }

      // Save song to localStorage
      saveSongToLocalStorage(data);

      const output = `
        <div style="display: flex; flex-direction: column; flex-wrap: wrap; gap: 20px; color: #fff; background-color: #1e1e1e; padding: 15px; border-radius: 10px;">
          <div style="display: flex; flex-direction: row; flex-wrap: wrap; gap: 20px;">
            ${data.songArtImageUrl ? 
              `<div style="flex-shrink: 0;">
                <img src="${data.songArtImageUrl}" alt="Artwork" style="width: 200px; height: 200px; object-fit: cover; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);" />
              </div>` : ''}
            <div style="flex: 1;">
              <h3 style="margin-bottom: 10px;">${data.title || 'Unknown Title'}</h3>
              <h5 style="margin-bottom: 15px; color: #ccc;">by ${data.artistNames || 'Unknown Artist'}</h5>
              <p><strong>Release Date:</strong> ${data.releaseDate || 'N/A'}</p>
              <p><strong>Stats:</strong> Pageviews: ${data.stats?.pageviews || 'N/A'}</p>
              <p><strong>Genius Lyrics:</strong> <a href="${data.songUrl}" target="_blank" style="color: #1db954;">${data.songUrl}</a></p>
              ${data.spotifyTrackUrl ? 
                `<div style="margin-top: 15px;">
                  <p><strong>Listen on Spotify:</strong> <a href="${data.spotifyTrackUrl}" target="_blank" style="color: #1db954;">Open Spotify</a></p>
                </div>` : ''}
            </div>
          </div>
        </div>
      `;

      modalContent.innerHTML = output;

      const songInfoModal = new bootstrap.Modal(document.getElementById('songInfoModal'));
      songInfoModal.show();

      setTimeout(loadSuggestions(), 500);

    } catch (error) {
      console.error("Fetch Error:", error);
      modalContent.innerHTML = `<p style="color: #ff6b6b;">An error occurred: ${error.message}</p>`;
    }
  });
  function fetchSuggestionsFromAPI(history) {
    fetch("http://localhost:3001/api/ai/suggestions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ history })
    })
      .then(res => res.json())
      .then(data => {
        const suggestions = data.suggestions.slice(0, 5);
        displaySuggestions(suggestions);
      })
      .catch(err => {
        console.error("Suggestion API error:", err);
        suggestedList.innerHTML = "<li class='list-group-item text-danger'>Unable to load suggestions.</li>";
      });
  }
  
  function loadSuggestions() {
    const history = JSON.parse(localStorage.getItem('savedSongs')) || [];
    fetchSuggestionsFromAPI(history);
  }
  

  function displaySuggestions(songs) {
    suggestedList.innerHTML = "";
    songs.forEach(song => {
      const li = document.createElement("li");
      li.classList.add("list-group-item", "d-flex", "justify-content-between", "align-items-center");
  
      const content = document.createElement("div");
      content.innerHTML = `<strong>${song.artist}</strong> - ${song.title}`;
  
      const link = document.createElement("a");
      link.href = song.url;
      link.target = "_blank";
      link.classList.add("btn", "btn-success", "btn-sm");
      link.textContent = "Play";
  
      li.appendChild(content);
      li.appendChild(link);
  
      suggestedList.appendChild(li);
    });
  }
  
  function saveSongToLocalStorage(songData) {
    try {
      const stored = JSON.parse(localStorage.getItem('savedSongs')) || [];
      
      // Check if the song already exists in the saved songs based on title and artist
      const songExists = stored.some(song =>
        song.title.toLowerCase() === songData.title.toLowerCase() && 
        song.artistNames.toLowerCase() === songData.artistNames.toLowerCase()
      );
  
      if (!songExists) {
        stored.push({
          title: songData.title,
          artistNames: songData.artistNames,
          spotifyTrackId: songData.spotifyTrackId,
          spotifyArtistId: songData.spotifyArtistId,
          spotifyGenres: songData.spotifyGenres,
          timestamp: new Date().toISOString()
        });
        localStorage.setItem('savedSongs', JSON.stringify(stored));
        console.log("Song saved to localStorage.");
      } else {
        console.log("Song already exists in localStorage.");
      }
    } catch (err) {
      console.error("Failed to save song:", err);
    }
  }
  
});