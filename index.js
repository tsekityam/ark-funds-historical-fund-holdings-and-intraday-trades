const https = require("https");
const fs = require("fs");
const csv = require("fast-csv");
const dateFormat = require("dateformat");
const AWS = require("aws-sdk");
const path = require("path");
const { Client } = require("pg");

/*
usage: node download.js {filename}
*/
const fileName = process.argv[2];

downloadFile(fileName);

// download file from ark-invest.com to ./tmp/
function downloadFile(fileName) {
  const options = {
    hostname: "ark-funds.com",
    path: `/wp-content/fundsiteliterature/csv/${fileName}`,
    headers: {
      Host: "ark-funds.com",
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

  https.get(options, function (response) {
    !fs.existsSync(`tmp`) && fs.mkdirSync(`tmp`);

    const file = fs.createWriteStream(`tmp/${fileName}`);
    response.pipe(file).on("finish", () => {
      console.log(`${fileName} is downloaded to tmp/${fileName}`);
      relocateFile("tmp", fileName);
    });
  });
}

// move the file from ./tmp/ to ./data/{data_date}/raw/
function relocateFile(srcDir, fileName) {
  var date;
  fs.createReadStream(`${srcDir}/${fileName}`)
    .pipe(csv.parse({ headers: true, maxRows: 1 }))
    .on("error", (err) => {
      throw err;
    })
    .on("data", (row) => {
      if (isNaN(new Date(row.date).getTime())) {
        throw new Error(`${row.date} is an invalid date`);
      }
      date = dateFormat(new Date(row.date), "yyyy-mm-dd");
    })
    .on("end", () => {
      console.log(`${srcDir}/${fileName} contains ${date} data`);

      const dstDir = `data/${date}/raw`;

      !fs.existsSync(dstDir) && fs.mkdirSync(dstDir, { recursive: true });
      fs.rename(`${srcDir}/${fileName}`, `${dstDir}/${fileName}`, (err) => {
        if (err) throw err;
        console.log(`${srcDir}/${fileName} is moved to ${dstDir}/${fileName}`);
      });

      processFile(dstDir, `${dstDir}/..`, fileName);
    });
}

// remove invalid rows from file and save the result to ./data/{data_date}/
function processFile(srcDir, dstDir, fileName) {
  const csvStream = csv.format({
    headers: true,
  });
  const ws = fs.createWriteStream(`${dstDir}/${fileName}`);

  csvStream.pipe(ws);

  fs.createReadStream(`${srcDir}/${fileName}`)
    .pipe(csv.parse({ headers: true, ignoreEmpty: true }))
    .on("error", (err) => {
      throw err;
    })
    .on("data", (row) => {
      if (!isNaN(new Date(row.date))) {
        csvStream.write(row);
      }
    })
    .on("end", () => {
      csvStream.end();
      console.log(`${fileName} is processed and saved to ${dstDir}`);
      uploadToS3(
        `${dstDir}/${fileName}`,
        path.relative(`./data`, path.resolve(`${dstDir}/${fileName}`))
      );
    });
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
          'fund_holdings',
          'date,fund,company,ticker,cusip,shares,market_value,weight',
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
