const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const axios = require("axios");
const puppeteer = require("puppeteer");

const url = "https://shimo.im/docs/L9kBBNa8MLFDKokK/read";
const directory = "output/baomu";
let downloadFiles = { js: [], pic: [], css: [] };
let globalPage = null;

async function extractAndSaveImages(htmlContent, saveName) {
  const $ = cheerio.load(htmlContent);
  const imgTags = $("img");
  for (const element of imgTags) {
    const src = $(element).attr("src");
    if (src) {
      downloadFiles.pic.push(src);
    }
  }

  const jsFiles = $("script[src]");
  for (const element of jsFiles) {
    const jsFileUrl = $(element).attr("src");
    downloadFiles.js.push(jsFileUrl);
  }

  const cssFiles = $('link[rel="stylesheet"]');
  for (const element of cssFiles) {
    const cssFileUrl = $(element).attr("href");
    downloadFiles.css.push(cssFileUrl);
  }

  const anchorList = [];
  let anchorTags = $("a");
  anchorTags = anchorTags.filter((index, element) => {
    const href = $(element).attr("href");
    if (href.startsWith("https://shimo.im/docs/")) {
      const random = getRandomString(8);
      anchorList.push({
        url1: href,
        url2: `html/${random}.html`,
        url3: `${random}.html`,
      });
      return true;
    }
    return false;
  });
  console.log("anchorList", anchorList);

  const iframeTags = $("iframe");
  iframeTags.each((index, element) => {
    const src = $(element).attr("src");
    if (src.includes("login")) {
      $(element).remove();
    }
  });

  const loginNodes = $('[type="login"]');
  loginNodes.each((index, element) => {
    $(element).remove();
  });

  htmlContent = $.html();

  anchorList.forEach((item) => {
    if (saveName == "index.html") {
      htmlContent = htmlContent.replace(item.url1, item.url2);
    } else {
      htmlContent = htmlContent.replace(item.url1, item.url3);
    }
  });

  fs.writeFileSync(
    path.join(__dirname + "/" + directory, saveName),
    htmlContent
  );

  for (const anchor of anchorList) {
    const url = anchor.url1;
    await openAndFetchContentByPage(url, anchor.url2);
    // break;
  }
}

async function downloadFile(url, filename) {
  console.log("downloadFile", url, filename);
  try {
    const response = await axios.get(url, {
      responseType: "stream",
      headers: {
        Referer: "https://shimo.im/",
      },
    });
    const path = `${directory}/assets/${filename}`;
    const writer = fs.createWriteStream(path);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
  } catch (error) {
    console.error("Error:", error.message);
  }
}

async function openAndFetchContent(url, saveName) {
  console.log("openAndFetchContent", url, saveName);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const browser = await puppeteer.launch({
    headless: true,
  });
  const page = await browser.newPage();
  globalPage = page;
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(url, { timeout: 60000 });
  const content = await page.content();
  await extractAndSaveImages(content, saveName);
  return content;
}

async function openAndFetchContentByPage(url, saveName) {
  console.log("openAndFetchContentByPage", url, saveName);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const page = globalPage;
  await page.goto(url, { timeout: 60000 });
  const content = await page.content();
  await extractAndSaveImages(content, saveName);
  return content;
}

function getRandomString(length) {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

function traverseFolder(folderPath, fileList) {
  const files = fs.readdirSync(folderPath);
  files.forEach((file) => {
    const filePath = path.join(folderPath, file);
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      traverseFolder(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });
}

function removeDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file) => {
      const filePath = path.join(dirPath, file);

      if (fs.lstatSync(filePath).isDirectory()) {
        removeDirectory(filePath);
      } else {
        fs.unlinkSync(filePath);
      }
    });

    fs.rmdirSync(dirPath);
    console.log(`Successfully removed directory: ${dirPath}`);
  }
}

async function main() {
  console.log("++++++++++++++++++++++ work start ++++++++++++++++++++++");
  downloadFiles = { js: [], pic: [], css: [] };
  removeDirectory(directory);
  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(directory + "/assets", { recursive: true });
  fs.mkdirSync(directory + "/html", { recursive: true });

  await openAndFetchContent(url, "index.html");

  const replaceList = [];
  Object.keys(downloadFiles).forEach((key) => {
    downloadFiles[key] = [...new Set(downloadFiles[key])];
  });
  console.log("downloadFiles", downloadFiles);

  for (let key in downloadFiles) {
    const list = downloadFiles[key];
    for (const src of list) {
      const random = getRandomString(8);
      let fileName = `${random}.${key}`;
      if (key == "pic") {
        fileName = `${random}.jpg`;
      }
      await downloadFile(src, fileName);
      replaceList.push({
        url1: src,
        url2: "./assets/" + fileName,
        url3: "../assets/" + fileName,
      });
    }
  }

  const folderPath = "./output";
  let fileList = [];
  traverseFolder(folderPath, fileList);
  fileList = fileList.filter((filePath) => {
    return filePath.endsWith(".html") || filePath.endsWith(".js");
  });

  fileList.forEach((filePath) => {
    let content = fs.readFileSync(filePath, "utf-8");
    content = content.replace(/crossorigin=['"]anonymous['"]/g, "");
    content = content.replace(
      /setAttribute\(['"]crossorigin['"],['"]anonymous['"]\)/g,
      'setAttribute("no-crossorigin","")'
    );
    replaceList.forEach((item) => {
      if (filePath.includes("index.html")) {
        content = content.replace(item.url1, item.url2);
      } else {
        content = content.replace(item.url1, item.url3);
      }
    });
    fs.writeFileSync(filePath, content);
  });

  console.log("++++++++++++++++++++++ work end ++++++++++++++++++++++");
}

main();
