const https = require("https");
const fs = require("fs");
const csv = require("fast-csv");
var XLSX = require("xlsx");
const dateFormat = require("dateformat");
const AWS = require("aws-sdk");
const path = require("path");
const { Client } = require("pg");
const { exit } = require("process");

require("dotenv").config();
const argv = require("yargs/yargs")(process.argv.slice(2)).argv;

/*
usage: node intraday-trades.js --https ${HTTPS_URL}
*/
if (argv.https) {
  downloadFile(argv.https);
} else if (argv.file) {
  copyFile(argv.file);
}

// download file from url to ./tmp/
function downloadFile(url) {
  const options = {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; rv:78.0) Gecko/20100101 Firefox/78.0",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Cache-Control": "max-age=0",
    },
  };

  https.get(url, options, function (response) {
    const fileName = path.parse(url).base;

    if (response.statusCode === 302) {
      console.log(`No intraday trades of ${fileName}`);
      exit();
    }

    !fs.existsSync(`tmp`) && fs.mkdirSync(`tmp`);

    const file = fs.createWriteStream(`tmp/${fileName}`);
    response.pipe(file).on("finish", () => {
      console.log(`${fileName} is downloaded to tmp/${fileName}`);
      convertToCSV("tmp", fileName);
    });
  });
}

// copy file from url to ./tmp/
function copyFile(url) {
  const fileName = path.parse(url).base;

  fs.copyFile(url, `tmp/${fileName}`, () => {
    console.log(`${fileName} is copied to tmp/${fileName}`);
    convertToCSV("tmp", fileName);
  });
}

function convertToCSV(srcDir, fileName) {
  var workbook = XLSX.readFile(`${srcDir}/${fileName}`);
  var worksheet = workbook.Sheets[workbook.SheetNames[0]];
  delete worksheet["A1"];
  delete worksheet["A2"];

  const data = XLSX.utils.sheet_to_csv(worksheet, {
    blankrows: false,
    strip: true,
  });
  const basename = path.basename(`${srcDir}/${fileName}`);
  const extname = path.extname(`${srcDir}/${fileName}`);
  fs.writeFile(
    `${srcDir}/${path.basename(basename, extname)}.csv`,
    data,
    function (err) {
      if (err) throw err;
      console.log(`${srcDir}/${fileName} is converted to CSV`);
      relocateFile(srcDir, fileName);
    }
  );
}

// move the files from ./tmp/ to proper location
function relocateFile(srcDir, fileName) {
  var date;

  fs.createReadStream(`${srcDir}/${path.parse(fileName).name}.csv`)
    .pipe(csv.parse({ headers: true, maxRows: 1, ignoreEmpty: true }))
    .on("error", (err) => {
      throw err;
    })
    .on("data", (row) => {
      console.log(row);
      if (isNaN(new Date(row.Date).getTime())) {
        throw new Error(`${row.Date} is an invalid date`);
      }
      date = dateFormat(new Date(row.Date), "yyyy-mm-dd");
    })
    .on("end", () => {
      console.log(`${srcDir}/${fileName} contains ${date} data`);

      _relocateFile(srcDir, `data/${date}/raw`, fileName);
      _relocateFile(srcDir, `data/${date}`, `${path.parse(fileName).name}.csv`);

      uploadToS3(
        `data/${date}/${path.parse(fileName).name}.csv`,
        path.relative(`./data`, path.resolve(`data/${date}/${path.parse(fileName).name}.csv`))
      );
    });
}

function _relocateFile(srcDir, dstDir, fileName) {
  fs.rename(
    `${srcDir}/${fileName}`,
    `${dstDir}/${fileName}`,
    (err) => {
      if (err) throw err;
      console.log(`${srcDir}/${fileName} is moved to ${dstDir}/${fileName}`);
    }
  );
}

function uploadToS3(srcPath, dstPath) {
  AWS.config.update({ region: "us-east-1" });

  // Create S3 service object
  s3 = new AWS.S3({ apiVersion: "2006-03-01" });

  // call S3 to retrieve upload file to specified bucket
  const uploadParams = { Bucket: process.env.AWS_S3_BUCKET, Key: "", Body: "" };
  const file = srcPath;

  // Configure the file stream and obtain the upload parameters
  const fileStream = fs.createReadStream(file);
  fileStream.on("error", function (err) {
    throw err;
  });
  uploadParams.Body = fileStream;
  uploadParams.Key = dstPath;

  // call S3 to retrieve upload file to specified bucket
  s3.upload(uploadParams, function (err, data) {
    if (err) {
      throw err;
    }
    if (data) {
      console.log(`Uploaded ${data.key} to S3`);
      copyToPostgres(data.key);
    }
  });
}

function copyToPostgres(location) {
  const pgclient = new Client({
    ssl: {
      rejectUnauthorized: true,
      ca: fs.readFileSync("rds-combined-ca-bundle.pem").toString(),
    },
  });

  pgclient.connect();

  const copy = `
        SELECT aws_s3.table_import_from_s3(
          'intraday_trades',
          'fund,date,direction,ticker,cusip,name,shares,weight',
          '(format csv, header true)',
          '${process.env.AWS_S3_BUCKET}',
          '${location}',
          'us-east-1',
          '${process.env.AWS_ACCESS_KEY_ID}',
          '${process.env.AWS_SECRET_ACCESS_KEY}'
        );
        `;

  pgclient.query(copy, (err, res) => {
    pgclient.end();
    if (err) {
      if (err.code === "23505") {
        console.log(err.detail);
      } else {
        throw err;
      }
    }

    console.log(`${location} uploaded to Postgres`);
  });
}
