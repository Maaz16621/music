const synaptic = require('synaptic');
const csv = require('csv-parser');
const fs = require('fs');

// Load the dataset
const data = [];
fs.createReadStream('spotify_songs.csv')
  .pipe(csv())
  .on('data', (row) => {
    data.push(row);
  })
  .on('end', () => {
    // Preprocess the data
    const genres = [...new Set(data.map((row) => row.genre))]; // Get unique genres
    const features = data.map((row) => ({
      danceability: parseFloat(row.danceability),
      energy: parseFloat(row.energy),
    }));
    const outputs = data.map((row) => {
      const index = genres.indexOf(row.genre);
      const output = new Array(genres.length).fill(0);
      output[index] = 1;
      return output;
    });

    // Create a new neural network
    const network = new synaptic.Architect.Perceptron(2, 10, genres.length);

    // Train the model
    for (let i = 0; i < 100; i++) {
      features.forEach((feature, index) => {
        const input = [feature.danceability, feature.energy];
        network.activate(input);
        network.propagate(0.1, outputs[index]);
      });
      console.log(`Epoch ${i + 1} complete!`);
    }

    console.log('Training complete!');

    // Save the model
    const networkData = network.toJSON();
    fs.writeFileSync('network.json', JSON.stringify(networkData));
    fs.writeFileSync('genres.json', JSON.stringify(genres));
    console.log('Model saved to network.json and genres to genres.json');
  });