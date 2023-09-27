const readline = require('readline');
const fs = require('fs');
const { exec } = require('child_process');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function parseTimestamp(timestampStr) {
  const [minutes, seconds] = timestampStr.split(':').map(Number);
  if (isNaN(minutes) || isNaN(seconds)) {
    return NaN;
  }
  return minutes * 60 + seconds;
}

// Prompt the user for the input music file path
rl.question('Enter the path to the music file (e.g., song.mp3): ', (inputFilePath) => {
  // Check if the input file exists
  if (!fs.existsSync(inputFilePath)) {
    console.error('Error: Input file does not exist.');
    rl.close();
    return;
  }

  // Prompt the user for the timestamp in min:sec format
  rl.question('Enter the timestamp (in min:sec format) to split the audio at: ', (timestampStr) => {
    const timestampInSeconds = parseTimestamp(timestampStr);

    // Check if the parsed timestamp is a valid number
    if (isNaN(timestampInSeconds) || timestampInSeconds < 0) {
      console.error('Error: Invalid timestamp format. Please use min:sec format (e.g., 3:21).');
      rl.close();
      return;
    }

    // Build the output file names
    const outputFilePath1 = 'part1.mp3';
    const outputFilePath2 = 'part2.mp3';

    // Run the ffmpeg command to split the audio
    const command = `ffmpeg -i "${inputFilePath}" -ss ${timestampInSeconds} -acodec copy "${outputFilePath1}" -ss ${timestampInSeconds} -acodec copy "${outputFilePath2}"`;

    exec(command, (error) => {
      if (error) {
        console.error(`Error: ${error.message}`);
      } else {
        console.log(`Audio split at ${timestampStr}.`);
        console.log(`Part 1 saved as ${outputFilePath1}`);
        console.log(`Part 2 saved as ${outputFilePath2}`);
      }
      rl.close();
    });
  });
});
