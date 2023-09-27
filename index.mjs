import fetch from 'node-fetch';
import cheerio from 'cheerio';
import { createLogger, transports, format } from 'winston';
import readline from 'readline';
import fs from 'fs/promises';
import {createWriteStream} from 'fs';

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.colorize(),
    format.simple()
  ),
  transports: [new transports.Console()],
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let download_count = 0;

async function getUserInput() {
  return new Promise((resolve, reject) => {
    rl.question('Enter the YouTube playlist URL: ', (playlistUrl) => {
      rl.question('Enter the folder name to save the downloads: ', async (folderName) => {
        rl.question('Enter format: ', async (format) => {
          rl.close();
          resolve({ playlistUrl, folderName, format });
        });
      });
    });
  });
}

function fetchProgress(e) {
  return fetch("https://p.oceansaver.in/ajax/progress.php?id=" + e, {
    cache: "no-store",
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    });
}

async function checkDownloadProgress({ e, title }, maxRetries = 100) {
  let retryCount = 0;
  console.log(title)
  async function attemptDownload() {
    try {
      const data = await fetchProgress(e);
      const progressPercentage = data.progress / 10;

      // Log progress with a maximum of one log per second
      if (progressPercentage % 10 === 0) {
        logger.info(`Download Progress for ID ${e}: ${progressPercentage}%`);
      }

      if (data.download_url !== null && data.success == true) {
        logger.info(`Download URL for ID ${e}: ${data.download_url}`);
        logger.info(`Download completed for ID ${e}`);
        return { url: data.download_url, title };
      } else if (retryCount < maxRetries) {
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, 1500));
        return attemptDownload();
      } else {
        logger.info(`Max retries (${maxRetries}) reached. Download failed.`);
        return null;
      }
    } catch (error) {
      logger.error(error);
      if (retryCount < maxRetries) {
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, 1500));
        return attemptDownload();
      } else {
        logger.info(`Max retries (${maxRetries}) reached. Download failed.`);
        return null;
      }
    }
  }

  return attemptDownload();
}

function isValidURL(url) {
  try {
    new URL(url);
  } catch (error) {
    return false;
  }
  return true;
}

function parseYtId(e) {
  let t;
  return e.indexOf("youtube.com/shorts/") > -1 ? (t = /\/shorts\/([a-zA-Z0-9\-_]{11})/.exec(e)) : e.indexOf("youtube.com/") > -1 ? (t = /v=([a-zA-Z0-9\-_]{11})/.exec(e)) : e.indexOf("youtu.be/") > -1 && (t = /\/([a-zA-Z0-9\-_]{11})/.exec(e)), t ? t[1] : null;
}

function isYouTube(e) {
  return e.includes("youtu");
}

async function downloadVideo(link, format, title) {
  try {
    const response = await fetch(`https://loader.to/ajax/download.php?format=${format}&url=${encodeURIComponent(link)}`, {
      cache: 'no-store',
    });
    const data = await response.json();

    if (data && data.content && data.success) {
      // Optionally, you can call the p() function here.
      return data;
    } else {
      logger.error('Failed to download video content.'+title);
      return null;
    }
  } catch (error) {
    logger.error(error,title);
    return null;
  }
}

async function downloadPlaylist(format, link, folderName) {
  try {
    const response = await fetch("https://loader.to/ajax/playlist.php?format=" + format + "&url=" + encodeURIComponent(link), {
      cache: "no-store",
    });
    const data = await response.json();

    if (data.is_playlist === true) {
      logger.info("Playlist detected:");
      logger.info("Downloading playlist...");
      download_count++;
      const $ = cheerio.load(data.html);
      const downloadIds = [];
      $('a[onclick]').each((index, element) => {
        const onclickValue = $(element).attr('onclick');
        const match = /downloadFromList\('([^']+)'\)/.exec(onclickValue);
        if (match && match[1]) {
          const videoLink = "https://www.youtube.com/watch?v=" + match[1];
          downloadIds.push(downloadVideo(videoLink, format, match[1]));
        }
      });

      let datas = (await Promise.allSettled(downloadIds))
      const successFulData = datas.filter((data) => data.value.success).map((data)=>data.value);
      logger.info('total video :' + datas.length)
      logger.info('total successes:' + successFulData.length)
      
      const PromiseUrls = successFulData.map((value) => checkDownloadProgress({ e: value.id, title: value.title }))
      
      const urls = (await Promise.allSettled(PromiseUrls)).map(urls=>urls.value);
        await createFolder(folderName);
      
      const successes = await Promise.allSettled(urls.map(({ url, title }) => downloadFile(url, `${folderName}/${title || Date.now().toString()}.${format}`)));

      // TODO: Continue with the download logic here, handle URLs
    } else {
      logger.log(data)
      logger.log("Single video detected:");
      logger.log("unable to Download video...");
      // download_count++;
      // downloadVideo("https://www.youtube.com/watch?v=" + parseYtId(link), format, parseYtId(link));

      // TODO: Continue with the download logic here, handle single video
    }
  } catch (error) {
    logger.error(error);
  }
}

async function downloadFile(url, savePath) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const fileStream = createWriteStream(savePath);
    await new Promise((resolve, reject) => {
      response.body.pipe(fileStream);
      response.body.on('error', (err) => {
        reject(err);
      });
      fileStream.on('finish', function () {
        resolve();
      });
    });

    console.log(`File downloaded and saved as: ${savePath}`);
    return
  } catch (error) {
    logger.error('Download failed:', error);
  }
}

// Usage example:
async function mainTread() {
  const { playlistUrl, folderName, format } = await getUserInput();

  if (playlistUrl.length === 0 || format.length === 0) {
    logger.error('Please insert a download URL');
    return;
  }
  if (!isValidURL(playlistUrl)) {
    logger.error('Invalid URL');
    return;
  }

  if (!isYouTube(playlistUrl)) {
    logger.error('Not a YouTube playlist URL');
    return;
  }

  return downloadPlaylist(format, playlistUrl, folderName);
}

mainTread();
// https://www.youtube.com/playlist?list=PLdLbyXiGXdIjfsHp7PGsVoOGYLMSV0GLF

async function createFolder(folderName) {
  try {
    await fs.access(folderName);
  } catch (error) {
    await fs.mkdir(folderName);
  }
}
