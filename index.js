const { Client } = require("pg");

const pgclient = new Client({
  host: process.env.POSTGRES_HOST,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE,
});

const currentDate = new Date().toISOString().slice(0, 10);

const fileNames = [
  "ARK_AUTONOMOUS_TECHNOLOGY_&_ROBOTICS_ETF_ARKQ_HOLDINGS",
  "ARK_FINTECH_INNOVATION_ETF_ARKF_HOLDINGS",
  "ARK_GENOMIC_REVOLUTION_MULTISECTOR_ETF_ARKG_HOLDINGS",
  "ARK_INNOVATION_ETF_ARKK_HOLDINGS",
  "ARK_ISRAEL_INNOVATIVE_TECHNOLOGY_ETF_IZRL_HOLDINGS",
  "ARK_NEXT_GENERATION_INTERNET_ETF_ARKW_HOLDINGS",
  "THE_3D_PRINTING_ETF_PRNT_HOLDINGS",
];

pgclient.connect();

fileNames.map((fileName) => {
  const copy = `
    SELECT aws_s3.table_import_from_s3(
      'fund_holdings',
      'date,fund,company,ticker,cusip,shares,market_value,weight',
      '(format csv, header true)',
      '${process.env.AWS_S3_BUCKET}',
      '${currentDate}/${fileName}.csv',
      'us-east-1',
      '${process.env.AWS_ACCESS_KEY_ID}',
      '${process.env.AWS_SECRET_ACCESS_KEY}'
    );
    `;

  pgclient.query(copy, (err, res) => {
    if (err) console.error(err);
  });
});

const test = `
SELECT date, fund, count(*)
FROM fund_holdings
WHERE date = '${currentDate}'
GROUP BY date, fund
`;

pgclient.query(test, (err, res) => {
  if (err) throw err;

  if (res.rowCount != fileNames.length)
    throw new Error(
      `Only ${res.rowCount}/${fileNames.length} tables are updated`
    );

  console.log(err, res.rows); // Print the data in student table
  pgclient.end();
});
